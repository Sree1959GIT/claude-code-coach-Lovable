# Remaining Roadmap — 2-credit Sub-tasks

Each sub-task below is scoped to roughly 2 build credits and can be implemented and verified on its own. Stages 1–6b are complete; Stage 7 is complete through sub-task 9 (readiness model, readiness card, pass estimate, mock exam, score report, study plan, daily goals & streaks, readiness trend, mistake bank).

## Stage 7 — Exam Readiness (finish)

- 7.10 Mistake re-test mode: launch a session built only from open mistake-bank items, and mark items recovered on a correct re-answer.
- 7.11 Exam-day checklist card: countdown, readiness gate, environment/ID checklist, link to the booking page.
- 7.12 Session history page: list past practice and mock sessions with score, mode, duration and a link to each score report.
- 7.13 Shareable/printable score report: print-friendly layout plus a copy-summary action.
- 7.14 Domain confidence self-rating: per-domain 1–5 self-rating stored per user, blended as a small factor into the readiness display.

## Stage 8 — Content Scale-up

- 8.1 Bulk question import: admin CSV/JSON upload with schema validation and a dry-run preview.
- 8.2 AI question generator (draft): generate blueprint-aligned draft questions from library chunks into the review queue.
- 8.3 Duplicate/near-duplicate detector for questions using embeddings, surfaced in Content health.
- 8.4 Distractor quality audit: flag options never chosen or always chosen, and options missing explanations.
- 8.5 Explanation enrichment job: fill missing option explanations with grounded, cited text for admin approval.
- 8.6 Library source expansion: additional ingest presets (docs sets, changelogs) with tags and re-index.
- 8.7 Citation coverage report: percentage of questions with at least one linked library chunk, per domain.
- 8.8 Difficulty calibration: recompute question difficulty from live accuracy data and store the calibrated value.

## Stage 9 — Polish & Launch

- 9.1 Landing page refresh: feature sections, screenshots and social proof blocks.
- 9.2 Onboarding flow: first-run goal, exam date and diagnostic-quiz prompt for new accounts.
- 9.3 Diagnostic quiz: short blueprint-sampled quiz that seeds initial mastery and readiness.
- 9.4 Accessibility pass: focus states, keyboard flows in the exam runner and mentor panel, ARIA labels.
- 9.5 Mobile pass: study session, mentor panel and dashboard layouts at small widths.
- 9.6 Performance pass: route-level code splitting, query caching and reduced payloads on heavy dashboards.
- 9.7 SEO and metadata pass: unique titles/descriptions, JSON-LD, sitemap and robots.
- 9.8 Error and empty states: consistent error components, empty-state copy and retry actions across routes.
- 9.9 Analytics funnel: event coverage for signup, first session, mock exam and mentor usage, with an admin funnel view.
- 9.10 Pre-launch hardening: security scan review, RLS re-verification, rate limits on mentor and ingest endpoints.
- 9.11 Docs and help: in-app help page covering study modes, readiness scoring and the mentor.
- 9.12 Launch checklist: publish, custom domain guidance and final smoke test of all critical routes.

## Estimated credits

- Stage 7 remainder (5 sub-tasks): ~10 credits
- Stage 8 (8 sub-tasks): ~16 credits
- Stage 9 (12 sub-tasks): ~24 credits
- Total remaining: ~50 credits, plus buffer for iteration on AI-heavy items (8.2, 8.5).

## Technical notes

- New tables likely needed: `domain_confidence` (7.14) and a question-embedding column or table for 8.3; both need GRANTs plus owner-scoped or admin-only RLS.
- 8.1/8.2/8.5 route through existing admin server functions with `assertAdmin`, writing drafts into `content_reviews` rather than publishing directly.
- 7.10 reuses `startSession` with an explicit question-id list rather than the adaptive sampler.
- 8.8 writes calibrated difficulty back to `questions`, so the adaptive sampler and mock-exam allocator should read the calibrated value.
