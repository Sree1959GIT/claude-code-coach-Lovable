# Phase F5 — Validation gates (BYOK overrides proxy balance)

## What shipped
- `src/lib/inference-target.server.ts` — per-learner resolver returning `{ url, apiKey, model,
  byok, provider, label }`. Picks an active, unpaused, shape-valid vault key (Anthropic first,
  then Google) via `getActiveKey`, maps the tier rung to a provider-native model, and falls back
  to the Lovable proxy on any miss or error. 30s in-process cache per learner; invalidated from
  the vault mutations in `byok.functions.ts`.
- `src/lib/model-routing.server.ts` — `routedCompletion` resolves the target after the cache
  lookup; BYOK calls log 0 Lovable credits and record the proxy-rung cost as savings.
  BYOK-specific 401/402 messages point at the provider account, not Lovable credits.
- `src/lib/agents/explainer.agent.server.ts` / `evaluator.agent.server.ts` — streaming and
  buffered paths both route through the resolver; traces record the model actually used.
  Both accept an optional `userId`, falling back to `trace.userId`.
- `src/routes/api/mentor-stream.ts` — passes the authenticated `userId` into the agent args.

## Notes
- Both provider endpoints are OpenAI-compatible chat completions, so the existing retry/stream
  helper is reused unchanged; `max_tokens` is only sent on BYOK calls.
- Decrypted keys stay inside server modules; nothing is logged or returned to the browser.

## Next active task
Phase F6 — rate constraint guards (daily quotas + throttling for mentor, generation, TTS).
