# Phase F1 — Model routing optimization

## Goal
Cheap models check a shared answer cache first; model strength scales up by membership tier.

## Implementation
- Migration: `profiles.membership_tier` (`free` | `plus` | `pro`, default `free`); `public.ai_response_cache`
  (`cache_key` unique, `task`, `model`, `tier`, `response`, `hits`, `last_hit_at`) — admin read policy,
  service-role writes.
- `src/lib/model-routing.server.ts` — per-task model ladder (cheap/standard/premium), `resolveModel`,
  `getMembershipTier`, SHA-256 tier-independent `cacheKeyFor`, `readCache`/`writeCache`, and
  `routedCompletion` (cache hit → return; miss → gateway call at the tier's rung → cache).
- `src/lib/tiers.functions.ts` — `getMyTier` (self) and admin-gated `setUserTier`.
- Wired call sites: `askMentor` (`mentor_chat`) and `enrichQuestionExplanations` (`enrich_explanation`).
- Admin learners table lists and edits each learner's tier.

## Notes
- Cache keys ignore tier on purpose, so premium generations are reused by every tier.
- Streaming mentor SSE path is unchanged; only non-streaming completions route through the cache.

## Next task
Phase F2 — Analytics tracking: generation costs alongside cache hit/miss records.
