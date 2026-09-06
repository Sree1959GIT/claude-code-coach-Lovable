# Phase E4 — Code multi-agent generation loop

## Delivered
- `src/lib/codegen.server.ts` — server-only four-agent loop:
  1. **Research** — pgvector library retrieval (`retrieveChunks`) + model call returning
     `{ gap, learningGoals, mustCover, misconceptions }` and citations; aware of concept tags already cached.
  2. **SME** — writes 1–4 short, self-contained, deterministic files (no network, no packages, no input()).
  3. **Verifier** — `verifyFiles()`: D6 `checkSyntax` scan plus sandbox-constraint rules
     (network calls, `input()`, unbounded loops, `require()`, no visible output, >120 lines).
  4. **Documentation** — markdown walkthrough: purpose, line-by-line, tradeoffs, misconceptions.
  Returns `{ steps, draft, error }`; never throws, so partial progress is inspectable.
- `src/lib/codegen.functions.ts` — `generateCodebaseDraft`, admin-gated (`has_role`) server function.
  Preview only: the draft is returned, nothing is written to `codebases`.

## Notes / boundaries
- Model: `google/gemini-3.7-flash` via the Lovable AI Gateway; 429/402 surfaced verbatim.
- Verification is static only at this stage. Real execution + fail-safe retries and the
  save gate belong to **E5**; the live agent-status UI belongs to **E6** (`code_gen_jobs`).

## Next active task
Phase E5 — code quality execution filter.
