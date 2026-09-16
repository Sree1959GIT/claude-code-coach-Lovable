/**
 * Phase F6 — client-callable view of a learner's remaining daily allowance.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { QuotaVerdict } from "./rate-limit.server";
import type { MembershipTier } from "./model-routing.server";

export type QuotaStatus = {
  tier: MembershipTier;
  byok: boolean;
  quotas: QuotaVerdict[];
};

export const getQuotaStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QuotaStatus> => {
    const { getMembershipTier } = await import("./model-routing.server");
    const { quotaSnapshot } = await import("./rate-limit.server");
    const tier = await getMembershipTier(context.supabase as never, context.userId);
    const quotas = await quotaSnapshot(context.userId, tier);
    return { tier, byok: quotas.some((q) => q.byok), quotas };
  });
