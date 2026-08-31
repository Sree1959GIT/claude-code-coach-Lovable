/**
 * Enhancement 2.0 — Phase B/C server functions for agentic authoring.
 * Admin-only. Agent output is always stored as a DRAFT plus a pending review;
 * nothing here publishes content to learners.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function hasRole(context: { supabase: any; userId: string }, role: string) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: role });
  if (error) throw error;
  return Boolean(data);
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  if (!(await hasRole(context, "admin"))) throw new Error("Forbidden");
}

/** C8 — authoring is open to admins and users granted the `author` role. */
async function assertAuthor(context: { supabase: any; userId: string }) {
  if ((await hasRole(context, "admin")) || (await hasRole(context, "author"))) return;
  throw new Error("Forbidden");
}

/** C8 — review decisions are open to admins and users granted `reviewer`. */
async function assertReviewer(context: { supabase: any; userId: string }) {
  if ((await hasRole(context, "admin")) || (await hasRole(context, "reviewer"))) return;
  throw new Error("Forbidden");
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
  lastCheckedAt: string | null;
  lastStatus: string | null;
  createdAt: string;
  /** G3 — credential state. The secret itself is never returned. */
  authType: "none" | "bearer" | "header" | "basic" | "cookie";
  hasCredential: boolean;
  credentialUpdatedAt: string | null;
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

    const ids = (data ?? []).map((s: any) => s.id);
    const credMap = new Map<string, { authType: string; hasSecret: boolean; updatedAt: string }>();
    if (ids.length) {
      const { data: creds } = await (supabaseAdmin as any)
        .from("authoring_source_credentials")
        .select("source_id, auth_type, secret_value, updated_at")
        .in("source_id", ids);
      for (const c of creds ?? []) {
        credMap.set(c.source_id, {
          authType: c.auth_type,
          hasSecret: Boolean(c.secret_value),
          updatedAt: c.updated_at,
        });
      }
    }

    return (data ?? []).map((s: any) => {
      const cred = credMap.get(s.id);
      return {
        id: s.id,
        label: s.label,
        host: s.host,
        url: s.url ?? null,
        subject: s.subject,
        domainId: s.domain_id ?? null,
        notes: s.notes ?? null,
        enabled: s.enabled,
        lastCheckedAt: s.last_checked_at ?? null,
        lastStatus: s.last_status ?? null,
        createdAt: s.created_at,
        authType: (cred?.authType ?? "none") as AuthoringSource["authType"],
        hasCredential: Boolean(cred?.hasSecret),
        credentialUpdatedAt: cred?.updatedAt ?? null,
      };
    });
  });

/* ------------------- G3: credentialed access to sources ------------------- */

const CredentialInput = z.object({
  sourceId: z.string().uuid(),
  authType: z.enum(["none", "bearer", "header", "basic", "cookie"]),
  headerName: z.string().max(80).nullable().optional(),
  username: z.string().max(160).nullable().optional(),
  /** Write-only. Omit to keep the stored secret unchanged. */
  secretValue: z.string().max(8000).nullable().optional(),
});

/** Store or update the credential used to fetch a gated source. */
export const setSourceCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CredentialInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    if (data.authType === "header" && !data.headerName?.trim()) {
      throw new Error("A header name is required for custom-header auth");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await (supabaseAdmin as any)
      .from("authoring_source_credentials")
      .select("id, secret_value")
      .eq("source_id", data.sourceId)
      .maybeSingle();

    const secret =
      data.secretValue === undefined || data.secretValue === null || data.secretValue === ""
        ? (existing?.secret_value ?? null)
        : data.secretValue;

    if (data.authType !== "none" && !secret) {
      throw new Error("A secret value is required for this authentication type");
    }

    const row = {
      source_id: data.sourceId,
      auth_type: data.authType,
      header_name: data.headerName?.trim() || null,
      username: data.username?.trim() || null,
      secret_value: data.authType === "none" ? null : secret,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };

    const { error } = existing
      ? await (supabaseAdmin as any)
          .from("authoring_source_credentials")
          .update(row)
          .eq("id", existing.id)
      : await (supabaseAdmin as any).from("authoring_source_credentials").insert(row);
    if (error) throw error;

    await (supabaseAdmin as any)
      .from("authoring_sources")
      .update({ requires_auth: data.authType !== "none" })
      .eq("id", data.sourceId);

    return { ok: true };
  });

/** Remove a stored credential entirely. */
export const clearSourceCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sourceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("authoring_source_credentials")
      .delete()
      .eq("source_id", data.sourceId);
    if (error) throw error;
    await (supabaseAdmin as any)
      .from("authoring_sources")
      .update({ requires_auth: false })
      .eq("id", data.sourceId);
    return { ok: true };
  });

/**
 * G3 — fetch a (possibly gated) URL with the stored credential and ingest the
 * readable text into the RAG library.
 */
export const ingestSourceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sourceId: z.string().uuid().nullable().optional(),
        url: z.string().url(),
        title: z.string().max(200).nullable().optional(),
        tags: z.array(z.string().max(60)).max(20).default([]),
        force: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { fetchWithCredentials, htmlToText, extractTitle, loadCredential } = await import(
      "./source-fetch.server"
    );
    const credential = data.sourceId ? await loadCredential(data.sourceId) : undefined;
    const res = await fetchWithCredentials(data.url, credential !== undefined ? { credential } : {});

    if (!res.ok) {
      const hint =
        res.status === 401 || res.status === 403
          ? " — the stored credential was rejected or is missing."
          : "";
      throw new Error(`Fetch failed: HTTP ${res.status} ${res.statusText}${hint}`);
    }

    const text = res.contentType.includes("html") ? htmlToText(res.body) : res.body.trim();
    if (text.length < 200) throw new Error("Fetched page had too little readable text to ingest");

    const { ingestOne } = await import("./ingest.server");
    const host = new URL(data.url).host;
    const result = await ingestOne({
      title: data.title?.trim() || extractTitle(res.body, data.url),
      source: host,
      url: data.url,
      kind: "doc",
      tags: Array.from(new Set([...data.tags, "authenticated-fetch"])),
      content: text,
      force: data.force,
    });

    return {
      ...result,
      authenticated: res.authenticated,
      chars: text.length,
      status: `HTTP ${res.status} · ${res.durationMs}ms`,
    };
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

/** C7 — edit an existing approved source (label, url/host, domain, notes). */
export const updateAuthoringSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        label: z.string().min(1).max(120).optional(),
        url: z.string().url().optional(),
        domainId: z.string().uuid().nullable().optional(),
        notes: z.string().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    if (data.label !== undefined) patch['label'] = data.label.trim();
    if (data.url !== undefined) {
      patch['url'] = data.url;
      patch['host'] = new URL(data.url).host;
    }
    if (data.domainId !== undefined) patch['domain_id'] = data.domainId;
    if (data.notes !== undefined) patch['notes'] = data.notes?.trim() || null;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await (supabaseAdmin as any)
      .from("authoring_sources")
      .update(patch)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export type SourceTestResult = {
  id: string;
  ok: boolean;
  status: string;
  checkedAt: string;
};

/** C7 — test-fetch a source URL and record reachability on the row. */
export const testAuthoringSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<SourceTestResult> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("authoring_sources")
      .select("id, url, host")
      .eq("id", data.id)
      .single();
    if (error) throw error;

    const target: string | null = row.url ?? (row.host ? `https://${row.host}/` : null);
    let ok = false;
    let status = "no url configured";

    if (target) {
      const { fetchWithCredentials, loadCredential } = await import("./source-fetch.server");
      try {
        const credential = await loadCredential(data.id);
        let res = await fetchWithCredentials(target, { credential, method: "HEAD", maxBytes: 1 });
        if (res.status === 405 || res.status === 501) {
          res = await fetchWithCredentials(target, { credential, maxBytes: 1000 });
        }
        ok = res.ok;
        const authNote =
          res.status === 401 || res.status === 403
            ? res.authenticated
              ? " (credential rejected)"
              : " (authentication required)"
            : res.authenticated
              ? " (authenticated)"
              : "";
        status = `HTTP ${res.status}${authNote} · ${res.durationMs}ms`;
      } catch (e) {
        ok = false;
        status = `unreachable: ${(e as Error).message.slice(0, 120)}`;
      }
    }

    const checkedAt = new Date().toISOString();
    await (supabaseAdmin as any)
      .from("authoring_sources")
      .update({ last_checked_at: checkedAt, last_status: status })
      .eq("id", data.id);

    return { id: data.id, ok, status, checkedAt };
  });



/* ------------------------------ authoring run ------------------------------ */

const RunInput = z.object({
  domainId: z.string().uuid(),
  count: z.number().int().min(1).max(10).default(2),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
  topicHint: z.string().max(200).nullable().optional(),
  /** B7 edit mode: revise this existing question instead of authoring new items. */
  baseQuestionId: z.string().uuid().nullable().optional(),
  revisionNotes: z.string().max(1000).nullable().optional(),
  /** Preview only: do not persist drafts. */
  dryRun: z.boolean().default(false),
});

/** One authored item returned to the admin UI (C6: accept/reject per item). */
export type AuthoringRunDraft = {
  stem: string;
  scenario: string | null;
  keyConcept: string | null;
  difficulty: string;
  reviewScore: number;
  reviewNotes: string | null;
  rationale: string | null;
  iteration: number;
  adversaryIssues: string[];
  citations: { title: string; url: string | null }[];
  options: { label: string; text: string; isCorrect: boolean; explanation: string | null }[];
  questionId: string | null;
  /** Populated in edit mode: field-level changes against the live question. */
  diff: { field: string; before: string; after: string }[];
  isRevision: boolean;
  /** Nearest existing bank question above the similarity threshold, if any. */
  duplicate: { questionId: string; stem: string; domainTitle: string; similarity: number } | null;
};

export type AuthoringRunResult = {
  domainTitle: string;
  runId: string | null;
  evidenceCount: number;
  steps: { agent: string; status: string; detail: string; durationMs: number }[];
  drafts: AuthoringRunDraft[];
  queued: number;
  issues: string[];
};


export const runAgenticAuthoring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RunInput.parse(input))
  .handler(async ({ data, context }): Promise<AuthoringRunResult> => {
    await assertAuthor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runAuthoringLoop, norm, diffQuestion, findNearDuplicate, persistAuthoredDraft } = await import(
      "./authoring.server"
    );
    const { startRun, logStep, finishRun } = await import("./orchestrator.server");

    const started = Date.now();
    const issues: string[] = [];

    const [{ data: domain, error: dErr }, { data: sources }, { data: bank }, { data: allBank }, { data: allDomains }] =
      await Promise.all([
        supabaseAdmin.from("domains").select("id, title, slug, description").eq("id", data.domainId).single(),
        (supabaseAdmin as any).from("authoring_sources").select("label, host, url").eq("enabled", true),
        supabaseAdmin.from("questions").select("id, stem, sort_order").eq("domain_id", data.domainId),
        // C6 — duplicate detection runs against the whole bank, not just this domain.
        supabaseAdmin.from("questions").select("id, stem, domain_id").limit(2000),
        supabaseAdmin.from("domains").select("id, title"),
      ]);
    if (dErr) throw dErr;

    const domainTitles = new Map((allDomains ?? []).map((d: any) => [d.id, d.title as string]));
    const bankItems = (allBank ?? []).map((q: any) => ({
      id: q.id as string,
      stem: q.stem as string,
      domainTitle: domainTitles.get(q.domain_id) ?? "—",
    }));

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

    // B7 edit mode — seed the loop with the live question.
    let baseQuestion:
      | { scenario: string | null; stem: string; keyConcept: string | null; difficulty: string; options: any[] }
      | null = null;
    if (data.baseQuestionId) {
      const [{ data: bq, error: bqErr }, { data: bqOpts }] = await Promise.all([
        supabaseAdmin
          .from("questions")
          .select("id, scenario, stem, key_concept, difficulty")
          .eq("id", data.baseQuestionId)
          .single(),
        supabaseAdmin
          .from("question_options")
          .select("label, text, is_correct, explanation, sort_order")
          .eq("question_id", data.baseQuestionId)
          .order("sort_order"),
      ]);
      if (bqErr) throw bqErr;
      baseQuestion = {
        scenario: bq.scenario,
        stem: bq.stem,
        keyConcept: bq.key_concept,
        difficulty: bq.difficulty,
        options: (bqOpts ?? []).map((o: any) => ({
          label: o.label,
          text: o.text,
          isCorrect: o.is_correct,
          explanation: o.explanation ?? null,
        })),
      };
    }

    const runId = await startRun(supabaseAdmin as any, {
      userId: context.userId,
      mode: "authoring",
      question: baseQuestion
        ? `Revise question for ${domain.title}`
        : `Author ${data.count} item(s) for ${domain.title}`,
      metadata: {
        domainId: domain.id,
        difficulty: data.difficulty,
        dryRun: data.dryRun,
        baseQuestionId: data.baseQuestionId ?? null,
      },
    });

    let result;
    try {
      result = await runAuthoringLoop({
        domainTitle: domain.title,
        domainSlug: domain.slug,
        domainDescription: domain.description,
        count: baseQuestion ? 1 : data.count,
        difficulty: data.difficulty,
        topicHint: data.topicHint ?? null,
        allowedSources: (sources ?? []).map((s: any) => ({ label: s.label, host: s.host, url: s.url ?? null })),
        setContext: {
          existingStems: (bank ?? []).map((q: any) => q.stem),
          labelCounts,
          usedDistractors,
        },
        baseQuestion: baseQuestion as any,
        revisionNotes: data.revisionNotes ?? null,
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

    const drafts: AuthoringRunDraft[] = result.drafts.map((d) => ({
      stem: d.stem,
      scenario: d.scenario as string | null,
      keyConcept: d.keyConcept as string | null,
      difficulty: d.difficulty as string,
      reviewScore: d.reviewScore,
      reviewNotes: d.reviewNotes,
      rationale: d.rationale,
      iteration: d.iteration,
      adversaryIssues: d.adversaryIssues,
      citations: d.citations,
      options: d.options,
      questionId: null as string | null,
      diff: baseQuestion
        ? diffQuestion(baseQuestion as any, {
            scenario: d.scenario,
            stem: d.stem,
            keyConcept: d.keyConcept,
            difficulty: d.difficulty,
            options: d.options,
          })
        : [],
      isRevision: Boolean(baseQuestion),
      duplicate: baseQuestion
        ? null
        : findNearDuplicate(
            d.stem,
            bankItems.filter((b) => b.id !== data.baseQuestionId),
          ),
    }));


    let queued = 0;

    // Edit mode persists a revision proposal only — the live question is untouched
    // until a human accepts the revision in the review workspace.
    if (!data.dryRun && baseQuestion && data.baseQuestionId) {
      // C9 — idempotent: an identical pending revision proposal is not re-queued.
      const { data: pendingRevisions } = await (supabaseAdmin as any)
        .from("question_drafts")
        .select("id, payload")
        .eq("base_question_id", data.baseQuestionId)
        .eq("status", "pending");
      const alreadyProposed = new Set(
        ((pendingRevisions ?? []) as any[])
          .filter((r) => r.payload?.revision === true && typeof r.payload?.stem === "string")
          .map((r) => norm(r.payload.stem as string)),
      );

      for (const d of result.drafts) {
        if (alreadyProposed.has(norm(d.stem))) {
          issues.push("Identical revision proposal is already pending review — not queued again.");
          continue;
        }
        const { error: dErr2 } = await (supabaseAdmin as any).from("question_drafts").insert({
          domain_id: domain.id,
          base_question_id: data.baseQuestionId,
          run_id: runId,
          iteration: d.iteration,
          status: "pending",
          payload: {
            revision: true,
            scenario: d.scenario,
            stem: d.stem,
            keyConcept: d.keyConcept,
            difficulty: d.difficulty,
            options: d.options,
          },
          rationale: d.rationale,
          citations: d.citations,
          review_score: d.reviewScore,
          review_notes: d.reviewNotes,
          created_by: context.userId,
        });
        if (dErr2) {
          issues.push(`Revision draft failed: ${dErr2.message}`);
          continue;
        }
        alreadyProposed.add(norm(d.stem));
        queued += 1;
      }
      drafts.forEach((x) => {
        x.questionId = data.baseQuestionId ?? null;
      });
    }


    if (!data.dryRun && !baseQuestion) {
      let nextSort = Math.max(0, ...(bank ?? []).map((q: any) => q.sort_order ?? 0));
      const existing = new Set((bank ?? []).map((q: any) => norm(q.stem)));

      for (let i = 0; i < result.drafts.length; i++) {
        const d = result.drafts[i]!;
        if (existing.has(norm(d.stem))) {
          issues.push(`Skipped duplicate stem: ${d.stem.slice(0, 70)}…`);
          continue;
        }
        const dup = drafts[i]?.duplicate;
        if (dup && dup.similarity >= 0.85) {
          issues.push(`Skipped near-duplicate (${dup.similarity}) of: ${dup.stem.slice(0, 60)}…`);
          continue;
        }
        nextSort += 1;

        const { questionId, error, deduped } = await persistAuthoredDraft(supabaseAdmin as any, {
          domainId: domain.id,
          runId,
          userId: context.userId,
          sortOrder: nextSort,
          draft: d,
        });
        if (error || !questionId) {
          issues.push(error ?? "Insert failed");
          continue;
        }

        existing.add(norm(d.stem));
        drafts[i]!.questionId = questionId;
        if (deduped) {
          issues.push(`Already in the bank — reused existing draft: ${d.stem.slice(0, 60)}…`);
          continue;
        }
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

/* ------------------------- draft review workspace ------------------------- */

export type ProposedQuestion = {
  scenario: string | null;
  stem: string;
  keyConcept: string | null;
  difficulty: string;
  options: { label: string; text: string; isCorrect: boolean; explanation: string | null }[];
};

export type DraftReviewItem = {
  reviewId: string;
  /** Set for revision proposals; the live question is untouched until accepted. */
  draftId: string | null;
  kind: "new" | "revision";
  questionId: string;
  status: string;
  source: string;
  notes: string | null;
  createdAt: string;
  domainId: string | null;
  domainTitle: string;
  scenario: string | null;
  stem: string;
  keyConcept: string | null;
  difficulty: string;
  questionStatus: string;
  origin: string;
  options: { id: string; label: string; text: string; isCorrect: boolean; explanation: string | null }[];
  /** Proposed revision content plus the field-level diff against the live question. */
  proposed: ProposedQuestion | null;
  diff: { field: string; before: string; after: string }[];
  /** C5 — claim-to-review assignment. */
  claimedBy: string | null;
  claimedByName: string | null;
  claimedByMe: boolean;
  claimedAt: string | null;
  /** Agentic provenance, when the draft came from the authoring loop. */
  rationale: string | null;
  reviewScore: number | null;
  reviewNotes: string | null;
  iteration: number | null;
  runId: string | null;
  citations: { title: string; url: string | null }[];
};

const ReviewFilter = z
  .object({
    status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
    domainId: z.string().uuid().nullable().optional(),
    mine: z.boolean().default(false),
  })
  .default({ status: "pending", mine: false });

/** Full detail for every review and revision proposal matching the filter. */
export const listDraftReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReviewFilter.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<DraftReviewItem[]> => {
    await assertReviewer(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { diffQuestion } = await import("./authoring.server");

    let reviewQuery = supabaseAdmin
      .from("content_reviews")
      .select("id, question_id, status, source, notes, created_at, claimed_by, claimed_at");
    let draftQuery = (supabaseAdmin as any)
      .from("question_drafts")
      .select(
        "id, base_question_id, payload, rationale, review_score, review_notes, iteration, run_id, citations, created_at, status, claimed_by, claimed_at",
      );
    if (data.status !== "all") {
      reviewQuery = reviewQuery.eq("status", data.status);
      draftQuery = draftQuery.eq("status", data.status);
    }

    const [reviewsRes, pendingDraftsRes] = await Promise.all([
      reviewQuery.order("created_at", { ascending: false }).limit(100),
      draftQuery.order("created_at", { ascending: false }).limit(100),
    ]);
    if (reviewsRes.error) throw reviewsRes.error;


    const rows = reviewsRes.data ?? [];
    const allDrafts: any[] = (pendingDraftsRes as any).data ?? [];
    const revisionDrafts = allDrafts.filter((d) => d.payload?.revision === true && d.base_question_id);
    const draftBy = new Map(allDrafts.filter((d) => !d.payload?.revision).map((d) => [d.base_question_id, d]));

    const ids = [
      ...new Set([...rows.map((r) => r.question_id), ...revisionDrafts.map((d) => d.base_question_id as string)]),
    ];
    if (ids.length === 0) return [];

    const [questionsRes, optionsRes, domainsRes] = await Promise.all([
      supabaseAdmin
        .from("questions")
        .select("id, domain_id, scenario, stem, key_concept, difficulty, status, origin")
        .in("id", ids),
      supabaseAdmin
        .from("question_options")
        .select("id, question_id, label, text, is_correct, explanation, sort_order")
        .in("question_id", ids)
        .order("sort_order"),
      supabaseAdmin.from("domains").select("id, title"),
    ]);
    for (const r of [questionsRes, optionsRes, domainsRes]) {
      if (r.error) throw r.error;
    }

    const domainTitle = new Map((domainsRes.data ?? []).map((d) => [d.id, d.title as string]));
    const questionById = new Map((questionsRes.data ?? []).map((q: any) => [q.id, q]));
    const optionsBy = new Map<string, DraftReviewItem["options"]>();
    for (const o of optionsRes.data ?? []) {
      const list = optionsBy.get(o.question_id) ?? [];
      list.push({
        id: o.id,
        label: o.label,
        text: o.text,
        isCorrect: o.is_correct,
        explanation: o.explanation,
      });
      optionsBy.set(o.question_id, list);
    }

    const claimIds = [
      ...new Set(
        [...rows.map((r: any) => r.claimed_by), ...revisionDrafts.map((d: any) => d.claimed_by)].filter(
          Boolean,
        ) as string[],
      ),
    ];
    const claimNames = new Map<string, string>();
    if (claimIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", claimIds);
      for (const p of profs ?? []) claimNames.set(p.id, p.display_name ?? "reviewer");
    }

    const claim = (claimedBy: string | null, claimedAt: string | null) => ({
      claimedBy: claimedBy ?? null,
      claimedByName: claimedBy ? (claimNames.get(claimedBy) ?? "reviewer") : null,
      claimedByMe: claimedBy === context.userId,
      claimedAt: claimedAt ?? null,
    });

    const base = (questionId: string, d: any) => {
      const q: any = questionById.get(questionId);
      return {
        questionId,
        domainId: q?.domain_id ?? null,
        domainTitle: (q && domainTitle.get(q.domain_id)) ?? "—",
        scenario: q?.scenario ?? null,
        stem: q?.stem ?? "(question deleted)",
        keyConcept: q?.key_concept ?? null,
        difficulty: q?.difficulty ?? "—",
        questionStatus: q?.status ?? "unknown",
        origin: q?.origin ?? "manual",
        options: optionsBy.get(questionId) ?? [],
        rationale: d?.rationale ?? null,
        reviewScore: d?.review_score != null ? Number(d.review_score) : null,
        reviewNotes: d?.review_notes ?? null,
        iteration: d?.iteration ?? null,
        runId: d?.run_id ?? null,
        citations: Array.isArray(d?.citations) ? (d.citations as { title: string; url: string | null }[]) : [],
      };
    };

    const items: DraftReviewItem[] = rows.map((r: any) => ({
      reviewId: r.id,
      draftId: null,
      kind: "new" as const,
      status: r.status,
      source: r.source,
      notes: r.notes,
      createdAt: r.created_at,
      proposed: null,
      diff: [],
      ...claim(r.claimed_by ?? null, r.claimed_at ?? null),
      ...base(r.question_id, draftBy.get(r.question_id)),
    }));

    for (const d of revisionDrafts) {
      const b = base(d.base_question_id, d);
      const proposed: ProposedQuestion = {
        scenario: d.payload?.scenario ?? null,
        stem: String(d.payload?.stem ?? ""),
        keyConcept: d.payload?.keyConcept ?? null,
        difficulty: String(d.payload?.difficulty ?? b.difficulty),
        options: Array.isArray(d.payload?.options) ? d.payload.options : [],
      };
      items.push({
        reviewId: `draft:${d.id}`,
        draftId: d.id,
        kind: "revision",
        status: d.status ?? "pending",
        source: "agentic",
        notes: null,
        createdAt: d.created_at,
        proposed,
        diff: diffQuestion(
          {
            scenario: b.scenario,
            stem: b.stem,
            keyConcept: b.keyConcept,
            difficulty: b.difficulty,
            options: b.options.map((o) => ({
              label: o.label,
              text: o.text,
              isCorrect: o.isCorrect,
              explanation: o.explanation,
            })),
          },
          proposed as any,
        ),
        ...claim(d.claimed_by ?? null, d.claimed_at ?? null),
        ...b,
      });
    }

    const filtered = items
      .filter((i) => (data.domainId ? i.domainId === data.domainId : true))
      .filter((i) => (data.mine ? i.claimedByMe : true));

    return filtered.sort((a, b2) => (a.createdAt < b2.createdAt ? 1 : -1));
  });

/** C5 — claim or release a queue item so reviewers do not collide. */
export const claimReviewItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reviewId: z.string().uuid().nullable().optional(),
        draftId: z.string().uuid().nullable().optional(),
        claim: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertReviewer(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch = data.claim
      ? { claimed_by: context.userId, claimed_at: new Date().toISOString() }
      : { claimed_by: null, claimed_at: null };

    if (data.draftId) {
      const { data: row, error } = await (supabaseAdmin as any)
        .from("question_drafts")
        .select("claimed_by")
        .eq("id", data.draftId)
        .single();
      if (error) throw error;
      if (row.claimed_by && row.claimed_by !== context.userId) {
        throw new Error("Already claimed by another reviewer.");
      }
      const { error: uErr } = await (supabaseAdmin as any)
        .from("question_drafts")
        .update(patch)
        .eq("id", data.draftId);
      if (uErr) throw uErr;
      return { ok: true };
    }

    if (!data.reviewId) throw new Error("Nothing to claim.");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("content_reviews")
      .select("claimed_by")
      .eq("id", data.reviewId)
      .single();
    if (error) throw error;
    if (row.claimed_by && row.claimed_by !== context.userId) {
      throw new Error("Already claimed by another reviewer.");
    }
    const { error: uErr } = await (supabaseAdmin as any)
      .from("content_reviews")
      .update(patch)
      .eq("id", data.reviewId);
    if (uErr) throw uErr;
    return { ok: true };
  });


/* --------------------- inline editing + revision decisions --------------------- */

const EditInput = z.object({
  questionId: z.string().uuid(),
  scenario: z.string().nullable().optional(),
  stem: z.string().min(5),
  keyConcept: z.string().nullable().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  options: z
    .array(
      z.object({
        id: z.string().uuid().nullable().optional(),
        label: z.string().min(1).max(4),
        text: z.string().min(1),
        isCorrect: z.boolean(),
        explanation: z.string().nullable().optional(),
      }),
    )
    .min(2),
});

/** C4 — save reviewer edits onto a draft question before it is published. */
export const updateDraftQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EditInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertReviewer(context);
    if (data.options.filter((o) => o.isCorrect).length !== 1) {
      throw new Error("Exactly one option must be marked correct.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: qErr } = await supabaseAdmin
      .from("questions")
      .update({
        scenario: data.scenario?.trim() || null,
        stem: data.stem.trim(),
        key_concept: data.keyConcept?.trim() || null,
        difficulty: data.difficulty,
      })
      .eq("id", data.questionId);
    if (qErr) throw qErr;

    const { data: current, error: oErr } = await supabaseAdmin
      .from("question_options")
      .select("id, label")
      .eq("question_id", data.questionId);
    if (oErr) throw oErr;
    const byLabel = new Map((current ?? []).map((o) => [o.label, o.id]));

    let sort = 0;
    for (const o of data.options) {
      const existingId = o.id ?? byLabel.get(o.label) ?? null;
      const payload = {
        question_id: data.questionId,
        label: o.label,
        text: o.text.trim(),
        is_correct: o.isCorrect,
        explanation: o.explanation?.trim() || null,
        sort_order: sort++,
      };
      const { error } = existingId
        ? await supabaseAdmin.from("question_options").update(payload).eq("id", existingId)
        : await supabaseAdmin.from("question_options").insert(payload);
      if (error) throw error;
    }
    return { ok: true };
  });

/** C4/B7 — accept or reject a proposed revision against a live question. */
export const resolveDraftRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        draftId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        notes: z.string().max(1000).nullable().optional(),
        /** Reviewer-edited content to apply instead of the raw proposal. */
        edits: EditInput.nullable().optional(),
        /** C8 — explicit override when the reviewer also authored the draft. */
        allowSelfReview: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertReviewer(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: draft, error } = await (supabaseAdmin as any)
      .from("question_drafts")
      .select("id, base_question_id, payload, created_by")
      .eq("id", data.draftId)
      .single();
    if (error) throw error;

    // C8 — reviewer should not be the author of the same item.
    if (draft.created_by && draft.created_by === context.userId && !data.allowSelfReview) {
      throw new Error("You authored this draft — a different reviewer should decide it.");
    }


    if (data.decision === "approved") {
      const p = data.edits ?? {
        questionId: draft.base_question_id as string,
        scenario: draft.payload?.scenario ?? null,
        stem: String(draft.payload?.stem ?? ""),
        keyConcept: draft.payload?.keyConcept ?? null,
        difficulty: (["easy", "medium", "hard"].includes(String(draft.payload?.difficulty))
          ? draft.payload.difficulty
          : "medium") as "easy" | "medium" | "hard",
        options: (Array.isArray(draft.payload?.options) ? draft.payload.options : []).map((o: any) => ({
          id: null,
          label: String(o.label),
          text: String(o.text),
          isCorrect: o.isCorrect === true,
          explanation: o.explanation ?? null,
        })),
      };
      if (!p.stem || p.options.length < 2) throw new Error("Revision payload is incomplete.");
      if (p.options.filter((o: any) => o.isCorrect).length !== 1) {
        throw new Error("Exactly one option must be marked correct.");
      }

      const { error: qErr } = await supabaseAdmin
        .from("questions")
        .update({
          scenario: p.scenario?.trim() || null,
          stem: p.stem.trim(),
          key_concept: p.keyConcept?.trim() || null,
          difficulty: p.difficulty,
        })
        .eq("id", draft.base_question_id);
      if (qErr) throw qErr;

      const { data: current, error: oErr } = await supabaseAdmin
        .from("question_options")
        .select("id, label")
        .eq("question_id", draft.base_question_id);
      if (oErr) throw oErr;
      const byLabel = new Map((current ?? []).map((o) => [o.label, o.id]));

      let sort = 0;
      for (const o of p.options) {
        const payload = {
          question_id: draft.base_question_id,
          label: o.label,
          text: String(o.text).trim(),
          is_correct: o.isCorrect,
          explanation: o.explanation?.trim() || null,
          sort_order: sort++,
        };
        const existingId = byLabel.get(o.label) ?? null;
        const { error: upErr } = existingId
          ? await supabaseAdmin.from("question_options").update(payload).eq("id", existingId)
          : await supabaseAdmin.from("question_options").insert(payload);
        if (upErr) throw upErr;
      }
    }

    const { error: dErr } = await (supabaseAdmin as any)
      .from("question_drafts")
      .update({ status: data.decision, review_notes: data.notes?.trim() || null })
      .eq("id", data.draftId);
    if (dErr) throw dErr;

    return { ok: true };
  });


/* --------------------- C6 — per-item accept from a batch --------------------- */

const QueueDraftsInput = z.object({
  domainId: z.string().uuid(),
  runId: z.string().uuid().nullable().optional(),
  /** Only the items the admin accepted in the preview batch. */
  drafts: z
    .array(
      z.object({
        scenario: z.string().nullable().default(null),
        stem: z.string().min(10),
        keyConcept: z.string().nullable().default(null),
        difficulty: z.string().default("medium"),
        rationale: z.string().nullable().default(null),
        reviewScore: z.number().default(0),
        reviewNotes: z.string().nullable().default(null),
        iteration: z.number().int().default(1),
        adversaryIssues: z.array(z.string()).default([]),
        citations: z.array(z.object({ title: z.string(), url: z.string().nullable() })).default([]),
        options: z
          .array(
            z.object({
              label: z.string(),
              text: z.string().min(1),
              isCorrect: z.boolean(),
              explanation: z.string().nullable().default(null),
            }),
          )
          .min(2),
      }),
    )
    .min(1)
    .max(10),
  /** Accept even when a near-duplicate exists in the bank. */
  allowDuplicates: z.boolean().default(false),
});

export type QueueDraftsResult = {
  queued: number;
  skipped: { stem: string; reason: string }[];
};

/** Queue only the accepted items of a preview batch as drafts + pending reviews. */
export const queueAuthoredDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => QueueDraftsInput.parse(input))
  .handler(async ({ data, context }): Promise<QueueDraftsResult> => {
    await assertAuthor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { norm, findNearDuplicate, persistAuthoredDraft } = await import("./authoring.server");

    const [{ data: bank }, { data: allBank }, { data: allDomains }] = await Promise.all([
      supabaseAdmin.from("questions").select("id, stem, sort_order").eq("domain_id", data.domainId),
      supabaseAdmin.from("questions").select("id, stem, domain_id").limit(2000),
      supabaseAdmin.from("domains").select("id, title"),
    ]);

    const titles = new Map((allDomains ?? []).map((d: any) => [d.id, d.title as string]));
    const bankItems = (allBank ?? []).map((q: any) => ({
      id: q.id as string,
      stem: q.stem as string,
      domainTitle: titles.get(q.domain_id) ?? "—",
    }));

    let nextSort = Math.max(0, ...(bank ?? []).map((q: any) => q.sort_order ?? 0));
    const existing = new Set((bank ?? []).map((q: any) => norm(q.stem)));
    const skipped: { stem: string; reason: string }[] = [];
    let queued = 0;

    for (const d of data.drafts) {
      if (existing.has(norm(d.stem))) {
        skipped.push({ stem: d.stem, reason: "Exact duplicate stem already in the bank" });
        continue;
      }
      if (!data.allowDuplicates) {
        const dup = findNearDuplicate(d.stem, bankItems, 0.85);
        if (dup) {
          skipped.push({ stem: d.stem, reason: `Near-duplicate (${dup.similarity}) of "${dup.stem.slice(0, 60)}…"` });
          continue;
        }
      }
      nextSort += 1;
      const { questionId, error, deduped } = await persistAuthoredDraft(supabaseAdmin as any, {
        domainId: data.domainId,
        runId: data.runId ?? null,
        userId: context.userId,
        sortOrder: nextSort,
        draft: d,
      });
      if (error || !questionId) {
        skipped.push({ stem: d.stem, reason: error ?? "Insert failed" });
        continue;
      }
      existing.add(norm(d.stem));
      bankItems.push({ id: questionId, stem: d.stem, domainTitle: "" });
      if (deduped) {
        // C9 — idempotent accept: a re-submitted item reuses its existing draft.
        skipped.push({ stem: d.stem, reason: "Already queued earlier — reused the existing draft" });
        continue;
      }
      queued += 1;

    }

    return { queued, skipped };
  });
