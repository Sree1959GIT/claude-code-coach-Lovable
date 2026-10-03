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
Live Talk wave T1 → T2 → T3 (see .lovable/plan.md). T1 done: echo-cancelled mic + AnalyserNode speech detector, bargeIn() aborts the mentor request and audio. Next: T2 (voice starts with the text). Still waiting: Bulk import of real questions, Jev tuning at 50+ decisions. Progress pages take the active exam id for isolation.
