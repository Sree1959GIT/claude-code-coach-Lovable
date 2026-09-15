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

const PROXY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** OpenAI-compatible endpoints exposed by each provider. */
const BYOK_URL: Record<KeyProvider, string> = {
  anthropic: "https://api.anthropic.com/v1/chat/completions",
  google: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
};

/** Model ladder used when the learner's own key is paying. */
const BYOK_MODELS: Record<KeyProvider, Record<InferenceRung, string>> = {
  anthropic: {
    cheap: "claude-haiku-4-5",
    standard: "claude-sonnet-4-5",
    premium: "claude-sonnet-4-5",
  },
  google: {
    cheap: "gemini-2.5-flash-lite",
    standard: "gemini-2.5-flash",
    premium: "gemini-2.5-pro",
  },
};

/** Preference order when a learner has stored more than one key. */
const PREFERENCE: KeyProvider[] = ["anthropic", "google"];

type CacheEntry = { at: number; provider: KeyProvider | null; key: string | null };
const CACHE_MS = 30_000;
const cache = new Map<string, CacheEntry>();

/** Cheapest correct lookup: one short-lived cache entry per learner. */
async function activeVaultKey(
  userId: string,
): Promise<{ provider: KeyProvider; key: string } | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return hit.provider && hit.key ? { provider: hit.provider, key: hit.key } : null;
  }

  for (const provider of PREFERENCE) {
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

/** Drop the cached decision for a learner (called when their vault changes). */
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
      url: BYOK_URL[active.provider],
      apiKey: active.key,
      model: BYOK_MODELS[active.provider][args.rung ?? "standard"],
      byok: true,
      provider: active.provider,
      label: active.provider === "anthropic" ? "Anthropic (your key)" : "Google AI (your key)",
    };
  } catch {
    return proxy;
  }
}
