# GitHub Sync + Stage 4 Plan

## Part 1 — Connect this project to GitHub

### Current state
- The project is already version-controlled by Lovable's internal storage backend.
- The `.git` file in the project root points to private Lovable remotes, not to a local GitHub repo you can push from directly.
- The correct way to get a GitHub repository is through Lovable's built-in **GitHub sync** feature.

### Steps to connect

1. **Open the Lovable editor** for this project:
   https://lovable.dev/projects/fa108a4c-d97d-4b5c-9fa8-87f1e2c1254a
2. Click the **Plus (+)** menu in the chat input (bottom-left).
3. Choose **GitHub → Connect project**.
4. Authorize the Lovable GitHub App on your GitHub account/organization.
5. Select the account where you want the repo created.
6. Lovable will create a **new, private** GitHub repository and start two-way sync automatically.

### What happens after
- Every change made in Lovable pushes to the GitHub repo.
- Every commit pushed to the active branch in GitHub syncs back into Lovable.
- The repository will be private by default.
- Do not rename or transfer the repo on GitHub, or sync can break.

### Alternative if you prefer manual control
- Use **Code Editor → Download codebase** (desktop, paid plan) to get a ZIP.
- Create a new private repo on GitHub and push the extracted files yourself.
- Note: this path is **one-way**; changes made in Lovable later will not sync to your manual repo.

---

## Part 2 — Stage 4: Adaptive Learning Engine

### Goal
Turn the current practice question runner into a personalized study system that schedules reviews, surfaces weak areas, and supports a full timed exam mode.

### What already exists
- `domains`, `questions`, `question_options`, `question_attempts` tables.
- Domain-level progress tracking (`fetchMyDomainProgress`).
- Basic analytics page with attempts, accuracy, and 14-day cadence.
- Mentor agent with streaming text + voice summary.

### New schema work

1. **Per-user mastery table** `user_mastery`
   - `user_id`, `question_id`, `status` (new / learning / review / mastered / lapsed), `due_at`, `stability`, `difficulty`, `reps`, `lapses`, `last_attempt_at`, `last_attempt_correct`.
   - Captures FSRS-like state for each question.

2. **Practice sessions table** `practice_sessions`
   - `id`, `user_id`, `mode` (adaptive / weak-area / timed-exam), `domain_id` (nullable), `started_at`, `ended_at`, `target_count`, `time_limit_ms`.
   - Allows resuming or reviewing past sessions.

3. **Indexes and RLS**
   - RLS policies so users can only read/write their own mastery/session rows.
   - GRANT statements for authenticated and service_role.

### Backend logic

1. **FSRS scheduler** (`src/lib/fsrs.ts`)
   - Minimal FSRS-4.5 implementation: update `stability`, `difficulty`, `retrievability`, and next `due_at` after each attempt.
   - Inputs: previous state, rating (correct/incorrect), elapsed days.
   - Outputs: new state and next review interval.

2. **Adaptive question selector** (`src/lib/adaptive.ts`)
   - `getNextQuestion(userId, mode, domain)`:
     - **Adaptive mode**: due reviews first, then new questions, then re-introduce lapsed items.
     - **Weak-area mode**: lowest accuracy / longest time / most-lapsed questions first.
     - **Timed-exam mode**: stratified sample across all domains weighted by domain weight.
   - Avoid repeats within the same session until the pool is exhausted.

3. **Session engine** (`src/lib/session.ts`)
   - Start a session, fetch next question, record answer, update mastery, end session.
   - Server functions exposed via `createServerFn` for authenticated users.

### Frontend work

1. **Study Hub redesign** (`src/routes/_authenticated/study.index.tsx`)
   - Three entry cards: **Adaptive Review**, **Weak-Area Drill**, **Timed Exam**.
   - Show counts: due today, new, lapsing, mastered.
   - Keep existing domain selector as a fourth option.

2. **Adaptive question runner** (`src/routes/_authenticated/study.$slug.tsx` or new route)
   - Reuse the three-frame layout.
   - Add session state header: mode, progress, timer, elapsed time.
   - After answering, show the explanation + correct highlight + next-question CTA.
   - Store the answer in the session and update FSRS state.

3. **Timed exam mode** (`src/routes/_authenticated/exam.tsx` or new route)
   - 65 questions / 90 minutes (configurable).
   - Sticky timer bar with warning states.
   - Review screen at end showing score, per-domain breakdown, flagged questions, and recommended next actions.
   - No mentor access during the exam; enable it in review mode.

4. **Analytics dashboard v2** (`src/routes/_authenticated/analytics.tsx`)
   - Add: mastery over time, due queue size, weak-area domains, predicted retention curve.
   - Keep existing charts.
   - Add a "Study streak" and "Average time per question" metric.

5. **Dashboard updates** (`src/routes/_authenticated/dashboard.tsx`)
   - Add quick stats: mastered today, due now, next timed exam recommendation.
   - Deep links to Adaptive Review, Weak-Area Drill, and Timed Exam.

### Integration with mentor
- Allow mentor to be opened during review mode and in weak-area drills.
- Disable mentor during timed exam to preserve exam integrity.
- After an answer, pre-fill the mentor with the current question context.

### Testing & verification
- Type-check the whole project after schema and frontend changes.
- Run through: start adaptive session → answer correctly → answer incorrectly → verify FSRS state updates.
- Run a timed exam with a small question count (e.g., 5 questions / 2 minutes) to verify timer and scoring.
- Check RLS by ensuring a second test account cannot see the first user's mastery rows.

### Estimated credit cost
- Stage 4 implementation: **150–260 build credits**.
- Data migration + FSRS tuning: **10–20 credits**.
- GitHub sync setup itself: **0 credits** (Lovable feature, not charged per project).

### Deliverables at end of Stage 4
- A private GitHub repo synced with Lovable.
- Database schema for mastery, sessions, and FSRS scheduling.
- Adaptive review, weak-area drill, and timed exam modes.
- Updated analytics dashboard with mastery and retention signals.
- Verified RLS and type-safe build.

## Next decisions to confirm
1. Should the timed exam use the **full 65 questions / 90 minutes** by default, or default to a smaller practice exam size?
2. Should incorrect answers in adaptive mode be **immediately re-shown** after a short delay, or queued for the next day?
3. Should weak-area drill prioritize **lowest accuracy** or **most recent mistakes** first?
4. Do you want to **continue with Stage 4** immediately after GitHub sync, or pause to review the synced repo first?