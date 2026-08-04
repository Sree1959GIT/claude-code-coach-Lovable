/**
 * Server functions for the RAG library.
 *
 * Admin-only. `ingestDocument` chunks + embeds + stores one document;
 * `seedLibrary` ingests the curated Anthropic seed corpus.
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

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw error;
  if (!isAdmin) throw new Error("Forbidden");
}

export const ingestDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IngestInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { ingestOne } = await import("./ingest.server");
    return ingestOne(data);
  });

export const seedLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ force: z.boolean().default(false) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { ingestOne } = await import("./ingest.server");
    const { SEED_LIBRARY } = await import("./library-seed");

    const results: {
      title: string;
      chunkCount: number;
      skipped: boolean;
      error?: string;
    }[] = [];

    for (const doc of SEED_LIBRARY) {
      try {
        const r = await ingestOne({ ...doc, force: data.force });
        results.push({ title: doc.title, chunkCount: r.chunkCount, skipped: r.skipped });
      } catch (err) {
        results.push({
          title: doc.title,
          chunkCount: 0,
          skipped: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      documents: results.length,
      ingested: results.filter((r) => !r.skipped && !r.error).length,
      skipped: results.filter((r) => r.skipped).length,
      failed: results.filter((r) => r.error).length,
      totalChunks: results.reduce((n, r) => n + r.chunkCount, 0),
      results,
    };
  });
