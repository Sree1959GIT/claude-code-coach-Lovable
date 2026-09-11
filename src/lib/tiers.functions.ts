/**
 * Phase F1 — membership tier read/write server functions.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MembershipTier } from "./model-routing.server";

export type { MembershipTier } from "./model-routing.server";

export const getMyTier = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getMembershipTier, resolveModel } = await import("./model-routing.server");
    const tier = await getMembershipTier(context.supabase as never, context.userId);
    return {
      tier,
      mentorModel: resolveModel("mentor_chat", tier),
    };
  });

export const setUserTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        tier: z.enum(["free", "plus", "pro"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw error;
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ membership_tier: data.tier })
      .eq("id", data.userId);
    if (updateError) throw updateError;
    return { userId: data.userId, tier: data.tier as MembershipTier };
  });
