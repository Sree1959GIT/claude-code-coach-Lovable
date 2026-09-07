/**
 * Phase E6 — read side of the code generation stream tracker.
 * Admin-only listing plus a single-job poll used by the live UI.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CodegenAgent, CodegenStep } from "./codegen.server";

export type CodeGenJob = {
  id: string;
  conceptTag: string;
  conceptLabel: string | null;
  language: string;
  difficulty: string;
  status: "queued" | "running" | "succeeded" | "failed";
  currentAgent: CodegenAgent | null;
  steps: CodegenStep[];
  attempts: number;
  error: string | null;
  savedCodebaseId: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  concept_tag: string;
  concept_label: string | null;
  language: string;
  difficulty: string;
  status: string;
  current_agent: string | null;
  steps: unknown;
  attempts: number;
  error: string | null;
  saved_codebase_id: string | null;
  created_at: string;
  updated_at: string;
};

function toJob(row: Row): CodeGenJob {
  const status = (["queued", "running", "succeeded", "failed"] as const).includes(
    row.status as never,
  )
    ? (row.status as CodeGenJob["status"])
    : "running";
  return {
    id: row.id,
    conceptTag: row.concept_tag,
    conceptLabel: row.concept_label,
    language: row.language,
    difficulty: row.difficulty,
    status,
    currentAgent: (row.current_agent as CodegenAgent | null) ?? null,
    steps: Array.isArray(row.steps) ? (row.steps as CodegenStep[]) : [],
    attempts: row.attempts ?? 0,
    error: row.error,
    savedCodebaseId: row.saved_codebase_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const listCodeGenJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CodeGenJob[]> => {
    const { data, error } = await context.supabase
      .from("code_gen_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return ((data ?? []) as unknown as Row[]).map(toJob);
  });

export const getCodeGenJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string }) => {
    const jobId = String(input?.jobId ?? "").trim();
    if (!jobId) throw new Error("Missing job id.");
    return { jobId };
  })
  .handler(async ({ data, context }): Promise<CodeGenJob | null> => {
    const { data: row, error } = await context.supabase
      .from("code_gen_jobs")
      .select("*")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw error;
    return row ? toJob(row as unknown as Row) : null;
  });
