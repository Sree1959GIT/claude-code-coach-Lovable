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
Speed pass S1–S5 shipped. S4: on-device voice model is picked in Settings › Mentor & voice (Piper default, Kokoro-82M optional via `kokoro-js`, Piper fallback); on-device listener engine Whisper tiny (default) or Moonshine tiny, both lazily loaded browser-only via transformers.js and cached. S5: Traces speed panel shows per-step server timings from the `timings` agent step. Next: Vercel Wave 2 (waits on go-ahead), review the 40 AI-written questions, Jev tuning at 50+ decisions. Progress pages take the active exam id; keep it that way for isolation.
- Browser-only ML engines (Piper, Kokoro, Whisper, Moonshine) are imported lazily from `src/lib/offline-*.ts` and never from server code — they break SSR/Worker bundles.
