/**
 * Phase F6 — rate constraint guards.
 *
 * Daily, per-learner quotas for the three AI surfaces that spend credits:
 * mentor turns, code generation runs and text-to-speech. Counting is done
 * against `rate_events` over a rolling UTC day; a learner running on their own
 * (BYOK) provider key bypasses the caps, because those calls never touch the
 * shared Lovable allowance.
 *
 * Server-only. Every failure path fails OPEN: telemetry must never be the
 * reason a learner cannot study.
 */

import type { MembershipTier } from "./model-routing.server";

export type RateAction = "mentor" | "codegen" | "tts";

export const RATE_ACTIONS: RateAction[] = ["mentor", "codegen", "tts"];

const LABEL: Record<RateAction, string> = {
  mentor: "mentor replies",
  codegen: "code generation runs",
  tts: "spoken answers",
};

/** Daily allowance per membership tier. */
const QUOTA: Record<RateAction, Record<MembershipTier, number>> = {
  mentor: { free: 40, plus: 200, pro: 500 },
  codegen: { free: 5, plus: 20, pro: 60 },
  tts: { free: 20, plus: 100, pro: 300 },
};

/** Short-window throttle: at most N calls per burst window. */
const BURST: Record<RateAction, { max: number; windowMs: number }> = {
  mentor: { max: 8, windowMs: 60_000 },
  codegen: { max: 3, windowMs: 120_000 },
  tts: { max: 15, windowMs: 60_000 },
};

export type QuotaVerdict = {
  action: RateAction;
  allowed: boolean;
  /** Calls used inside the current UTC day. */
  used: number;
  limit: number;
  remaining: number;
  /** ISO timestamp of the next UTC midnight. */
  resetAt: string;
  /** True when an active vault key lifted the cap. */
  byok: boolean;
  /** Set when `allowed` is false — safe to show to the learner. */
  message?: string;
  /** Present when the short-window throttle (not the daily cap) blocked it. */
  retryAfterMs?: number;
};

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function nextUtcMidnight(): string {
  const start = startOfUtcDay();
  return new Date(start.getTime() + 86_400_000).toISOString();
}

export function quotaFor(action: RateAction, tier: MembershipTier): number {
  return QUOTA[action][tier];
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** True when this learner has an active, valid key of their own. */
async function hasActiveVaultKey(userId: string): Promise<boolean> {
  try {
    const { resolveInferenceTarget } = await import("./inference-target.server");
    const target = await resolveInferenceTarget({ userId, proxyModel: "probe" });
    return target.byok;
  } catch {
    return false;
  }
}

/**
 * Checks — but does not consume — a learner's allowance for one action.
 * Callers record the call with `recordRateEvent` once it actually runs.
 */
export async function checkQuota(args: {
  userId: string;
  action: RateAction;
  tier: MembershipTier;
  /** Skip the BYOK lookup when the caller already resolved it. */
  byok?: boolean;
}): Promise<QuotaVerdict> {
  const { userId, action, tier } = args;
  const limit = quotaFor(action, tier);
  const resetAt = nextUtcMidnight();
  const byok = args.byok ?? (await hasActiveVaultKey(userId));

  if (byok) {
    return { action, allowed: true, used: 0, limit, remaining: limit, resetAt, byok: true };
  }

  try {
    const db = await admin();
    const since = startOfUtcDay().toISOString();
    const { data, error } = await db
      .from("rate_events")
      .select("created_at")
      .eq("user_id", userId)
      .eq("action", action)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;

    const rows = data ?? [];
    const used = rows.length;
    const remaining = Math.max(0, limit - used);

    if (used >= limit) {
      return {
        action,
        allowed: false,
        used,
        limit,
        remaining: 0,
        resetAt,
        byok: false,
        message: `Daily limit reached — you've used all ${limit} ${LABEL[action]} for today on the ${tier} plan. It resets at midnight UTC, or add your own provider key to lift the cap.`,
      };
    }

    // Short-window throttle, so one runaway client cannot burn a whole day.
    const burst = BURST[action];
    const cutoff = Date.now() - burst.windowMs;
    const recent = rows.filter((r) => new Date(r.created_at as string).getTime() >= cutoff);
    if (recent.length >= burst.max) {
      const oldest = new Date(
        recent[recent.length - 1]!.created_at as string,
      ).getTime();
      const retryAfterMs = Math.max(1000, oldest + burst.windowMs - Date.now());
      return {
        action,
        allowed: false,
        used,
        limit,
        remaining,
        resetAt,
        byok: false,
        retryAfterMs,
        message: `Slow down a moment — too many ${LABEL[action]} in a short burst. Try again in about ${Math.ceil(retryAfterMs / 1000)} seconds.`,
      };
    }

    return { action, allowed: true, used, limit, remaining, resetAt, byok: false };
  } catch {
    // Fail open: a counting failure must not block study.
    return { action, allowed: true, used: 0, limit, remaining: limit, resetAt, byok: false };
  }
}

/** Fire-and-forget: records that one guarded call actually ran. */
export async function recordRateEvent(args: {
  userId: string;
  action: RateAction;
  byok?: boolean;
}): Promise<void> {
  try {
    const db = await admin();
    await db.from("rate_events").insert({
      user_id: args.userId,
      action: args.action,
      byok: Boolean(args.byok),
    });
  } catch {
    // Never break a response over accounting.
  }
}

/** Thrown message is already learner-friendly. */
export class RateLimitError extends Error {
  readonly verdict: QuotaVerdict;
  constructor(verdict: QuotaVerdict) {
    super(verdict.message ?? "Rate limit reached.");
    this.name = "RateLimitError";
    this.verdict = verdict;
  }
}

/** Check-or-throw helper for server functions. */
export async function enforceQuota(args: {
  userId: string;
  action: RateAction;
  tier: MembershipTier;
  byok?: boolean;
}): Promise<QuotaVerdict> {
  const verdict = await checkQuota(args);
  if (!verdict.allowed) throw new RateLimitError(verdict);
  return verdict;
}

/** All three counters at once, for the UI and for API responses. */
export async function quotaSnapshot(
  userId: string,
  tier: MembershipTier,
): Promise<QuotaVerdict[]> {
  const byok = await hasActiveVaultKey(userId);
  return Promise.all(
    RATE_ACTIONS.map((action) => checkQuota({ userId, action, tier, byok })),
  );
}
