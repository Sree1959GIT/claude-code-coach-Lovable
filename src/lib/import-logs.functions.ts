/**
 * Phase G1 — bulk import run logs (per-row diagnostics).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ImportRunSummary = {
  id: string;
  format: string;
  dryRun: boolean;
  parsed: number;
  valid: number;
  imported: number;
  skipped: number;
  error: string | null;
  createdAt: string;
};

export type ImportRunItem = {
  id: string;
  rowNumber: number;
  status: string;
  domainSlug: string | null;
  stem: string | null;
  message: string | null;
};

export const listImportRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImportRunSummary[]> => {
    const { data, error } = await context.supabase
      .from("import_runs")
      .select("id, format, dry_run, parsed, valid, imported, skipped, error, created_at")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      format: r.format,
      dryRun: r.dry_run,
      parsed: r.parsed,
      valid: r.valid,
      imported: r.imported,
      skipped: r.skipped,
      error: r.error,
      createdAt: r.created_at,
    }));
  });

export const getImportRunItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string }) => {
    if (!input?.runId) throw new Error("runId is required.");
    return { runId: input.runId };
  })
  .handler(async ({ data, context }): Promise<ImportRunItem[]> => {
    const { data: rows, error } = await context.supabase
      .from("import_run_items")
      .select("id, row_number, status, domain_slug, stem, message")
      .eq("run_id", data.runId)
      .order("row_number", { ascending: true })
      .limit(500);
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id,
      rowNumber: r.row_number,
      status: r.status,
      domainSlug: r.domain_slug,
      stem: r.stem,
      message: r.message,
    }));
  });
