# Phase E2 — Primary Cached Example Lookup

## Goal
When a question is open, the Study Canvas loads its pre-built codebase instantly by concept tag. No generation, no waiting.

## What shipped

### Database
Applied two migrations that existed as files but had never reached the backend:
- `code_executions` (Phase D7 telemetry, owner-scoped RLS)
- `codebases` (Phase E1 schema + public read policy + `agent_loop` / `context_trim` seeds)

Added two more seeded examples matching concept tags already used by live questions:
- `prompt_caching` — "Prompt Caching Breakpoints" (Python)
- `tool_routing` — "Tool Routing Table" (JavaScript)

### `src/lib/codebases.ts`
- `toConceptTag(value)` — normalises a free-form `key_concept` ("Prompt caching") to a canonical tag (`prompt_caching`).
- `fetchCodebaseByConcept(tag)` — single indexed lookup, oldest row wins, returns `null` on miss. Read-only; never generates.

### `src/routes/_authenticated/study.$slug.tsx`
- `useQuery(["codebase", conceptTag])` with `staleTime: Infinity` and a one-hour `gcTime`, so revisiting a concept is served from the client cache with zero network cost.
- `canvasFiles` maps the jsonb payload to `CanvasFile[]`, filtered to `python` / `javascript`, falling back to `SAMPLE_CANVAS_FILES` on a cache miss.
- Floating-window subtitle reflects state: `Cached · <title>`, `Loading_Example`, or `Code_Workspace`.
- `StudyCanvasTabs` is keyed by concept tag so tabs/console reset cleanly between questions.

## Verification
- `bunx tsgo --noEmit` passes.
- Live browser check: `prompt_caching`, `tool_routing`, `agent_loop` all resolve to their titled examples; an unknown tag returns `null`.

## Handoff — Phase E3
Next: "More Codebases" demand toggle — queue 2–3 additional examples in the background (async) so the learner is never blocked, surfacing them as extra tabs when ready.
