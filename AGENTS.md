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
Speed pass S1–S3 shipped: Gemini Flash answers with no hidden thinking (`reasoning_effort: none`, Ollama `think: false`); the quota check, trace record and Jev decision run in parallel; live talk never waits on Jev or slow memory; the clip pick runs alongside the model call; live prompt bans filler openers. Server time to first stream ~1.4–1.8 s (was ~4.5 s), of which ~1 s is the quota/run lookups. Next: S4 (Kokoro voice + Moonshine listener downloads), S5 (per-step speed on Traces), then Vercel Wave 2, real questions, Jev tuning at 50+ decisions. Progress pages take the active exam id; keep it that way for isolation.
