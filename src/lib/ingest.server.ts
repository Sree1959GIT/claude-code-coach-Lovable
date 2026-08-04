/**
 * Server-only ingestion core for the RAG library.
 * Shared by the admin ingest server function and the library seeder.
 */

import { chunkText, batchChunks } from "./chunk";
import { embedTexts, toVectorLiteral } from "./embeddings.server";

export type IngestDoc = {
  title: string;
  source: string;
  url?: string | null;
  kind?: string;
  tags?: string[];
  content: string;
  force?: boolean;
};

export type IngestResult = {
  documentId: string;
  chunkCount: number;
  skipped: boolean;
};

export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function ingestOne(doc: IngestDoc): Promise<IngestResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const contentHash = await sha256(doc.content);

  const { data: existing, error: findErr } = await supabaseAdmin
    .from("library_documents")
    .select("id, content_hash")
    .eq("source", doc.source)
    .eq("title", doc.title)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existing && existing.content_hash === contentHash && !doc.force) {
    return { documentId: existing.id, chunkCount: 0, skipped: true };
  }

  const docRow = {
    title: doc.title,
    source: doc.source,
    url: doc.url ?? null,
    kind: doc.kind ?? "doc",
    tags: doc.tags ?? [],
    content_hash: contentHash,
    updated_at: new Date().toISOString(),
  };

  let documentId: string;
  if (existing) {
    const { error } = await supabaseAdmin
      .from("library_documents")
      .update(docRow)
      .eq("id", existing.id);
    if (error) throw error;
    documentId = existing.id;

    const { error: delErr } = await supabaseAdmin
      .from("library_chunks")
      .delete()
      .eq("document_id", documentId);
    if (delErr) throw delErr;
  } else {
    const { data: inserted, error } = await supabaseAdmin
      .from("library_documents")
      .insert(docRow)
      .select("id")
      .single();
    if (error) throw error;
    documentId = inserted.id;
  }

  const chunks = chunkText(doc.content);
  if (chunks.length === 0) return { documentId, chunkCount: 0, skipped: false };

  for (const batch of batchChunks(chunks)) {
    const vectors = await embedTexts(batch.map((c) => c.content));
    const rows = batch.map((chunk, i) => ({
      document_id: documentId,
      chunk_index: chunk.index,
      content: chunk.content,
      token_count: chunk.tokenCount,
      embedding: toVectorLiteral(vectors[i]!) as unknown as string,
    }));
    const { error } = await supabaseAdmin.from("library_chunks").insert(rows);
    if (error) throw error;
  }

  return { documentId, chunkCount: chunks.length, skipped: false };
}
