/**
 * Phase D7 — Study Canvas execution telemetry.
 * Logs only status metrics and output sizes; never raw source code.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const logInput = z.object({
  language: z.string().max(32),
  providerId: z.string().max(64).nullable().optional(),
  fileName: z.string().max(200).nullable().optional(),
  ok: z.boolean(),
  timedOut: z.boolean(),
  cancelled: z.boolean(),
  durationMs: z.number().int().min(0).max(3_600_000),
  stdoutBytes: z.number().int().min(0),
  stderrBytes: z.number().int().min(0),
  errorMessage: z.string().max(500).nullable().optional(),
});

export type CodeExecutionRow = {
  id: string;
  language: string;
  provider_id: string | null;
  file_name: string | null;
  ok: boolean;
  timed_out: boolean;
  cancelled: boolean;
  duration_ms: number;
  stdout_bytes: number;
  stderr_bytes: number;
  error_message: string | null;
  created_at: string;
};

export const logCodeExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => logInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("code_executions").insert({
      user_id: userId,
      language: data.language,
      provider_id: data.providerId ?? null,
      file_name: data.fileName ?? null,
      ok: data.ok,
      timed_out: data.timedOut,
      cancelled: data.cancelled,
      duration_ms: data.durationMs,
      stdout_bytes: data.stdoutBytes,
      stderr_bytes: data.stderrBytes,
      error_message: data.errorMessage ?? null,
    });
    if (error) throw error;
    return { ok: true };
  });

export const listCodeExecutions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CodeExecutionRow[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("code_executions")
      .select(
        "id, language, provider_id, file_name, ok, timed_out, cancelled, duration_ms, stdout_bytes, stderr_bytes, error_message, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []) as CodeExecutionRow[];
  });
