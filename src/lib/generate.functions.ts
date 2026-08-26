/**
 * Stage 8 sub-task 8.2 — AI question generator server functions.
 * Admin-only. Drafts land in the review queue (`content_reviews`, source "ai")
 * rather than being published directly.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GeneratedPreview = {
  scenario: string | null;
  stem: string;
  keyConcept: string | null;
  difficulty: string;
  options: { label: string; text: string; isCorrect: boolean; explanation: string | null }[];
  citations: string[];
  duplicate: boolean;
  questionId?: string;
};

export type GenerateResult = {
  domainTitle: string;
  requested: number;
  generated: number;
  queued: number;
  skipped: number;
  issues: string[];
  drafts: GeneratedPreview[];
};

type Input = {
  domainId: string;
  count: number;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  topicHint?: string | null;
  commit: boolean;
};

export const generateQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => {
    if (!input?.domainId) throw new Error("Pick a domain.");
    const count = Math.min(Math.max(Math.round(Number(input.count) || 3), 1), 8);
    const difficulty = (["easy", "medium", "hard", "mixed"] as const).includes(input.difficulty)
      ? input.difficulty
      : "mixed";
    const hint = typeof input.topicHint === "string" ? input.topicHint.slice(0, 300).trim() : "";
    return { domainId: input.domainId, count, difficulty, topicHint: hint || null, commit: input.commit === true };
  })
  .handler(async ({ data, context }): Promise<GenerateResult> => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { generateQuestionDrafts } = await import("./generate.server");

    const { data: domain, error: dErr } = await supabaseAdmin
      .from("domains")
      .select("id, slug, title, description")
      .eq("id", data.domainId)
      .single();
    if (dErr) throw dErr;

    const { data: existing, error: eErr } = await supabaseAdmin
      .from("questions")
      .select("id, stem, domain_id, sort_order");
    if (eErr) throw eErr;

    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const existingStems = new Set((existing ?? []).map((q) => norm(q.stem)));
    let nextSort = (existing ?? [])
      .filter((q) => q.domain_id === domain.id)
      .reduce((m, q) => Math.max(m, q.sort_order ?? 0), 0);

    const issues: string[] = [];
    const generated = await generateQuestionDrafts({
      domainTitle: domain.title,
      domainSlug: domain.slug,
      domainDescription: domain.description,
      count: data.count,
      difficulty: data.difficulty,
      topicHint: data.topicHint,
    });

    const drafts: GeneratedPreview[] = generated.map((g) => ({
      scenario: g.scenario,
      stem: g.stem,
      keyConcept: g.keyConcept,
      difficulty: g.difficulty,
      options: g.options,
      citations: g.citations,
      duplicate: existingStems.has(norm(g.stem)),
    }));

    if (!data.commit) {
      return {
        domainTitle: domain.title,
        requested: data.count,
        generated: drafts.length,
        queued: 0,
        skipped: drafts.filter((d) => d.duplicate).length,
        issues,
        drafts,
      };
    }

    let queued = 0;
    for (const draft of drafts) {
      if (draft.duplicate) {
        issues.push(`Skipped duplicate stem: ${draft.stem.slice(0, 70)}…`);
        continue;
      }
      nextSort += 1;
      const { data: inserted, error } = await supabaseAdmin
        .from("questions")
        .insert({
          domain_id: domain.id,
          scenario: draft.scenario,
          stem: draft.stem,
          key_concept: draft.keyConcept,
          difficulty: draft.difficulty,
          sort_order: nextSort,
          status: "draft",
          origin: "agentic",
          author_id: context.userId,
        })
        .select("id")
        .single();
      if (error) {
        issues.push(`Insert failed: ${error.message}`);
        continue;
      }

      const { error: optErr } = await supabaseAdmin.from("question_options").insert(
        draft.options.map((o, i) => ({
          question_id: inserted.id,
          label: o.label,
          text: o.text,
          is_correct: o.isCorrect,
          explanation: o.explanation,
          sort_order: i,
        })),
      );
      if (optErr) {
        await supabaseAdmin.from("questions").delete().eq("id", inserted.id);
        issues.push(`Options failed: ${optErr.message}`);
        continue;
      }

      const { error: revErr } = await supabaseAdmin.from("content_reviews").insert({
        question_id: inserted.id,
        status: "pending",
        source: "ai",
        submitted_by: context.userId,
        notes: [
          `AI draft (${data.difficulty})`,
          data.topicHint ? `topic: ${data.topicHint}` : "",
          draft.citations.length ? `sources: ${draft.citations.slice(0, 3).join("; ")}` : "ungrounded",
        ]
          .filter(Boolean)
          .join(" · "),
      });
      if (revErr) issues.push(`Review row failed: ${revErr.message}`);

      draft.questionId = inserted.id;
      existingStems.add(norm(draft.stem));
      queued += 1;
    }

    return {
      domainTitle: domain.title,
      requested: data.count,
      generated: drafts.length,
      queued,
      skipped: drafts.length - queued,
      issues,
      drafts,
    };
  });
