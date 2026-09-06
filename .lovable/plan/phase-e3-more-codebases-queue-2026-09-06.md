# Phase E3 — "More Codebases" demand toggle

## Goal
Let a learner pull in extra worked examples without ever waiting: the primary cached
example stays interactive while 2–3 more are fetched in the background and appended as tabs.

## What shipped

### `src/lib/codebases.ts`
- `fetchMoreCodebases(conceptTag, { excludeIds, limit = 3 })` — read-only lookup that first
  drains any other rows sharing the concept tag, then tops up from related concepts.
  Never generates; returns at most `limit` codebases.

### `src/components/StudyCanvasTabs.tsx`
- New optional props `moreState` / `moreCount` / `onLoadMore` plus a `More_Codebases`
  toolbar button that reflects state: `More_Codebases` → `Queuing…` → `+N_Loaded` / `No_More`.
- Hidden entirely (`unavailable`) when the question has no concept tag.

### `src/routes/_authenticated/study.$slug.tsx`
- `moreRequested` state, reset whenever the concept tag changes.
- `useQuery(["codebases-more", conceptTag, primaryId])` — `enabled` only after the toggle,
  `staleTime: Infinity`, one-hour `gcTime`; excludes the primary example.
- Extra files are appended after the primary set, namespaced `concept_tag/file.py` and
  de-duplicated by name; only Python/JavaScript files are surfaced.
- Window subtitle shows `Cached · <title> · +N_More`.

## Verification
- `bunx tsgo --noEmit` passes.

## Handoff — Phase E4
Next: multi-agent code generation loop — Research (gaps) → SME (generate) → Verifier (execute)
→ Documentation (explain).
