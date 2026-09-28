/**
 * Phase F5 — validation gates.
 *
 * Decides, per learner, whether an inference call runs on the learner's own
 * (BYOK) provider key or on the shared Lovable proxy allowance. An active,
 * unpaused, shape-valid key in the vault overrides proxy/tier balance gating;
 * anything else falls straight back to the proxy ladder.
 *
 * Server-only. Decrypted keys never leave this module's callers.
 */

import { getActiveKey, validateKeyShape, KEY_PROVIDERS, type KeyProvider } from "./byok.server";
import { PROVIDERS, isProviderPref, type ProviderPref } from "./model-providers";

export type InferenceRung = "cheap" | "standard" | "premium";

export type InferenceTarget = {
  /** OpenAI-compatible chat completions endpoint. */
  url: string;
  apiKey: string;
  model: string;
  /** True when the learner's own key paid for the call. */
  byok: boolean;
  provider: KeyProvider | null;
  /** Human label for error messages and traces. */
  label: string;
};

const PROXY_URL = PROVIDERS.lovable.url;

/** Default preference order when the learner picked "Automatic". */
const PREFERENCE: KeyProvider[] = ["anthropic", "google"];

type CacheEntry = { at: number; provider: KeyProvider | null; key: string | null };
const CACHE_MS = 30_000;
const cache = new Map<string, CacheEntry>();

/** F2 — the learner's saved provider choice (defaults to automatic). */
async function providerPref(userId: string): Promise<ProviderPref> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("preferred_provider")
      .eq("id", userId)
      .maybeSingle();
    const v = (data as { preferred_provider?: string } | null)?.preferred_provider;
    return isProviderPref(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

/** Cheapest correct lookup: one short-lived cache entry per learner. */
async function activeVaultKey(
  userId: string,
): Promise<{ provider: KeyProvider; key: string } | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return hit.provider && hit.key ? { provider: hit.provider, key: hit.key } : null;
  }

  const pref = await providerPref(userId);
  // "Built-in" means never use a stored key; a named provider is tried first.
  const order: KeyProvider[] =
    pref === "lovable"
      ? []
      : pref === "auto"
        ? PREFERENCE
        : [pref, ...PREFERENCE.filter((p) => p !== pref)];

  for (const provider of order) {
    if (!KEY_PROVIDERS.includes(provider)) continue;
    const key = await getActiveKey(userId, provider);
    // Validation gate: a paused, missing or malformed key never overrides the proxy.
    if (!key || validateKeyShape(provider, key)) continue;
    cache.set(userId, { at: Date.now(), provider, key });
    return { provider, key };
  }

  cache.set(userId, { at: Date.now(), provider: null, key: null });
  return null;
}

/** Drop the cached decision for a learner (called when their vault or choice changes). */
export function invalidateInferenceTarget(userId: string): void {
  cache.delete(userId);
}

/**
 * Resolve where a call should run. Falls back to the proxy on every failure
 * path, so a broken vault can never take the mentor offline.
 */
export async function resolveInferenceTarget(args: {
  userId?: string | null;
  proxyModel: string;
  rung?: InferenceRung;
}): Promise<InferenceTarget> {
  const proxyKey = process.env["LOVABLE_API_KEY"];
  const proxy: InferenceTarget = {
    url: PROXY_URL,
    apiKey: proxyKey ?? "",
    model: args.proxyModel,
    byok: false,
    provider: null,
    label: "Lovable AI",
  };

  if (!args.userId) return proxy;

  try {
    const active = await activeVaultKey(args.userId);
    if (!active) return proxy;
    return {
      url: PROVIDERS[active.provider].url,
      apiKey: active.key,
      model: PROVIDERS[active.provider].models[args.rung ?? "standard"],
      byok: true,
      provider: active.provider,
      label: active.provider === "anthropic" ? "Anthropic (your key)" : "Google AI (your key)",
    };
  } catch {
    return proxy;
  }
}
