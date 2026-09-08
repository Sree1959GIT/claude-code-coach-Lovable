# Phase E9 — Canvas ↔ question context + FSRS wire-up

## What shipped
- `src/lib/canvas-context.ts` — `CanvasQuestionContext`, `CanvasFsrs`,
  `fetchQuestionMastery(questionId)` (owner-scoped `user_mastery` read),
  `retrievability()` and `formatDue()` helpers.
- `src/components/CanvasContextPanel.tsx` — Docs section: question context
  profile (domain, item index, concept, concept tag, difficulty, selection),
  FSRS metrics (status, next review, stability, difficulty, reps/lapses,
  retrievability, last attempt), advice concept links, matched reference docs.
- `src/components/StudyCanvasTabs.tsx` — top-level Code / Video / Docs section
  tabs inside the floating window, header strip showing `Qn/total · concept_tag
  · fsrs status`, video grid with YouTube thumbnails and timestamped
  `VideoModal` playback, empty-file state moved into the code pane so Video and
  Docs stay reachable.
- `src/routes/_authenticated/study.$slug.tsx` — builds `canvasContext`, queries
  the FSRS row for the active question, invalidates it after each answer, and
  passes `context` / `fsrs` / `fsrsLoading` to the canvas.

## Next
Phase F1 — model routing optimization (cheap models check caches first,
scaling up by membership tier).
