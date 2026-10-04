<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# AGENTS.md — CCAF Prep (any-exam tutor)

- Two dev accounts share this repo; current files are the source of truth, not memory.
- Plan first for open requests; after each build, tick tasks and set the next active task in `docs/sprint-log.md` §3 (full history and backlog live there).
- Stack: TanStack Start + Lovable Cloud (Postgres, pgvector) + AI Gateway. "Terminal Blueprint" UI: Inter prose, JetBrains Mono machine values.
- Strict RLS everywhere; `_authenticated` gate redirects to `/auth`; per-exam data isolation must hold.
- `public.has_role` stays SECURITY DEFINER — never alter it.
- Mentor routing: Jev decides intent (700 ms budget) with keyword `planRoute` fallback; agreement traced on Traces.

## Current active task
Live Talk T1–T3 shipped: in live talk one echo-cancelled mic stream feeds a voice detector (~80 ms over an adaptive floor while the mentor thinks/speaks → `bargeIn()` aborts the fetch/Ollama stream, stops audio, flips to Listening; the server passes `request.signal` to the model call). Turn label: Idle/Listening/Thinking/Speaking/Interrupted. `live: true` requests get a short spoken style, a 350 ms Jev budget and library lookup only when Jev needsLibrary ≥ 0.6; speech starts from the first 4–8 word phrase (`SegmentParser.clauseMode`). First sound is logged as `mentor_ttfa` and shown on Traces. A `GEMINI_API_KEY` server secret replaces the Lovable gateway for mentor answers (learner keys still win; Jev stays on the gateway). Next: Vercel packaging (Wave 2), load real questions, Jev tuning once 50+ decisions. Progress pages take the active exam id; keep it that way for isolation.
