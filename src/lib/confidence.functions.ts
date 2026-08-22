/**
 * Stage 7 sub-task 14 — per-domain confidence self-ratings (1-5).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DomainConfidenceRow = { domain_id: string; rating: number };

export const getDomainConfidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DomainConfidenceRow[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("domain_confidence")
      .select("domain_id, rating")
      .eq("user_id", userId);
    if (error) throw error;
    return (data ?? []).map((r) => ({ domain_id: r.domain_id, rating: Number(r.rating) }));
  });

export const setDomainConfidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        domainId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("domain_confidence")
      .upsert(
        { user_id: userId, domain_id: data.domainId, rating: data.rating },
        { onConflict: "user_id,domain_id" },
      );
    if (error) throw error;
    return { ok: true };
  });
