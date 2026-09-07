/**
 * Phase E4/E5 — client-callable entry point for the code generation loop.
 * Admin-only. E5 adds the quality filter: the loop retries broken examples,
 * and a draft is only written to `codebases` when it passes verification.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CodegenResult } from "./codegen.server";

type Input = {
  conceptTag: string;
  conceptLabel?: string | null;
  language: "python" | "javascript";
  difficulty: "beginner" | "intermediate" | "advanced";
  /** Persist the result when (and only when) it passes verification. */
  persist?: boolean;
  maxAttempts?: number;
  /** Phase E6 — tracking row created by `startCodeGenJob`. */
  jobId?: string | null;
};


export type CodegenSaveOutcome = {
  saved: boolean;
  id: string | null;
  reason: string | null;
};

export type GenerateCodebaseResult = CodegenResult & {
  save: CodegenSaveOutcome | null;
  /** Phase E6 — tracking row the UI polls for live agent statuses. */
  jobId: string | null;
};


export const generateCodebaseDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => {
    const conceptTag = String(input?.conceptTag ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!conceptTag) throw new Error("Pick a concept.");
    const language: "python" | "javascript" =
      input.language === "python" ? "python" : "javascript";
    const difficulty = (["beginner", "intermediate", "advanced"] as const).includes(input.difficulty)
      ? input.difficulty
      : "intermediate";
    const label =
      typeof input.conceptLabel === "string" && input.conceptLabel.trim()
        ? input.conceptLabel.trim().slice(0, 200)
        : conceptTag.replace(/_/g, " ");
    const maxAttempts =
      typeof input.maxAttempts === "number" && Number.isFinite(input.maxAttempts)
        ? Math.min(Math.max(Math.trunc(input.maxAttempts), 1), 5)
        : undefined;
    return {
      conceptTag,
      conceptLabel: label,
      language,
      difficulty,
      persist: input.persist === true,
      maxAttempts,
      jobId:
        typeof input.jobId === "string" && input.jobId.trim() ? input.jobId.trim() : null,
    };
  })
  .handler(async ({ data, context }): Promise<GenerateCodebaseResult> => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.from("codebases").select("concept_tag");
    const existingTags = Array.from(new Set((rows ?? []).map((r) => r.concept_tag)));

    const { runCodegenLoop, persistVerifiedDraft, updateCodeGenJob, nextAgentAfter } =
      await import("./codegen.server");
    const { persist, jobId, ...loopArgs } = data;

    // Phase E6 — stream each completed agent step into the tracking row.
    let attempts = 0;
    await updateCodeGenJob(jobId, { status: "running", currentAgent: "research" });
    const result = await runCodegenLoop({
      ...loopArgs,
      existingTags,
      onStep: async (step, all) => {
        if (step.agent === "sme") attempts += 1;
        await updateCodeGenJob(jobId, {
          status: "running",
          steps: all,
          attempts,
          currentAgent: nextAgentAfter(step),
        });
      },
    });

    const finish = async (save: CodegenSaveOutcome | null): Promise<GenerateCodebaseResult> => {
      const ok = Boolean(result.draft) && (!persist || save?.saved !== false);
      await updateCodeGenJob(jobId, {
        status: ok ? "succeeded" : "failed",
        currentAgent: null,
        steps: result.steps,
        attempts,
        error: result.error ?? save?.reason ?? null,
        savedCodebaseId: save?.id ?? null,
      });
      return { ...result, save, jobId };
    };

    if (!persist) return finish(null);
    if (!result.draft) {
      return finish({
        saved: false,
        id: null,
        reason: result.error ?? "Discarded — no verified example was produced.",
      });
    }
    // Fail-safe: a save error must never break the generation response.
    try {
      return finish(await persistVerifiedDraft(result.draft));
    } catch (err) {
      return finish({
        saved: false,
        id: null,
        reason: err instanceof Error ? err.message : "Save failed",
      });
    }
  });

/** Phase E6 — create the tracking row up front so the UI can poll it live. */
export const startCodeGenJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Omit<Input, "persist" | "maxAttempts">) => ({
    conceptTag: String(input?.conceptTag ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, ""),
    conceptLabel:
      typeof input.conceptLabel === "string" && input.conceptLabel.trim()
        ? input.conceptLabel.trim().slice(0, 200)
        : "",
    language: input.language === "python" ? ("python" as const) : ("javascript" as const),
    difficulty: (["beginner", "intermediate", "advanced"] as const).includes(input.difficulty)
      ? input.difficulty
      : ("intermediate" as const),
  }))
  .handler(async ({ data, context }): Promise<{ jobId: string | null }> => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Forbidden");
    if (!data.conceptTag) throw new Error("Pick a concept.");

    const { createCodeGenJob } = await import("./codegen.server");
    const jobId = await createCodeGenJob({
      userId: context.userId,
      conceptTag: data.conceptTag,
      conceptLabel: data.conceptLabel || data.conceptTag.replace(/_/g, " "),
      language: data.language,
      difficulty: data.difficulty,
    });
    return { jobId };
  });


