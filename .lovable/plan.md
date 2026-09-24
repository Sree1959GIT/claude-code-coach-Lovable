# G4 — Create-an-exam wizard

Both GitHub copies are in sync (same commit, 6bf0a7f), so the next task is G4.

## What you'll get
Admins get a new **"Create an exam"** button in the exam switcher and the Admin console. It opens a four-step wizard:

1. **Name**: full name, short name, description, pass mark, question count, and time limit.
2. **Blueprint with provenance**: add study areas (title and weight %), each with a source (official guide URL, "entered by hand" or "AI suggested"). An optional **Suggest blueprint** button asks the AI for areas based on the exam name, and marks them "AI suggested — check before publishing". The weights must add up to 100% before you can continue.
3. **Scope**: pick starter questions per area (0–20) and choose whether to generate them now or leave the exam empty.
4. **Building**: a live progress list (exam saved → areas saved → questions per area generated) with a status for each line. When it finishes, you can switch to the new exam.

New exams start as `draft` and stay hidden from learners until an admin publishes them. Publishing sets them to `ready`.

## Technical details
- Migration: add `source_url text` and `provenance text default 'manual'` to `domains`; add a `exam_build_jobs` table (exam_id, status, steps jsonb, error, created_by, timestamps) with GRANTs, RLS set to admin read only and writes by the service role. Change the exam read policy so anon and learners see only `status = 'ready'`, while admins see all exams.
- `src/lib/exam-builder.functions.ts` (requireSupabaseAuth plus an admin check through has_role):
  - `suggestBlueprint` calls the AI Gateway and returns JSON areas.
  - `createExam` inserts the exam and domains, creates the job and returns its id.
  - `runExamBuild` loops over the areas and reuses the existing question generator (`generate.server.ts`), inserting the questions as drafts into the review queue. It updates the job steps after each area.
  - `getExamBuildJob` is polled every 2s by step 4.
  - `publishExam`.
- `src/components/CreateExamWizard.tsx` is a dialog with a stepper, using the existing tokens and Terminal Blueprint styling.
- Entry points: an admin-only item in `ExamSwitcher`, and a button on the admin Content page.
- The fixed "Foundation Prep" / CCAF wording stays untouched (that was handled in G3).
- Update AGENTS.md and roadmap.md: tick G4, and set Next to G5.
- Verify with a typecheck, then a Playwright run through the wizard as admin.
