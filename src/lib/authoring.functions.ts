/**
 * Enhancement 2.0 — Phase B/C server functions for agentic authoring.
 * Admin-only. Agent output is always stored as a DRAFT plus a pending review;
 * nothing here publishes content to learners.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw error;
  if (!isAdmin) throw new Error("Forbidden");
}

/* --------------------------- authoring sources --------------------------- */

export type AuthoringSource = {
  id: string;
  label: string;
  host: string;
  url: string | null;
  subject: string;
  domainId: string | null;
  notes: string | null;
  enabled: boolean;
  createdAt: string;
};

export const listAuthoringSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AuthoringSource[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("authoring_sources")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []).map((s: any) => ({
      id: s.id,
      label: s.label,
      host: s.host,
      url: s.url ?? null,
      subject: s.subject,
      domainId: s.domain_id ?? null,
      notes: s.notes ?? null,
      enabled: s.enabled,
      createdAt: s.created_at,
    }));
  });

const SourceInput = z.object({
  label: z.string().min(1).max(120),
  url: z.string().url(),
  domainId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const addAuthoringSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SourceInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const host = new URL(data.url).host;
    const { data: row, error } = await (supabaseAdmin as any)
      .from("authoring_sources")
      .insert({
        label: data.label.trim(),
        host,
        url: data.url,
        domain_id: data.domainId ?? null,
        notes: data.notes?.trim() || null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const setAuthoringSourceEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("authoring_sources")
      .update({ enabled: data.enabled })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteAuthoringSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("authoring_sources")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ------------------------------ authoring run ------------------------------ */

const RunInput = z.object({
  domainId: z.string().uuid(),
  count: z.number().int().min(1).max(5).default(2),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
  topicHint: z.string().max(200).nullable().optional(),
  /** Preview only: do not persist drafts. */
  dryRun: z.boolean().default(false),
});

export type AuthoringRunResult = {
  domainTitle: string;
  runId: string | null;
  evidenceCount: number;
  steps: { agent: string; status: string; detail: string; durationMs: number }[];
  drafts: {
    stem: string;
    scenario: string | null;
    difficulty: string;
    reviewScore: number;
    reviewNotes: string | null;
    adversaryIssues: string[];
    citations: { title: string; url: string | null }[];
    options: { label: string; text: string; isCorrect: boolean; explanation: string | null }[];
    questionId: string | null;
  }[];
  queued: number;
  issues: string[];
};

export const runAgenticAuthoring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RunInput.parse(input))
  .handler(async ({ data, context }): Promise<AuthoringRunResult> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runAuthoringLoop, norm } = await import("./authoring.server");
    const { startRun, logStep, finishRun } = await import("./orchestrator.server");

    const started = Date.now();
    const issues: string[] = [];

    const [{ data: domain, error: dErr }, { data: sources }, { data: bank }] = await Promise.all([
      supabaseAdmin.from("domains").select("id, title, slug, description").eq("id", data.domainId).single(),
      (supabaseAdmin as any).from("authoring_sources").select("label, host, url").eq("enabled", true),
      supabaseAdmin.from("questions").select("id, stem, sort_order").eq("domain_id", data.domainId),
    ]);
    if (dErr) throw dErr;

    // Set-level context: dedupe + answer-position balance + distractor reuse.
    const questionIds = (bank ?? []).map((q: any) => q.id);
    const { data: opts } = questionIds.length
      ? await supabaseAdmin
          .from("question_options")
          .select("question_id, label, text, is_correct")
          .in("question_id", questionIds)
      : { data: [] as any[] };

    const labelCounts: Record<string, number> = {};
    const usedDistractors: string[] = [];
    for (const o of opts ?? []) {
      if (o.is_correct) labelCounts[o.label] = (labelCounts[o.label] ?? 0) + 1;
      else if (usedDistractors.length < 40) usedDistractors.push(o.text.slice(0, 90));
    }

    const runId = await startRun(supabaseAdmin as any, {
      userId: context.userId,
      mode: "authoring",
      question: `Author ${data.count} item(s) for ${domain.title}`,
      metadata: { domainId: domain.id, difficulty: data.difficulty, dryRun: data.dryRun },
    });

    let result;
    try {
      result = await runAuthoringLoop({
        domainTitle: domain.title,
        domainSlug: domain.slug,
        domainDescription: domain.description,
        count: data.count,
        difficulty: data.difficulty,
        topicHint: data.topicHint ?? null,
        allowedSources: (sources ?? []).map((s: any) => ({ label: s.label, host: s.host, url: s.url ?? null })),
        setContext: {
          existingStems: (bank ?? []).map((q: any) => q.stem),
          labelCounts,
          usedDistractors,
        },
      });
    } catch (err) {
      await finishRun({
        runId,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - started,
      });
      throw err;
    }

    let stepIndex = 0;
    for (const s of result.steps) {
      await logStep(supabaseAdmin as any, {
        runId,
        userId: context.userId,
        stepIndex: stepIndex++,
        agent: s.agent as any,
        role: "authoring",
        output: { detail: s.detail },
        status: s.status,
        durationMs: s.durationMs,
      });
    }

    const drafts = result.drafts.map((d) => ({
      stem: d.stem,
      scenario: d.scenario,
      difficulty: d.difficulty,
      reviewScore: d.reviewScore,
      reviewNotes: d.reviewNotes,
      adversaryIssues: d.adversaryIssues,
      citations: d.citations,
      options: d.options,
      questionId: null as string | null,
    }));

    let queued = 0;
    if (!data.dryRun) {
      let nextSort = Math.max(0, ...(bank ?? []).map((q: any) => q.sort_order ?? 0));
      const existing = new Set((bank ?? []).map((q: any) => norm(q.stem)));

      for (let i = 0; i < result.drafts.length; i++) {
        const d = result.drafts[i]!;
        if (existing.has(norm(d.stem))) {
          issues.push(`Skipped duplicate stem: ${d.stem.slice(0, 70)}…`);
          continue;
        }
        nextSort += 1;

        const { data: inserted, error } = await supabaseAdmin
          .from("questions")
          .insert({
            domain_id: domain.id,
            scenario: d.scenario,
            stem: d.stem,
            key_concept: d.keyConcept,
            difficulty: d.difficulty,
            sort_order: nextSort,
            status: "draft",
            origin: "agentic",
            author_id: context.userId,
          } as any)
          .select("id")
          .single();
        if (error) {
          issues.push(`Insert failed: ${error.message}`);
          continue;
        }

        const { error: optErr } = await supabaseAdmin.from("question_options").insert(
          d.options.map((o, idx) => ({
            question_id: inserted.id,
            label: o.label,
            text: o.text,
            is_correct: o.isCorrect,
            explanation: o.explanation,
            sort_order: idx,
          })),
        );
        if (optErr) {
          await supabaseAdmin.from("questions").delete().eq("id", inserted.id);
          issues.push(`Options failed: ${optErr.message}`);
          continue;
        }

        await (supabaseAdmin as any).from("question_drafts").insert({
          domain_id: domain.id,
          base_question_id: inserted.id,
          run_id: runId,
          iteration: d.iteration,
          status: "pending",
          payload: { scenario: d.scenario, stem: d.stem, options: d.options, difficulty: d.difficulty },
          rationale: d.rationale,
          citations: d.citations,
          review_score: d.reviewScore,
          review_notes: d.reviewNotes,
          created_by: context.userId,
        });

        await supabaseAdmin.from("content_reviews").insert({
          question_id: inserted.id,
          status: "pending",
          source: "agentic",
          submitted_by: context.userId,
          notes: [
            `Agentic draft · reviewer ${d.reviewScore}/100`,
            d.adversaryIssues.length ? `adversary: ${d.adversaryIssues.slice(0, 2).join("; ")}` : "adversary: clean",
            d.citations.length ? `sources: ${d.citations.slice(0, 2).map((c) => c.title).join("; ")}` : "ungrounded",
          ].join(" · "),
        });

        existing.add(norm(d.stem));
        drafts[i]!.questionId = inserted.id;
        queued += 1;
      }
    }

    await finishRun({
      runId,
      status: "done",
      finalAnswer: `${queued} draft(s) queued for review`,
      durationMs: Date.now() - started,
      metadata: { queued, generated: result.drafts.length },
    });

    return {
      domainTitle: domain.title,
      runId,
      evidenceCount: result.evidenceCount,
      steps: result.steps,
      drafts,
      queued,
      issues,
    };
  });
