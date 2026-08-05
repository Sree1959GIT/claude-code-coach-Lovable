/**
 * Server-only retrieval core for the RAG library.
 * Embeds a query and runs vector similarity search via `match_library_chunks`.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { embedText, toVectorLiteral } from "./embeddings.server";

export type LibraryMatch = {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  title: string;
  source: string;
  url: string | null;
  kind: string;
  tags: string[];
  similarity: number;
};

export type RetrieveOptions = {
  query: string;
  matchCount?: number;
  minSimilarity?: number;
};

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

/** Embed the query and return the closest library chunks. */
export async function retrieveChunks(opts: RetrieveOptions): Promise<LibraryMatch[]> {
  const query = opts.query.replace(/\s+/g, " ").trim();
  if (!query) return [];

  const matchCount = Math.min(Math.max(opts.matchCount ?? 6, 1), 20);
  const minSimilarity = Math.min(Math.max(opts.minSimilarity ?? 0.15, 0), 1);

  const vector = await embedText(query);
  const supabase = publicClient();

  const { data, error } = await supabase.rpc("match_library_chunks", {
    query_embedding: toVectorLiteral(vector) as unknown as string,
    match_count: matchCount,
    min_similarity: minSimilarity,
  });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    chunkId: row.chunk_id,
    documentId: row.document_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    title: row.title,
    source: row.source,
    url: row.url,
    kind: row.kind,
    tags: row.tags ?? [],
    similarity: Number(row.similarity),
  }));
}

/** Compact, citation-friendly context block for LLM prompts. */
export function buildContextBlock(matches: LibraryMatch[], maxChars = 6000): string {
  const parts: string[] = [];
  let used = 0;
  matches.forEach((m, i) => {
    const header = `[${i + 1}] ${m.title}${m.url ? ` — ${m.url}` : ""}`;
    const body = `${header}\n${m.content}`;
    if (used + body.length > maxChars) return;
    parts.push(body);
    used += body.length;
  });
  return parts.join("\n\n---\n\n");
}
