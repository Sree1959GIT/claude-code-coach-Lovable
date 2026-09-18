# Phase H5 — Candidate onboarding flow

## What shipped
- Migration: `profiles` gains `exam_date`, `target_score` (50–100), `weekly_hours` (1–60), `onboarded_at`.
- `src/lib/onboarding.functions.ts` — auth-scoped `getOnboarding` / `saveOnboarding` (upsert on own profile row).
- `src/components/OnboardingWizard.tsx` — 5-step modal (exam date → target score band → weekly hours → per-domain confidence → plan summary), shown on `/dashboard` only when `onboarded_at` is null, skippable per session.
- Completion writes prefs, saves per-domain confidence via `setDomainConfidence`, mirrors `ccaf.exam_date` and `ccaf.daily_goal` to localStorage (seeding the FSRS study plan + daily goal cards), and invalidates readiness/mastery/confidence queries so the forecast renders immediately.
- `dailyQuestionsFromHours(h)` = weekly hours → questions/day at ~75s per question (min 3).

## Verification
- `bunx tsgo --noEmit` clean.
- Playwright: authenticated `/dashboard` renders the wizard at step 1/5 over the dashboard content.

## Next
Phase H6 — penetration audit pass (RLS review, dependency scan, loose database configuration cleanup).
