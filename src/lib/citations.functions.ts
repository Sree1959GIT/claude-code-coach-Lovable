/**
 * Stage 8 sub-task 8.7 — citation coverage report.
 *
 * Admin-only server functions that:
 *   1. Link every question to its top-k most similar library chunks.
 *   2. Report per-domain coverage: % of questions with at least one linked chunk.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw error;
  if (!isAdmin) throw new Error("Forbidden");
}

export type CitationRefreshResult = {
  scanned: number;
  linked: number;
  links: number;
  skipped: number;
};

export const refreshQuestionCitations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const parsed = (input ?? {}) as { topK?: number; minSimilarity?: number };
    return {
      topK: Math.min(Math.max(Number(parsed.topK ?? 3), 1), 10),
      minSimilarity: Math.min(Math.max(Number(parsed.minSimilarity ?? 0.25), 0.05), 0.95),
    };
  })
  .handler(async ({ data, context }): Promise<CitationRefreshResult> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { embedText, toVectorLiteral } = await import("@/lib/embeddings.server");

    const { data: questions, error: qErr } = await supabaseAdmin
      .from("questions")
      .select("id, scenario, stem, key_concept, domain_id")
      .order("created_at");
    if (qErr) throw qErr;

    const rows = questions ?? [];
    if (rows.length === 0) return { scanned: 0, linked: 0, links: 0, skipped: 0 };

    let linked = 0;
    let links = 0;
    let skipped = 0;

    // Cast for tables added in this migration before the generated types refresh.
    const adminClient = supabaseAdmin as any;

    for (const q of rows) {
      const query = [q.scenario, q.stem, q.key_concept].filter(Boolean).join("\n\n");
      if (!query.trim()) {
        skipped += 1;
        continue;
      }

      let vector: number[];
      try {
        vector = await embedText(query);
      } catch {
        skipped += 1;
        continue;
      }

      const { data: matches, error: mErr } = await supabaseAdmin.rpc("match_library_chunks", {
        query_embedding: toVectorLiteral(vector) as unknown as string,
        match_count: data.topK,
        min_similarity: data.minSimilarity,
      });
      if (mErr) throw mErr;

      const top = (matches ?? []) as {
        chunk_id: string;
        document_id: string;
        similarity: number;
      }[];

      if (top.length === 0) {
        skipped += 1;
        continue;
      }

      const { error: delErr } = await adminClient.from("question_citations").delete().eq("question_id", q.id);
      if (delErr) throw delErr;

      const { error: insErr } = await adminClient.from("question_citations").insert(
        top.map((m) => ({
          question_id: q.id,
          chunk_id: m.chunk_id,
          document_id: m.document_id,
          similarity: m.similarity,
          source: "semantic",
        })),
      );
      if (insErr) throw insErr;

      linked += 1;
      links += top.length;
    }

    return { scanned: rows.length, linked, links, skipped };
  });

export type CitationCoverageRow = {
  domainId: string;
  domainTitle: string;
  totalQuestions: number;
  citedQuestions: number;
  coveragePct: number;
};

export const getCitationCoverage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CitationCoverageRow[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await (supabaseAdmin as any).rpc("get_citation_coverage");
    if (error) throw error;

    return (data ?? []).map((r: any) => ({
      domainId: r.domain_id as string,
      domainTitle: r.domain_title as string,
      totalQuestions: Number(r.total_questions),
      citedQuestions: Number(r.cited_questions),
      coveragePct: Number(r.coverage_pct),
    }));
  });

