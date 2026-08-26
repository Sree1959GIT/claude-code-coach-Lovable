# Enhancement Plan 2.0 — Agentic Authoring + CodeCanvas

Two new phases from the uploaded document, plus the polish backlog. Every sub-task below is scoped to roughly 2 build credits and can be built and verified on its own.

Decisions locked in: code runs in-browser (WASM) first with a provider interface so a container sandbox can be added later; BYOK is included; agentic authoring is built before CodeCanvas.

Already in place and reused rather than rebuilt: the `content_reviews` review queue table, the admin review-queue UI, agent tracing (`agent_runs` / `agent_steps` and `/traces`), library retrieval (`match_library_chunks`), duplicate detection via question embeddings, and the manual question authoring form.

---

## Phase A — Agentic Question Authoring (data + guardrails)

- A1. Draft lifecycle on questions: `status` (draft/published/archived), `author_id`, `origin` (manual/agentic); learner-facing reads restricted to published, admins see all.
- A2. `authoring_sources` registry: per-subject/domain allowed domains and URLs, enabled flag, no seeded defaults, admin-only access.
- A3. `question_drafts` store: payload JSON, run id, iteration, rationale, citations, diff base, so a loop can be resumed and compared to the live question.
- A4. Publish path hardening: approval handler flips status to published after a role check; the exam bank and samplers read published rows only.

## Phase B — Agentic Authoring (agent loop)

- B1. Setter (SME) agent: exam-faithful stem/scenario, four options, per-option explanation, domain, difficulty, cognitive level, structured output.
- B2. Researcher agent: library retrieval first, then whitelisted external sources; returns evidence passages, sub-topic candidates and citations, with a library-only fallback noted in the trace.
- B3. Adversary agent: attacks guessability, giveaway wording, position bias, overlapping distractors, multiple defensible answers, out-of-scope content.
- B4. Reviewer agent: rubric scoring (accuracy, exam fidelity, distractor quality, citation coverage) with verdict and required changes.
- B5. Authoring orchestrator: runs SME → Researcher → Adversary → Reviewer → SME with an iteration cap, cost/latency budget, per-step tracing, final reconciled draft.
- B6. Set-level context: the loop receives existing stems/answers in the domain or set to avoid duplication and repeated distractor shapes.
- B7. Edit mode: same loop seeded with an existing question or set, producing a proposed revision plus a field-level diff.

## Phase C — Agentic Authoring (UI + permissions)

- C1. Manual / Agentic mode switch on the authoring form; the existing manual form stays default and untouched.
- C2. Agentic workspace: brief input (domain, sub-topic, count, difficulty, notes) plus live per-agent run progress streamed over the existing SSE pattern.
- C3. Evidence and citations panel beside the draft, with links back to the source chunks.
- C4. Draft review and accept UI: side-by-side diff, inline field editing, accept / regenerate / reject writing the review decision.
- C5. `/reviews` queue page: filters by status and domain, claim-to-review, notes, approve/reject, publish on approval.
- C6. Batch set authoring: generate or revise N items in one run with per-item accept/reject and duplicate detection against the bank.
- C7. Source management UI for `authoring_sources`, with test-fetch validation.
- C8. Author/reviewer roles: extend the role model so admins can grant `author` and `reviewer`; discourage reviewer = author on the same item.
- C9. Hardening pass: 429/402 gateway error surfacing, retry, idempotent draft writes, empty/no-source states, trace links from every draft.

## Phase D — CodeCanvas (shell + execution)

- D1. Floating window shell: independent non-modal panel, draggable by title bar, resizable from edges, coexists with the Mentor drawer.
- D2. Position/size persistence per session plus close and reopen via a "Study Canvas" button.
- D3. Multi-file tabs with read-only, syntax-highlighted view (Python and JavaScript) and copy file / copy selection.
- D4. Execution provider interface + in-browser WASM runner (Pyodide for Python, isolated worker for JavaScript) behind a swappable adapter.
- D5. Run controls: 10-second timeout, cancel, stdout/stderr/return-value results pane.
- D6. Error display with line numbers and stack traces, plus pre-run syntax validation.
- D7. `code_executions` logging: timestamp, language, success/failure, duration, output size; owner-scoped.

## Phase E — CodeCanvas (content + generation)

- E1. `codebases` schema: concept tag, language, difficulty, description, file contents, advice data, cache key; plus grants and RLS.
- E2. Primary cached example: question loads its pre-built codebase instantly by concept tag; no regeneration.
- E3. "More Codebases" on-demand request: 2–3 extra examples, queued as a background job so the student keeps answering.
- E4. Multi-agent generation loop: Research (gaps) → SME (generate) → Verifier (execute) → Documentation (explain).
- E5. Quality gate: generated code is persisted only when execution succeeds; failures retry once, then surface as unavailable.
- E6. Progress tracking UI: step-by-step agent status with job history in `code_gen_jobs`.
- E7. Advice data: structured line-by-line walkthrough, design decisions, misconception corrections, concept linkages, follow-up questions.
- E8. Mentor integration: the mentor reasons over advice data with adaptive answer depth rather than reading a script.
- E9. Integration wiring: examples tagged by concept and tied to FSRS scoring, linked to the active question/domain, and the floating window gains tabs for code / video / docs.

## Phase F — Cost, BYOK and observability

- F1. Cost-aware routing: cheap/fast model first, escalation rules by tier.
- F2. Generation cost logging plus cache hit/miss tracking.
- F3. Admin cost dashboard: cache stats, savings from caching, popular concepts.
- F4. BYOK storage: encrypted per-user Anthropic/Google keys, masked display, rotate and delete.
- F5. BYOK validation on entry and routing override so a user's own key replaces shared quota; no subscription OAuth.
- F6. Per-user daily token budget with a graceful limit message, and rate limiting on mentor, TTS and generation endpoints.

## Phase G — Content scale-up remainder

- G1. Import error report UI for bulk imports.
- G2. Library source manager: add/remove source URLs with last-crawl tracking.
- G3. Authenticated source fetching for gated course material.
- G4. Chunk quality pass: strip boilerplate, merge tiny chunks, re-index.
- G5. Per-domain coverage report against the exam blueprint.

## Phase H — Polish and launch

- H1. Mobile layout pass for the three-frame study view and the floating canvas.
- H2. Accessibility pass: focus order, ARIA on mentor and canvas controls, reduced-motion for blink highlights.
- H3. Loading/skeleton states and error boundaries on every route.
- H4. Route-level SEO metadata and Open Graph images.
- H5. Onboarding flow for first-time users, including the diagnostic prompt.
- H6. Final security scan, RLS re-verification, dependency scan.
- H7. Publish, custom domain guidance, post-launch smoke test of critical routes.

---

## Credit estimate

| Phase | Sub-tasks | Credits |
|---|---|---|
| A. Authoring data + guardrails | 4 | 8 |
| B. Agent loop | 7 | 14 |
| C. Authoring UI + permissions | 9 | 18 |
| D. CodeCanvas shell + execution | 7 | 14 |
| E. CodeCanvas content + generation | 9 | 18 |
| F. Cost, BYOK, observability | 6 | 12 |
| G. Content scale-up remainder | 5 | 10 |
| H. Polish and launch | 7 | 14 |
| **Total** | **54** | **108** |

Minimum viable slice for agentic authoring: A1, A3, B1, B2, B4, B5, C1, C2, C4, C5 → 10 sub-tasks, ~20 credits.
Minimum viable CodeCanvas: D1, D2, D3, D4, D5, E1, E2 → 7 sub-tasks, ~14 credits.

AI Gateway usage is billed separately from build credits; the adversary/reviewer iterations and code generation are the main runtime drivers, which is why both loops carry iteration caps and budgets.

## Technical notes

- Agents live server-side as `createServerFn` handlers with `*.server.ts` prompt/loop helpers; progress streams over the existing mentor SSE route pattern.
- External fetches are whitelisted against `authoring_sources` server-side; a URL is never taken from the client unchecked.
- Every new table lands with GRANTs and RLS in the same migration; roles continue to use the existing `has_role` security-definer function, never role columns on profiles.
- Pyodide loads lazily behind a client-only boundary so SSR never imports it; the execution adapter keeps a container provider (E2B/Judge0) addable later without touching UI code.
- BYOK keys are stored encrypted server-side and never returned to the client in plaintext; only a masked suffix is shown.
- The in-app Roadmap Estimator (`src/lib/credit-estimates.ts`) gets Phases A–H added so estimates stay visible in the app.
