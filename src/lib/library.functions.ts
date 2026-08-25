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

/** Ingest (or re-index) one named preset from `library-presets`. */
export const ingestPreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ presetId: z.string().min(1), force: z.boolean().default(false) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { ingestOne } = await import("./ingest.server");
    const { INGEST_PRESETS } = await import("./library-presets");

    const preset = INGEST_PRESETS.find((p) => p.id === data.presetId);
    if (!preset) throw new Error("Unknown preset");

    const results: {
      title: string;
      chunkCount: number;
      skipped: boolean;
      error?: string;
    }[] = [];

    for (const doc of preset.docs) {
      try {
        const r = await ingestOne({
          ...doc,
          tags: Array.from(new Set([...(doc.tags ?? []), ...preset.tags])),
          force: data.force,
        });
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
      presetId: preset.id,
      label: preset.label,
      documents: results.length,
      ingested: results.filter((r) => !r.skipped && !r.error).length,
      skipped: results.filter((r) => r.skipped).length,
      failed: results.filter((r) => r.error).length,
      totalChunks: results.reduce((n, r) => n + r.chunkCount, 0),
      results,
    };
  });


/** Is the caller a library admin? Safe to call from any signed-in user. */
export const isLibraryAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw error;
    return { admin: Boolean(data) };
  });

/** Admin listing of ingested documents with their chunk counts. */
export const listLibraryDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("library_documents")
      .select("id, title, source, url, kind, tags, updated_at, library_chunks(count)")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []).map((d: any) => ({
      id: d.id as string,
      title: d.title as string,
      source: d.source as string,
      url: (d.url ?? null) as string | null,
      kind: d.kind as string,
      tags: (d.tags ?? []) as string[],
      updatedAt: d.updated_at as string,
      chunkCount: (d.library_chunks?.[0]?.count ?? 0) as number,
    }));
  });
