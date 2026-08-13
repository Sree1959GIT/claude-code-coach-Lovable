---
name: update-n-sync
description: Run the "Update_N_Sync" handover routine — sync code to GitHub and write/refresh .lovable-context.md with this session's features, changed files, new env vars or schema, and the next development step. Use when the user says Update_N_Sync, asks for a handover summary, or wants the context file refreshed before ending a session.
---

# Update_N_Sync

A two-part end-of-session routine: make sure the code is synced, then leave a
handover note the next agent (or human) can pick up cold.

## 1. Git sync

Never run stateful git commands (`add`, `commit`, `push`, `checkout`, ...) —
git state is managed by the platform and pushes happen automatically when
GitHub sync is enabled for the project.

Do this instead:
- Run `git log --oneline -3` and `git status --porcelain` (read-only) to report
  the latest synced commit and whether the tree is clean.
- If the project is not connected to GitHub, tell the user to connect it via
  GitHub in the workspace Git settings — do not attempt a manual push.

## 2. Write `.lovable-context.md`

Create or overwrite `.lovable-context.md` in the repository root. Keep it under
~120 lines; it is a handover note, not a changelog archive. Required sections,
in this order:

```markdown
# Lovable Handover Context
_Last updated: <YYYY-MM-DD HH:MM UTC> · Session: <short label>_

## Project snapshot
One or two lines: what the app is and which stage/milestone it is in.

## This session
- Feature or fix — one line each, what changed and why.

## Files changed
- `path/to/file` — what changed there.

## Env vars, secrets & schema
- New environment variables or secrets (names only, never values).
- New/changed tables, columns, RLS policies, functions. Write "None this session" if nothing changed.

## Next step
The single exact next action, specific enough to start without re-reading the chat.

## Open items
Known issues, deferred decisions, or blockers. Omit the section if empty.
```

Rules:
- Names only for secrets and keys — never write a value into the file.
- "Next step" is one concrete action, not a list of possibilities.
- Preserve `## Project snapshot` wording across updates unless the stage changed.

## 3. Confirm

Close with one short line stating the sync status and that the context file was
written.
