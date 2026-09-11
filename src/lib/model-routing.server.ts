/**
 * Phase F1 — Model routing optimization.
 * Server-only. Every routed call checks the shared answer cache first, and only
 * on a miss does it hit the gateway with the model rung the learner's
 * membership tier unlocks (free → cheap, plus → standard, pro → premium).
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type MembershipTier = "free" | "plus" | "pro";
export const MEMBERSHIP_TIERS: MembershipTier[] = ["free", "plus", "pro"];

export type RoutedTask =
  | "mentor_chat"
  | "enrich_explanation"
  | "concept_summary"
  | "code_walkthrough";

type Rungs = { cheap: string; standard: string; premium: string };

/** Per-task model ladder. Keep every id inside the supported gateway catalog. */
const LADDER: Record<RoutedTask, Rungs> = {
  mentor_chat: {
    cheap: "google/gemini-3.1-flash-lite",
    standard: "google/gemini-3.6-flash",
    premium: "google/gemini-3.1-pro-preview",
  },
  enrich_explanation: {
    cheap: "google/gemini-3.1-flash-lite",
    standard: "google/gemini-3.6-flash",
    premium: "google/gemini-3.1-pro-preview",
  },
  concept_summary: {
    cheap: "google/gemini-3.1-flash-lite",
    standard: "google/gemini-3.6-flash",
    premium: "google/gemini-3.6-flash",
  },
  code_walkthrough: {
    cheap: "google/gemini-3.6-flash",
    standard: "google/gemini-3.7-flash",
    premium: "google/gemini-3.1-pro-preview",
  },
};

const RUNG_BY_TIER: Record<MembershipTier, keyof Rungs> = {
  free: "cheap",
  plus: "standard",
  pro: "premium",
};

export function normalizeTier(value: unknown): MembershipTier {
  return value === "plus" || value === "pro" ? value : "free";
}

/** The model a tier gets for a task, before any cache lookup. */
export function resolveModel(task: RoutedTask, tier: MembershipTier): string {
  return LADDER[task][RUNG_BY_TIER[tier]];
}

/** Reads the learner's membership tier; defaults to free on any failure. */
export async function getMembershipTier(
  db: { from: (t: string) => any },
  userId: string,
): Promise<MembershipTier> {
  try {
    const { data } = await db
      .from("profiles")
      .select("membership_tier")
      .eq("id", userId)
      .maybeSingle();
    return normalizeTier(data?.membership_tier);
  } catch {
    return "free";
  }
}

export type RoutedMessage = { role: "system" | "user" | "assistant"; content: string };

export type RoutedRequest = {
  task: RoutedTask;
  tier: MembershipTier;
  messages: RoutedMessage[];
  jsonMode?: boolean;
  /** Skip the shared cache (personalised or time-sensitive turns). */
  noCache?: boolean;
  label?: string;
};

export type RoutedResult = {
  text: string;
  model: string;
  cached: boolean;
  cacheKey: string;
  tier: MembershipTier;
};

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Cache key is tier-independent on purpose: an answer produced for a pro
 * learner is reused for everyone, so paid rungs subsidise the free tier.
 */
export async function cacheKeyFor(req: RoutedRequest): Promise<string> {
  return sha256(
    JSON.stringify({
      task: req.task,
      json: Boolean(req.jsonMode),
      messages: req.messages.map((m) => [m.role, m.content.trim()]),
    }),
  );
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function readCache(
  cacheKey: string,
): Promise<{ text: string; model: string } | null> {
  try {
    const db = await admin();
    const { data } = await db
      .from("ai_response_cache")
      .select("id, response, model, hits")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (!data?.response) return null;
    void db
      .from("ai_response_cache")
      .update({ hits: (data.hits ?? 0) + 1, last_hit_at: new Date().toISOString() })
      .eq("id", data.id);
    return { text: data.response, model: data.model };
  } catch {
    return null;
  }
}

export async function writeCache(args: {
  cacheKey: string;
  task: RoutedTask;
  model: string;
  tier: MembershipTier;
  response: string;
}): Promise<void> {
  try {
    const db = await admin();
    await db.from("ai_response_cache").upsert(
      {
        cache_key: args.cacheKey,
        task: args.task,
        model: args.model,
        tier: args.tier,
        response: args.response,
      },
      { onConflict: "cache_key" },
    );
  } catch {
    // Caching must never break a response.
  }
}

/**
 * Cache-first, tier-aware chat completion. Returns the answer text plus which
 * model produced it and whether it came from the cache.
 */
export async function routedCompletion(req: RoutedRequest): Promise<RoutedResult> {
  const label = req.label ?? "AI";
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const cacheKey = await cacheKeyFor(req);
  if (!req.noCache) {
    const hit = await readCache(cacheKey);
    if (hit) {
      return { text: hit.text, model: hit.model, cached: true, cacheKey, tier: req.tier };
    }
  }

  const model = resolveModel(req.task, req.tier);
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: req.messages,
      ...(req.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new Error(`${label} is rate limited. Try again in a moment.`);
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Lovable settings.");
    throw new Error(`${label} call failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (text && !req.noCache) {
    await writeCache({ cacheKey, task: req.task, model, tier: req.tier, response: text });
  }
  return { text, model, cached: false, cacheKey, tier: req.tier };
}
