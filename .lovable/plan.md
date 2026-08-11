# Roadmap: what's left after Stage 6

Stages 1–6 core are built (landing + auth, study hub + exam UI + analytics, voice mentor, adaptive engine, RAG library, multi-agent backbone with tracing, critic, token rollup, memory, fallback).

What remains falls into one finished-out stage (6b) plus three new stages. Every sub-task below is scoped to roughly 2 credits.

---

## Stage 6b — Admin, scheduling and agent quality (remaining Stage 6 options)

1. Role-gated admin shell: `/admin` route + nav entry, visible only to `admin` role via `has_role`.
2. Admin users view: list learners with attempts, mastery counts, last active.
3. Admin content view: questions/domains table with publish/unpublish toggle.
4. Question authoring form: create/edit a question with options and explanation.
5. Human review queue schema: `content_reviews` table (status, reviewer, notes) + RLS + grants.
6. Review queue UI: approve/reject agent- or admin-drafted questions.
7. Cron endpoint `/api/public/cron/refresh-library` with shared-secret verification.
8. Scheduled re-index job: re-embed stale library chunks, log a run row.
9. Job run history panel inside the admin shell.
10. Eval harness schema: `agent_evals` golden set table + grants.
11. Eval runner: replay golden prompts through the orchestrator, score with the critic.
12. Eval dashboard: score trend per intent, regression flags.

Estimate: 180–320 credits.

---

## Stage 7 — Exam readiness and reporting

1. Readiness score model: blend mastery, coverage, recency into a 0–100 score.
2. Readiness card on the dashboard with domain-level gaps.
3. Predicted-pass estimate with confidence band on analytics.
4. Full mock exam mode: 65 questions / 90 minutes, per-domain blueprint weighting.
5. Mock exam review screen: per-domain breakdown, flagged items, mentor unlock.
6. Exam attempt history table + trend chart.
7. Study plan generator: N-day plan from readiness gaps.
8. Daily goal tracking + streaks.
9. PDF/print export of a score report.
10. Email summary of weekly progress (transactional email).

Estimate: 200–340 credits.

---

## Stage 8 — Content scale-up

1. Bulk question import (CSV/JSON) with schema validation and dry-run.
2. Import error report UI.
3. Duplicate-question detection using embeddings.
4. Library source manager: add/remove source URLs, track last crawl.
5. Authenticated source fetching for gated course material.
6. Chunk quality pass: strip boilerplate, merge tiny chunks.
7. Per-domain coverage report against the exam blueprint.
8. Agent-assisted question drafting from library passages, into the review queue.

Estimate: 160–280 credits.

---

## Stage 9 — Polish, performance and launch

1. Mobile layout pass for the three-frame study view.
2. Accessibility pass: focus order, ARIA on mentor controls, reduced-motion for blink highlights.
3. Loading/skeleton states and error boundaries on every route.
4. Route-level SEO metadata and Open Graph images.
5. Onboarding flow for first-time users.
6. Rate limiting on mentor and TTS endpoints per user.
7. Cost guardrails: per-user daily token budget with graceful message.
8. Final security scan, RLS re-verify, dependency scan.
9. Publish, custom domain, and post-launch smoke test.

Estimate: 140–240 credits.

---

## Technical notes

- Admin surfaces reuse the existing `has_role` security-definer function; no role columns on profile tables.
- Cron endpoints live under `src/routes/api/public/*` and verify a shared secret in the handler.
- Eval runner reuses `critique()` from `critic.agent.server.ts` so scoring stays consistent with live traces.
- New tables each get GRANTs plus RLS policies in the same migration.
- The in-app Roadmap Estimator (`src/lib/credit-estimates.ts`) will be extended with Stages 7–9 so estimates stay visible in the app.

## To confirm

- Start with Stage 6b (admin + cron + evals), or jump to Stage 7 (exam readiness) since it is more learner-visible?
