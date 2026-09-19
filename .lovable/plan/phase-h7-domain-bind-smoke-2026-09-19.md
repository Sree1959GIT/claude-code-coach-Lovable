# Phase H7 — Domain bind smoke deployment

## Goal
Bind the app to the live backend instance and prove the core transaction
pathways work end to end with a real signed-in account.

## What was done

### 1. Live parameter binding
- The client `.env` pointed at a dead backend reference (`cnjijbugikoitgiuopme`).
- Re-bound the runtime through `rebind_secrets`; `.env` now targets the live
  instance `saouoettszgansrjgoad` and the dev server was restarted.
- `supabase/config.toml` still carries the stale reference; it is generated and
  unused at runtime, so it was left untouched.

### 2. Smoke pass (Playwright, authenticated)
Scripts under `/tmp/browser/h7/`, sessions minted with `lovable auth-session`.

| Pathway | Result |
| --- | --- |
| Landing + light/dark | renders, no console errors |
| Sign-in / redirect gate | unauthenticated `/study`, `/dashboard` redirect to `/auth` |
| Dashboard (readiness, plan, streak) | loads with live data |
| Study question + answer submit | attempt written, explanation revealed |
| Study Canvas (tabs, run, console) | Python/JS run, output and timing shown |
| Mentor stream | SSE tokens, citations, quota headers returned |
| FSRS write path | `practice_sessions` → `question_attempts` → `user_mastery` upsert confirmed |
| Admin console (admin role) | all sections present: BYOK, USAGE, CODE_GENERATION, SPIDER, PARITY, DEFRAG |
| BYOK vault | panel renders, no stored keys, provider verification gate intact |

### 3. Defect fixed
Hydration mismatch on every SSR route: the inline theme bootstrap script sat
after `<HeadContent />` in `src/routes/__root.tsx`, so route-level tags
(JSON-LD) shifted its index between server and client. Moved the script to the
first head child with a stable key. Head-order mismatch is gone.

Remaining dev-only artifact: a redirect into the lazily loaded `/auth` route
logs one recoverable hydration notice under Vite dev. Production build is clean.

### 4. Verification
- `bunx tsgo --noEmit` — pass.
- `bun run build` — pass.

## Next
Phase H2 (semantic accessibility) per the saved H2 plan.
