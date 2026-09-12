# Phase F2 — AI usage analytics (costs + cache hit/miss)

## Goal
Record what every AI generation costs, and keep strict records of cache hits versus misses.

## Implementation
- Migration: `public.ai_usage_events` (`task`, `model`, `tier`, `cached`, `cache_key`,
  `prompt_tokens`, `completion_tokens`, `estimated_credits`, `saved_credits`, `duration_ms`,
  `ok`, `error`) — admin-only read policy, service-role writes, indexes on date/task/cached.
- `src/lib/model-routing.server.ts`: added `CREDITS_PER_1K` cost model, `estimateCredits`,
  and fire-and-forget `logUsageEvent`. `routedCompletion` now logs every outcome:
  - cache hit → `cached: true`, `estimated_credits: 0`, `saved_credits` = what the tier's
    model would have cost,
  - miss → real gateway `usage` tokens and estimated credits,
  - gateway/network failure → `ok: false` with the surfaced error message.
- `src/lib/mentor.functions.ts`: passes `userId` so cost is attributable.
- `src/lib/usage.functions.ts`: admin-gated `getUsageSummary({ days })` returning totals,
  hit rate, credits spent vs saved, per-task rows and per-model spend.

## Notes
- Credit rates are approximate — for comparing tasks and quantifying cache savings, not billing.
- Telemetry failures are swallowed; they never break a learner-facing response.

## Next task
Phase F3 — Admin usage board surfacing these statistics.
