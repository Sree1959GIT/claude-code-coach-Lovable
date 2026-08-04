/**
 * Sub-task 4: ingestion server function for the RAG library.
 *
 * Admin-only. Chunks a document, embeds each chunk through the AI gateway,
 * and stores document + chunks. Re-ingesting the same content is a no-op
 * (content hash match); changed content replaces the old chunks.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const IngestInput = z.object({
  title: z.string().min(1).max(300),
  source: z.string().min(1).max(200),
  url: z.string().url().nullable().optional(),
  kind: z.string().min(1).max(50).default("doc"),
  tags: z.array(z.string().min(1).max(60)).max(30).default([]),
  content: z.string().min(1),
  /** Re-embed even when the content hash is unchanged. */
  force: z.boolean().default(false),
});

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const ingestDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IngestInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Forbidden");

    const { chunkText, batchChunks } = await import("./chunk");
    const { embedTexts, toVectorLiteral } = await import("./embeddings.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const contentHash = await sha256(data.content);

    const { data: existing, error: findErr } = await supabaseAdmin
      .from("library_documents")
      .select("id, content_hash")
      .eq("source", data.source)
      .eq("title", data.title)
      .maybeSingle();
    if (findErr) throw findErr;

    if (existing && existing.content_hash === contentHash && !data.force) {
      return { documentId: existing.id, chunkCount: 0, skipped: true as const };
    }

    const docRow = {
      title: data.title,
      source: data.source,
      url: data.url ?? null,
      kind: data.kind,
      tags: data.tags,
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

    const chunks = chunkText(data.content);
    if (chunks.length === 0) {
      return { documentId, chunkCount: 0, skipped: false as const };
    }

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

    return { documentId, chunkCount: chunks.length, skipped: false as const };
  });
