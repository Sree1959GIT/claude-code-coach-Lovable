/**
 * Stage 6b sub-task 8 — scheduled library maintenance job.
 *
 * Re-embeds library chunks that are missing a vector, then writes a
 * `job_runs` row summarising the run. Server-only.
 */

import { embedTexts, toVectorLiteral } from "./embeddings.server";

export type LibraryRefreshResult = {
  ok: boolean;
  ranAt: string;
  durationMs: number;
  documents: number;
  chunks: number;
  chunksMissingEmbedding: number;
  repaired: number;
  staleDocuments: number;
  error?: string;
};

/** Max chunks repaired in a single run, to keep the request bounded. */
const MAX_REPAIR = 64;
const EMBED_BATCH = 16;
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export async function runLibraryRefresh(jobName = "refresh-library"): Promise<LibraryRefreshResult> {
  const startedAt = Date.now();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let documents = 0;
  let chunks = 0;
  let missing = 0;
  let stale = 0;
  let repaired = 0;
  let error: string | undefined;

  try {
    const [docsRes, chunksRes, missingRes] = await Promise.all([
      supabaseAdmin.from("library_documents").select("id, updated_at"),
      supabaseAdmin.from("library_chunks").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("library_chunks")
        .select("id", { count: "exact", head: true })
        .is("embedding", null),
    ]);

    for (const r of [docsRes, chunksRes, missingRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const docs = docsRes.data ?? [];
    documents = docs.length;
    chunks = chunksRes.count ?? 0;
    missing = missingRes.count ?? 0;
    const cutoff = Date.now() - STALE_MS;
    stale = docs.filter((d) => new Date(d.updated_at).getTime() < cutoff).length;

    if (missing > 0) {
      const { data: broken, error: brokenErr } = await supabaseAdmin
        .from("library_chunks")
        .select("id, content")
        .is("embedding", null)
        .limit(MAX_REPAIR);
      if (brokenErr) throw new Error(brokenErr.message);

      const rows = (broken ?? []).filter((c) => (c.content ?? "").trim().length > 0);
      for (let i = 0; i < rows.length; i += EMBED_BATCH) {
        const batch = rows.slice(i, i + EMBED_BATCH);
        const vectors = await embedTexts(batch.map((c) => c.content));
        for (let j = 0; j < batch.length; j++) {
          const { error: upErr } = await supabaseAdmin
            .from("library_chunks")
            .update({ embedding: toVectorLiteral(vectors[j]!) as unknown as string })
            .eq("id", batch[j]!.id);
          if (upErr) throw new Error(upErr.message);
          repaired++;
        }
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - startedAt;
  const summary = error
    ? `Failed after repairing ${repaired} chunk(s)`
    : `${documents} docs · ${chunks} chunks · ${Math.max(missing - repaired, 0)} still missing embeddings · ${stale} stale`;

  try {
    await supabaseAdmin.from("job_runs").insert({
      job_name: jobName,
      status: error ? "error" : "ok",
      summary,
      items_processed: chunks,
      items_repaired: repaired,
      error: error ?? null,
      duration_ms: durationMs,
      details: { documents, chunks, missing, stale, repaired },
    });
  } catch {
    // Logging failures must not mask the job result.
  }

  return {
    ok: !error,
    ranAt: new Date(startedAt).toISOString(),
    durationMs,
    documents,
    chunks,
    chunksMissingEmbedding: Math.max(missing - repaired, 0),
    repaired,
    staleDocuments: stale,
    ...(error ? { error } : {}),
  };
}
