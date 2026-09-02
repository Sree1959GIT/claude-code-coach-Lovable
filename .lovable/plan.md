# Phase D3 (part 2) — Syntax highlighting + copy utilities for Study Canvas

Current active task per `AGENTS.md` Section 3: **Phase D3 — multi-file tabs inside the Study Canvas window with read-only, syntax-highlighted code views (Python and JavaScript), code copying utilities, and text-selection copy hooks.**

Current state (verified): the D3 part-1 shell is built — `src/components/StudyCanvasTabs.tsx` renders a tab strip, line-numbered read-only pane, keyboard tab navigation, and a sample file set, wired into the `FloatingWindow` in `study.$slug.tsx`. This step completes D3.

## What gets built

1. **Read-only syntax highlighting** for Python and JavaScript in the code pane:
   - Lightweight tokenizer (regex-based) covering keywords, strings, comments, numbers, and builtins/decorators for both languages.
   - Highlighted spans use semantic/theme-friendly classes (e.g. `text-primary`, `text-success`, muted tones) so light/dark mode both work; no hardcoded hex colors.
   - Line numbers and existing pane layout stay as-is; highlighting replaces the plain-text line rendering only.

2. **Copy file** button:
   - Per-tab "Copy_File" button in the pane toolbar; copies the full file content via `navigator.clipboard.writeText` with a sonner toast confirmation and a fallback path when the clipboard API is unavailable.

3. **Copy selection**:
   - "Copy_Selection" button enabled only when the user has selected text inside the code pane; reads `window.getSelection()` scoped to the pane and copies it with the same toast feedback.

## Explicitly out of scope

- Execution, run controls, console pane (D4–D6) — the "Run_Controls · Pending_D4" footer strip stays a label.
- `code_executions` telemetry / any database work (D7).
- Loading real codebases from the backend (Phase E) — the sample file set remains.

## Technical notes

- All changes in `src/components/StudyCanvasTabs.tsx` (tokenizer helper can be a small co-located function or `src/lib/code-highlight.ts` if it stays browser-safe and dependency-free).
- No new npm dependencies; no SSR risk (canvas renders client-side only inside the floating window).
- Selection tracking: `onMouseUp`/`onKeyUp` (or `selectionchange`) on the pane, storing whether the current selection intersects the pane element.

## Handoff (per AGENTS.md Dynamic Handoff Rule)

After implementation and verification: check off **Phase D3** in `AGENTS.md` Section 3 and set CURRENT ACTIVE TASK to **Phase D4 — execution provider interface + in-browser WASM runner (Pyodide for Python, isolated worker for JavaScript) behind a swappable adapter**.
