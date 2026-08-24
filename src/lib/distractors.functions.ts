/**
 * Stage 8 sub-task 8.4 — admin-only distractor quality audit server function.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DistractorAudit } from "./distractors.server";

export type { DistractorAudit, DistractorQuestion, DistractorOption, DistractorFlag } from "./distractors.server";

const Input = z.object({
  minAttempts: z.number().int().min(1).max(50).default(5),
  overChosenShare: z.number().min(0.1).max(0.9).default(0.4),
});

export const auditQuestionDistractors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<DistractorAudit> => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw error;
    if (!isAdmin) throw new Error("Forbidden");

    const { auditDistractors } = await import("./distractors.server");
    return auditDistractors(data.minAttempts, data.overChosenShare);
  });
