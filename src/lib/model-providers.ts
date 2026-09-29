/**
 * F1 — provider registry (client-safe; no secrets).
 *
 * One list of every inference provider the app can route to: the built-in
 * Lovable AI allowance plus learner-key (BYOK) providers. Server routing
 * (`inference-target.server.ts`) and the Settings picker both read it.
 */

export type ProviderId = "lovable" | "anthropic" | "google";
export type ProviderPref = "auto" | ProviderId;
export type ModelRung = "cheap" | "standard" | "premium";

export type ProviderEntry = {
  id: ProviderId;
  label: string;
  kind: "built-in" | "your-key";
  description: string;
  /** OpenAI-compatible chat completions endpoint. */
  url: string;
  models: Record<ModelRung, string>;
};

export const PROVIDERS: Record<ProviderId, ProviderEntry> = {
  lovable: {
    id: "lovable",
    label: "Built-in (included with your plan)",
    kind: "built-in",
    description: "Always available. Uses your plan's daily allowance.",
    url: "https://ai.gateway.lovable.dev/v1/chat/completions",
    models: {
      cheap: "google/gemini-2.5-flash-lite",
      standard: "google/gemini-3-flash-preview",
      premium: "google/gemini-2.5-pro",
    },
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude (your key)",
    kind: "your-key",
    description: "Runs on the Anthropic key you saved. No plan allowance used.",
    url: "https://api.anthropic.com/v1/chat/completions",
    models: { cheap: "claude-haiku-4-5", standard: "claude-sonnet-4-5", premium: "claude-sonnet-4-5" },
  },
  google: {
    id: "google",
    label: "Google Gemini (your key)",
    kind: "your-key",
    description: "Runs on the Google AI key you saved. No plan allowance used.",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    models: { cheap: "gemini-2.5-flash-lite", standard: "gemini-2.5-flash", premium: "gemini-2.5-pro" },
  },
};

export const PROVIDER_PREFS: ProviderPref[] = ["auto", "lovable", "anthropic", "google"];

export function isProviderPref(v: unknown): v is ProviderPref {
  return typeof v === "string" && (PROVIDER_PREFS as string[]).includes(v);
}
