/**
 * Phase G4 — admin-gated server functions for the corpus defragmentation sweep.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type { DefragResult, DefragDocResult } from "./defrag.server";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw error;
  if (!isAdmin) throw new Error("Forbidden");
}

export const runDefragSweep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        dryRun: z.boolean().default(true),
        documentIds: z.array(z.string().uuid()).max(40).optional(),
        limit: z.number().int().min(1).max(40).default(20),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { runCorpusDefrag } = await import("./defrag.server");
    return runCorpusDefrag(data);
  });
