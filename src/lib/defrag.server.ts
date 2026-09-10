/**
 * Phase G4 — corpus defragmentation sweep.
 *
 * Walks the ingested library document by document and:
 *  1. strips empty structural artifacts (rule lines, bare headings, table
 *     separators, nav crumbs, chunks with no real prose left),
 *  2. consolidates fragmented sections — merges adjacent undersized chunks
 *     back into a coherent window,
 *  3. re-embeds every chunk whose text changed and renumbers chunk_index.
 *
 * Server-only. Writes a `job_runs` row summarising the sweep.
 */

import { embedTexts, toVectorLiteral } from "./embeddings.server";

/** Chunks shorter than this are candidates for merging. */
const MIN_CHARS = 220;
/** Merged windows never exceed this. */
const MAX_CHARS = 1400;
/** Below this, a chunk carries no retrievable meaning at all. */
const EMPTY_CHARS = 40;
/** Safety cap so a single sweep stays bounded. */
const MAX_DOCUMENTS = 40;
const EMBED_BATCH = 16;

export type DefragDocResult = {
  documentId: string;
  title: string;
  before: number;
  after: number;
  merged: number;
  stripped: number;
  reembedded: number;
  changed: boolean;
  error?: string;
};

export type DefragResult = {
  ok: boolean;
  dryRun: boolean;
  ranAt: string;
  durationMs: number;
  documentsScanned: number;
  documentsChanged: number;
  chunksBefore: number;
  chunksAfter: number;
  chunksStripped: number;
  chunksMerged: number;
  chunksReembedded: number;
  results: DefragDocResult[];
  error?: string;
};

/** Remove structural noise lines that carry no retrievable meaning. */
export function stripArtifacts(text: string): string {
  const lines = (text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((raw) => {
      const line = raw.trim();
      if (!line) return true; // paragraph breaks are handled below
      if (/^[-*_=~]{3,}$/.test(line)) return false; // horizontal rules
      if (/^\|?[\s|:-]+\|?$/.test(line) && line.includes("-")) return false; // table separators
      if (/^#{1,6}\s*$/.test(line)) return false; // empty headings
      if (/^[*+-]\s*$/.test(line)) return false; // empty bullets
      if (/^(\d+\.)\s*$/.test(line)) return false; // empty ordered items
      if (/^(\[\s*\]|\(\s*\)|\{\s*\}|<[^>]*>)$/.test(line)) return false; // stray markup
      if (/^(skip to (main )?content|on this page|table of contents|edit this page|was this page helpful\??)$/i.test(line))
        return false;
      return true;
    });

  return lines
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Characters that actually count as prose (letters/digits). */
function meaningfulLength(text: string): number {
  return (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

type WorkingChunk = { content: string; sourceIds: string[] };

/** Merge adjacent undersized chunks into coherent windows. */
export function consolidate(contents: { id: string; content: string }[]): {
  chunks: WorkingChunk[];
  stripped: number;
  merged: number;
} {
  let stripped = 0;
  let merged = 0;

  const kept: { id: string; content: string }[] = [];
  for (const row of contents) {
    const cleaned = stripArtifacts(row.content);
    if (meaningfulLength(cleaned) < EMPTY_CHARS) {
      stripped++;
      continue;
    }
    kept.push({ id: row.id, content: cleaned });
  }

  const out: WorkingChunk[] = [];
  for (const row of kept) {
    const prev = out[out.length - 1];
    const shouldMerge =
      prev !== undefined &&
      (prev.content.length < MIN_CHARS || row.content.length < MIN_CHARS) &&
      prev.content.length + row.content.length + 2 <= MAX_CHARS;

    if (prev && shouldMerge) {
      prev.content = `${prev.content}\n\n${row.content}`;
      prev.sourceIds.push(row.id);
      merged++;
    } else {
      out.push({ content: row.content, sourceIds: [row.id] });
    }
  }

  return { chunks: out, stripped, merged };
}

async function defragDocument(
  supabaseAdmin: any,
  doc: { id: string; title: string },
  dryRun: boolean,
): Promise<DefragDocResult> {
  const base: DefragDocResult = {
    documentId: doc.id,
    title: doc.title,
    before: 0,
    after: 0,
    merged: 0,
    stripped: 0,
    reembedded: 0,
    changed: false,
  };

  const { data, error } = await supabaseAdmin
    .from("library_chunks")
    .select("id, chunk_index, content")
    .eq("document_id", doc.id)
    .order("chunk_index", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as { id: string; chunk_index: number; content: string }[];
  base.before = rows.length;
  if (rows.length === 0) return base;

  const { chunks, stripped, merged } = consolidate(rows.map((r) => ({ id: r.id, content: r.content })));
  base.after = chunks.length;
  base.stripped = stripped;
  base.merged = merged;

  const originalById = new Map(rows.map((r) => [r.id, r.content]));
  const needsRewrite = chunks.filter(
    (c, i) =>
      c.sourceIds.length > 1 ||
      originalById.get(c.sourceIds[0]!) !== c.content ||
      rows.find((r) => r.id === c.sourceIds[0])?.chunk_index !== i,
  );

  base.changed = stripped > 0 || merged > 0 || needsRewrite.length > 0;
  if (!base.changed || dryRun) {
    base.reembedded = dryRun ? needsRewrite.filter((c) => c.sourceIds.length > 1 || originalById.get(c.sourceIds[0]!) !== c.content).length : 0;
    return base;
  }

  // Chunks whose text changed must be re-embedded; index-only moves need not.
  const textChanged = chunks.filter(
    (c) => c.sourceIds.length > 1 || originalById.get(c.sourceIds[0]!) !== c.content,
  );
  const vectorByKey = new Map<string, string>();
  for (let i = 0; i < textChanged.length; i += EMBED_BATCH) {
    const batch = textChanged.slice(i, i + EMBED_BATCH);
    const vectors = await embedTexts(batch.map((c) => c.content));
    batch.forEach((c, j) => vectorByKey.set(c.sourceIds[0]!, toVectorLiteral(vectors[j]!)));
  }
  base.reembedded = textChanged.length;

  // Delete every chunk that was folded away or stripped.
  const survivorIds = new Set(chunks.map((c) => c.sourceIds[0]!));
  const removeIds = rows.map((r) => r.id).filter((id) => !survivorIds.has(id));
  if (removeIds.length > 0) {
    const { error: delErr } = await supabaseAdmin.from("library_chunks").delete().in("id", removeIds);
    if (delErr) throw new Error(delErr.message);
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const id = chunk.sourceIds[0]!;
    const patch: Record<string, unknown> = {
      chunk_index: i,
      content: chunk.content,
      token_count: Math.ceil(chunk.content.length / 4),
    };
    const vector = vectorByKey.get(id);
    if (vector) patch['embedding'] = vector;

    const { error: upErr } = await supabaseAdmin.from("library_chunks").update(patch).eq("id", id);
    if (upErr) throw new Error(upErr.message);
  }

  await supabaseAdmin
    .from("library_documents")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", doc.id);

  return base;
}

export async function runCorpusDefrag(opts: {
  dryRun?: boolean;
  documentIds?: string[];
  limit?: number;
} = {}): Promise<DefragResult> {
  const startedAt = Date.now();
  const dryRun = opts.dryRun ?? true;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const results: DefragDocResult[] = [];
  let error: string | undefined;

  try {
    let query = supabaseAdmin
      .from("library_documents")
      .select("id, title")
      .order("updated_at", { ascending: true })
      .limit(Math.min(opts.limit ?? MAX_DOCUMENTS, MAX_DOCUMENTS));
    if (opts.documentIds?.length) query = query.in("id", opts.documentIds);

    const { data, error: docErr } = await query;
    if (docErr) throw new Error(docErr.message);

    for (const doc of (data ?? []) as { id: string; title: string }[]) {
      try {
        results.push(await defragDocument(supabaseAdmin, doc, dryRun));
      } catch (e) {
        results.push({
          documentId: doc.id,
          title: doc.title,
          before: 0,
          after: 0,
          merged: 0,
          stripped: 0,
          reembedded: 0,
          changed: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - startedAt;
  const sum = (pick: (r: DefragDocResult) => number) => results.reduce((n, r) => n + pick(r), 0);
  const summary = error
    ? `Sweep failed: ${error}`
    : `${results.length} docs · ${sum((r) => r.chunksDelta ?? 0) || sum((r) => r.before) - sum((r) => r.after)} chunks removed · ${sum((r) => r.merged)} merged · ${sum((r) => r.reembedded)} re-embedded${dryRun ? " (dry run)" : ""}`;

  if (!dryRun) {
    try {
      await supabaseAdmin.from("job_runs").insert({
        job_name: "defrag-corpus",
        status: error || results.some((r) => r.error) ? "error" : "ok",
        summary,
        items_processed: sum((r) => r.before),
        items_repaired: sum((r) => r.reembedded),
        error: error ?? results.find((r) => r.error)?.error ?? null,
        duration_ms: durationMs,
        details: { documents: results.length, results },
      });
    } catch {
      // Logging must not mask the sweep result.
    }
  }

  return {
    ok: !error,
    dryRun,
    ranAt: new Date(startedAt).toISOString(),
    durationMs,
    documentsScanned: results.length,
    documentsChanged: results.filter((r) => r.changed).length,
    chunksBefore: sum((r) => r.before),
    chunksAfter: sum((r) => r.after),
    chunksStripped: sum((r) => r.stripped),
    chunksMerged: sum((r) => r.merged),
    chunksReembedded: sum((r) => r.reembedded),
    results,
    ...(error ? { error } : {}),
  };
}
