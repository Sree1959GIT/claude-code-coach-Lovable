# Phase E8 — Advice matrices into Mentor prompts

## Delivered
- Migration: `public.codebases.advice` jsonb not null default `{}` (was missing in this
  database, blocking the E7 typing).
- `src/lib/agents/advice-prompt.server.ts` — `adviceDepth()` classifies attached advice as
  `none | light | deep`; `adviceSystemMessage()` renders summary, walkthrough lines,
  tradeoffs, misconceptions, concept links and follow-ups into a capped (6k) system
  message with a depth directive; `adviceDepthDirective()` for pacing-only callers.
- `explainer.agent.server.ts` / `evaluator.agent.server.ts` — advice message inserted
  after the question context, before profile note and retrieved sources.
- `QuestionContext.advice` on the server type and in `MentorCanvas`.
- `study.$slug.tsx` — `mentorContext` now carries the active cached example's advice.

## Next active task
Phase E9 — tie code canvas tabs to active question context profiles and FSRS metrics.
