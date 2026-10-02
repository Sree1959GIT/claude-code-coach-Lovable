# Phase 3 and Phase 4 (proposed) + what is still open

Both GitHub copies are in sync (bcd864e). Phases 3 and 4 were never defined in the project notes — the log ends at Phase 2 with "plan Phase 3". Below is a proposal; approve or edit it.

## Still open from earlier work
1. Publishing is blocked by 4 critical security findings that were never fixed or dismissed.
2. This project's database has no domains or questions — your content is in the old copy.
3. Dashboard, Progress pages and Mock exam still mix figures from all exams (only Study and readiness are separated).
4. Not yet tried in a real browser: spoken playback, on-device listening, the Ollama mentor, a full research-and-import run.
5. Offer still open: a "One / Several answers" column in the admin question list.

## Phase 3 — Check, separate and unblock
- P3.1 Fix or knowingly dismiss the 4 security findings, then publish.
- P3.2 Keep exams separate everywhere: Dashboard, Progress (analytics, mistakes, history, report) and Mock exam read only the active exam.
- P3.3 Bring content in: seed the CCAF areas and blueprint weights, plus a guided import of your existing questions.
- P3.4 Browser check of voice, listening, Ollama and research import; fix what breaks.

## Phase 4 — Measure and tune the mentor
- P4.1 Speed panel on Traces: time to first words and first voice, split by cloud / Ollama / Jev-routed / keyword fallback.
- P4.2 Jev tuning from real data: adjust the 700 ms budget and library-skip threshold from the agreement numbers.
- P4.3 Ollama mentor gets the same exam context and Jev focus as the cloud mentor.
- P4.4 "One / Several answers" column and filter in the admin question list.

Each item is sized for about 2 credits. AGENTS.md and the sprint log are updated after each.

## Technical details
- P3.2: add `exam_id` filtering via `domains.exam_id` joins in analytics, mistakes, history, report and mock-exam samplers; RLS unchanged.
- P3.3: migration with literal INSERTs for CCAF domains; import reuses bulk import.
- P4.1: reads `agent_runs.metadata.ttft_ms` and `routedBy`; no schema change.
- `has_role` untouched; per-exam isolation verified after each step.
