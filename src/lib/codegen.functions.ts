/**
 * Phase E4 — client-callable entry point for the code generation loop.
 * Admin-only, preview-only: the draft is returned to the caller, never saved.
 * Persistence + fail-safe retries land in E5.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CodegenResult } from "./codegen.server";

type Input = {
  conceptTag: string;
  conceptLabel?: string | null;
  language: "python" | "javascript";
  difficulty: "beginner" | "intermediate" | "advanced";
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
    const language = input.language === "python" ? "python" : "javascript";
    const difficulty = (["beginner", "intermediate", "advanced"] as const).includes(input.difficulty)
      ? input.difficulty
      : "intermediate";
    const label =
      typeof input.conceptLabel === "string" && input.conceptLabel.trim()
        ? input.conceptLabel.trim().slice(0, 200)
        : conceptTag.replace(/_/g, " ");
    return { conceptTag, conceptLabel: label, language, difficulty };
  })
  .handler(async ({ data, context }): Promise<CodegenResult> => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.from("codebases").select("concept_tag");
    const existingTags = Array.from(new Set((rows ?? []).map((r) => r.concept_tag)));

    const { runCodegenLoop } = await import("./codegen.server");
    return runCodegenLoop({ ...data, existingTags });
  });
