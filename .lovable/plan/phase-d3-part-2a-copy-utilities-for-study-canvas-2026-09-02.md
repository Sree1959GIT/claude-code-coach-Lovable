# Phase D3 (part 2a) — Copy utilities for Study Canvas

Current active task per `AGENTS.md` Section 3: **Phase D3 — multi-file tabs inside the Study Canvas window with read-only, syntax-highlighted code views (Python and JavaScript), code copying utilities, and text-selection copy hooks.**

Current state (verified): the D3 part-1 shell is built — `src/components/StudyCanvasTabs.tsx` renders a tab strip, line-numbered read-only pane, keyboard tab navigation, and a sample file set, wired into the `FloatingWindow` in `study.$slug.tsx`.

This turn deliberately implements only the copy utilities, leaving syntax highlighting for a later step.

## What gets built

1. **Copy file** button:
   - A small toolbar above the code pane with a "Copy_File" button.
   - Copies the full content of the active tab via `navigator.clipboard.writeText`.
   - Shows a sonner toast on success ("Copied <filename>") and a fallback message if the clipboard API is unavailable.

2. **Copy selection** button:
   - Enabled only when the user has selected text inside the code pane.
   - Reads the current selection scoped to the pane and copies it to the clipboard.
   - Same sonner toast feedback as Copy file.

3. **Toast infrastructure check**:
   - Ensure `<Toaster />` is rendered once in `src/routes/__root.tsx` so sonner toasts appear; if not, add it without touching other files.

## Explicitly out of scope

- Custom regex tokenizer or syntax highlighting (kept plain text).
- Execution, run controls, console pane (D4–D6).
- `code_executions` telemetry / any database work (D7).
- Real codebase loading (Phase E).

## Technical notes

- All changes in `src/components/StudyCanvasTabs.tsx` (copy buttons + selection tracking).
- One optional one-line addition in `src/routes/__root.tsx` only if `<Toaster />` is missing.
- No new dependencies; no SSR risk.

## Handoff

After this step, `AGENTS.md` Section 3 keeps D3 open with the remaining work noted as: syntax highlighting for Python/JavaScript.
