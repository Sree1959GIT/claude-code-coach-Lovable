/**
 * Phase G2 — spider control desk.
 * Admin-only catalog of source URLs with targeted last-crawl timestamps.
 * Crawling reuses the credential-aware fetcher and the library ingester.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw error;
  if (!data) throw new Error("Forbidden");
}

export type CrawlTarget = {
  id: string;
  sourceId: string | null;
  url: string;
  label: string | null;
  tags: string[];
  enabled: boolean;
  intervalHours: number;
  lastCrawledAt: string | null;
  lastOk: boolean | null;
  lastStatus: string | null;
  lastChars: number | null;
  lastChunks: number | null;
  /** Derived: crawl is due when never crawled or interval elapsed. */
  due: boolean;
  createdAt: string;
};

function toTarget(r: any): CrawlTarget {
  const last = r.last_crawled_at ? new Date(r.last_crawled_at).getTime() : null;
  const due =
    r.enabled &&
    (last === null || Date.now() - last >= (r.crawl_interval_hours ?? 168) * 3_600_000);
  return {
    id: r.id,
    sourceId: r.source_id ?? null,
    url: r.url,
    label: r.label ?? null,
    tags: r.tags ?? [],
    enabled: r.enabled,
    intervalHours: r.crawl_interval_hours,
    lastCrawledAt: r.last_crawled_at ?? null,
    lastOk: r.last_ok ?? null,
    lastStatus: r.last_status ?? null,
    lastChars: r.last_chars ?? null,
    lastChunks: r.last_chunks ?? null,
    due,
    createdAt: r.created_at,
  };
}

export const listCrawlTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CrawlTarget[]> => {
    await assertAdmin(context);
    const { data, error } = await (context.supabase as any)
      .from("crawl_targets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw error;
    return (data ?? []).map(toTarget);
  });

export const addCrawlTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        url: z.string().url(),
        label: z.string().max(160).nullable().optional(),
        sourceId: z.string().uuid().nullable().optional(),
        tags: z.array(z.string().max(60)).max(20).default([]),
        intervalHours: z.number().int().min(1).max(8760).default(168),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("crawl_targets").insert({
      url: data.url,
      label: data.label?.trim() || null,
      source_id: data.sourceId ?? null,
      tags: data.tags,
      crawl_interval_hours: data.intervalHours,
      created_by: context.userId,
    });
    if (error) {
      if ((error as any).code === "23505") throw new Error("That URL is already catalogued.");
      throw error;
    }
    return { ok: true };
  });

export const updateCrawlTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        enabled: z.boolean().optional(),
        intervalHours: z.number().int().min(1).max(8760).optional(),
        label: z.string().max(160).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    if (data.enabled !== undefined) patch["enabled"] = data.enabled;
    if (data.intervalHours !== undefined) patch["crawl_interval_hours"] = data.intervalHours;
    if (data.label !== undefined) patch["label"] = data.label?.trim() || null;
    const { error } = await (supabaseAdmin as any)
      .from("crawl_targets")
      .update(patch)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCrawlTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("crawl_targets")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export type CrawlOutcome = {
  id: string;
  url: string;
  ok: boolean;
  status: string;
  chars: number;
  chunks: number;
};

/** Fetch one catalogued URL, ingest it, and stamp the crawl result. */
async function crawlOne(row: any): Promise<CrawlOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { fetchWithCredentials, htmlToText, extractTitle, loadCredential } = await import(
    "./source-fetch.server"
  );

  let ok = false;
  let status = "";
  let chars = 0;
  let chunks = 0;

  try {
    const credential = row.source_id ? await loadCredential(row.source_id) : undefined;
    const res = await fetchWithCredentials(
      row.url,
      credential !== undefined ? { credential } : {},
    );
    status = `HTTP ${res.status} · ${res.durationMs}ms`;
    if (!res.ok) throw new Error(status);

    const text = res.contentType.includes("html") ? htmlToText(res.body) : res.body.trim();
    chars = text.length;
    if (chars < 200) throw new Error(`${status} · too little readable text`);

    const { ingestOne } = await import("./ingest.server");
    const result: any = await ingestOne({
      title: row.label?.trim() || extractTitle(res.body, row.url),
      source: new URL(row.url).host,
      url: row.url,
      kind: "doc",
      tags: Array.from(new Set([...(row.tags ?? []), "spider"])),
      content: text,
      force: false,
    });
    chunks = result?.chunkCount ?? 0;
    ok = true;
  } catch (err) {
    ok = false;
    status = status || (err instanceof Error ? err.message : "Crawl failed");
    if (err instanceof Error && !status.includes(err.message)) status = `${status} · ${err.message}`;
  }

  await (supabaseAdmin as any)
    .from("crawl_targets")
    .update({
      last_crawled_at: new Date().toISOString(),
      last_ok: ok,
      last_status: status.slice(0, 300),
      last_chars: chars,
      last_chunks: chunks,
    })
    .eq("id", row.id);

  return { id: row.id, url: row.url, ok, status, chars, chunks };
}

export const crawlTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        /** One specific target, or omit for every due + enabled target. */
        id: z.string().uuid().nullable().optional(),
        dueOnly: z.boolean().default(true),
        limit: z.number().int().min(1).max(20).default(5),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ results: CrawlOutcome[] }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let rows: any[] = [];
    if (data.id) {
      const { data: r, error } = await (supabaseAdmin as any)
        .from("crawl_targets")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      if (error) throw error;
      if (!r) throw new Error("Crawl target not found");
      rows = [r];
    } else {
      const { data: all, error } = await (supabaseAdmin as any)
        .from("crawl_targets")
        .select("*")
        .eq("enabled", true)
        .order("last_crawled_at", { ascending: true, nullsFirst: true })
        .limit(50);
      if (error) throw error;
      rows = (all ?? []).filter((r: any) => {
        if (!data.dueOnly) return true;
        const last = r.last_crawled_at ? new Date(r.last_crawled_at).getTime() : null;
        return last === null || Date.now() - last >= (r.crawl_interval_hours ?? 168) * 3_600_000;
      });
      rows = rows.slice(0, data.limit);
    }

    const results: CrawlOutcome[] = [];
    for (const row of rows) results.push(await crawlOne(row));
    return { results };
  });
