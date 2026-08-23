/**
 * Stage 8 sub-task 8.3 — admin-only duplicate scan server function.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DuplicateScan } from "./duplicates.server";

export type { DuplicatePair, DuplicateScan } from "./duplicates.server";

const Input = z.object({
  threshold: z.number().min(0.5).max(0.999).default(0.9),
});

export const scanQuestionDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<DuplicateScan> => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw error;
    if (!isAdmin) throw new Error("Forbidden");

    const { scanDuplicates } = await import("./duplicates.server");
    return scanDuplicates(data.threshold);
  });
