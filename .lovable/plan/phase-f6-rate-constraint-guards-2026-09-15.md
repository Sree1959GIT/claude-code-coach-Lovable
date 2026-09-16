# Phase F6 — Rate constraint guards

## What shipped
- Migration: `rate_events` (user_id, action, byok, created_at) with owner + admin read policies,
  service-role writes, and a `(user_id, action, created_at desc)` index.
- `src/lib/rate-limit.server.ts` — daily UTC quotas and short-window burst throttles per
  membership tier:
  | action  | free | plus | pro | burst          |
  |---------|------|------|-----|----------------|
  | mentor  | 40   | 200  | 500 | 8 / 60s        |
  | codegen | 5    | 20   | 60  | 3 / 120s       |
  | tts     | 20   | 100  | 300 | 15 / 60s       |
  Exposes `checkQuota`, `enforceQuota` (throws `RateLimitError` with a learner-friendly message),
  `recordRateEvent`, and `quotaSnapshot`. An active vault key (`resolveInferenceTarget().byok`)
  bypasses every cap. All counting failures fail OPEN.
- `src/lib/quotas.functions.ts` — authenticated `getQuotaStatus` returning tier, BYOK flag and
  all three counters.
- Enforcement wired into `askMentor`, `synthesizeSpeech` (both now return a `quota` block),
  `generateCodebaseDraft`, and the `/api/mentor-stream` route (429 + `Retry-After` +
  `X-Mentor-Quota` header, and the same header on successful streams).

## Notes
- Counters are call-based, not token-based; token economics stay in `ai_usage_events` (F2/F3).
- The only linter warning is the intentional `public.has_role` SECURITY DEFINER baseline.

## Next active task
Phase H1 — layout reflow pass for multi-frame canvas drawers on mobile viewports.
