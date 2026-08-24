/**
 * Stage 8 sub-task 8.5 — explanation enrichment server function.
 * Admin-only. Dry run drafts grounded explanations for review; commit writes
 * the approved text back onto the options.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EnrichDraft = {
  questionId: string;
  stem: string;
  domainTitle: string;
  citations: { title: string; url: string | null }[];
  options: { optionId: string; label: string; text: string; isCorrect: boolean; explanation: string }[];
};

export type EnrichResult = {
  scannedAt: string;
  missingOptions: number;
  questionsWithGaps: number;
  processed: number;
  drafted: number;
  written: number;
  committed: boolean;
  issues: string[];
  drafts: EnrichDraft[];
};

type Input = { limit?: number; commit?: boolean };

export const enrichExplanations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => ({
    limit: Math.min(Math.max(Math.round(Number(input?.limit) || 3), 1), 10),
    commit: input?.commit === true,
  }))
  .handler(async ({ data, context }): Promise<EnrichResult> => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enrichQuestionExplanations } = await import("./enrich.server");

    const [optionsRes, questionsRes, domainsRes] = await Promise.all([
      supabaseAdmin
        .from("question_options")
        .select("id, question_id, label, text, is_correct, explanation, sort_order")
        .order("sort_order"),
      supabaseAdmin.from("questions").select("id, domain_id, stem, scenario"),
      supabaseAdmin.from("domains").select("id, title"),
    ]);
    for (const r of [optionsRes, questionsRes, domainsRes]) {
      if (r.error) throw r.error;
    }

    const domainTitle = new Map((domainsRes.data ?? []).map((d) => [d.id, d.title]));
    const optionsBy = new Map<string, NonNullable<typeof optionsRes.data>>();
    for (const o of optionsRes.data ?? []) {
      const list = optionsBy.get(o.question_id) ?? [];
      list.push(o);
      optionsBy.set(o.question_id, list);
    }

    const isBlank = (v: string | null) => !v || v.trim().length === 0;

    const gaps = (questionsRes.data ?? [])
      .map((q) => {
        const opts = optionsBy.get(q.id) ?? [];
        const missing = opts.filter((o) => isBlank(o.explanation)).map((o) => o.id);
        return { q, opts, missing };
      })
      .filter((g) => g.opts.length > 0 && g.missing.length > 0);

    const missingOptions = gaps.reduce((n, g) => n + g.missing.length, 0);
    const batch = gaps.slice(0, data.limit);

    const issues: string[] = [];
    const drafts: EnrichDraft[] = [];
    let written = 0;

    for (const g of batch) {
      let enriched;
      try {
        enriched = await enrichQuestionExplanations({
          questionId: g.q.id,
          stem: g.q.stem,
          scenario: g.q.scenario,
          domainTitle: domainTitle.get(g.q.domain_id) ?? "—",
          options: g.opts.map((o) => ({
            optionId: o.id,
            label: o.label,
            text: o.text,
            isCorrect: o.is_correct,
          })),
          missing: g.missing,
        });
      } catch (e) {
        issues.push(`${g.q.stem.slice(0, 60)}… — ${(e as Error).message}`);
        continue;
      }

      if (enriched.explanations.length === 0) {
        issues.push(`${g.q.stem.slice(0, 60)}… — no usable explanations returned`);
        continue;
      }

      const cite = enriched.citations[0];
      const suffix = cite ? ` (Source: ${cite.title}${cite.url ? ` — ${cite.url}` : ""})` : "";
      const byId = new Map(g.opts.map((o) => [o.id, o]));

      const draftOptions = enriched.explanations.map((e) => {
        const o = byId.get(e.optionId)!;
        return {
          optionId: e.optionId,
          label: o.label,
          text: o.text,
          isCorrect: o.is_correct,
          explanation: `${e.explanation}${suffix}`,
        };
      });

      drafts.push({
        questionId: g.q.id,
        stem: g.q.stem,
        domainTitle: domainTitle.get(g.q.domain_id) ?? "—",
        citations: enriched.citations,
        options: draftOptions,
      });

      if (data.commit) {
        for (const d of draftOptions) {
          const { error } = await supabaseAdmin
            .from("question_options")
            .update({ explanation: d.explanation })
            .eq("id", d.optionId);
          if (error) issues.push(`Write failed for option ${d.label}: ${error.message}`);
          else written += 1;
        }
      }
    }

    return {
      scannedAt: new Date().toISOString(),
      missingOptions,
      questionsWithGaps: gaps.length,
      processed: batch.length,
      drafted: drafts.reduce((n, d) => n + d.options.length, 0),
      written,
      committed: data.commit,
      issues,
      drafts,
    };
  });
