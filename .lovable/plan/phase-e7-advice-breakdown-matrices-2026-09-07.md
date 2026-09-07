# Phase E7 — Advice breakdown matrices

## Delivered
- `src/lib/advice.ts` — `CodeAdvice` types (`walkthrough`, `tradeoffs`, `misconceptions`,
  `conceptLinks`, `followUps`), `EMPTY_ADVICE`, `normalizeAdvice()`, `hasAdvice()`.
- `public.codebases.advice` — jsonb, not null, default `{}`; seeded for `agent_loop`.
- `src/lib/codegen.server.ts` — fifth `advice` agent after Documentation. Sends the
  example with numbered lines and returns structured advice; additive, so a failure
  never discards a verified draft. Persisted by `persistVerifiedDraft`.
- `src/lib/codebases.ts` — `Codebase.advice` parsed via `normalizeAdvice`.
- `src/components/AdviceMatrix.tsx` — summary, line-by-line walk (clickable L-ranges),
  tradeoff table, misconception checks, concept chips, follow-up questions.
- `src/components/StudyCanvasTabs.tsx` — Advice/Code toggle, jump-to-line scroll with
  a highlighted target row. Toggle hidden when the example carries no advice.
- `src/components/admin/CodeGenPanel.tsx` — tracker shows `05 · Advice`.

## Next active task
Phase E8 — connect advice matrices into Mentor agent prompts.
