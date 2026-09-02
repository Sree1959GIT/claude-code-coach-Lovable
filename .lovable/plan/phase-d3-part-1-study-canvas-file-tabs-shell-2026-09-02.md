# Phase D3 (part 1) — Study Canvas file tabs shell

Scope is deliberately narrow: the layout shell and tab strip for a multi-file reader inside the existing Study Canvas floating window. No execution, no syntax highlighting engine, no backend, no database.

## What gets built

- A tab strip across the top of the Study Canvas body, one tab per file, showing the filename and a small language marker (PY / JS).
- The active tab renders its file content in a read-only, monospaced pane with line numbers, scrollable inside the window.
- Clicking a tab switches files; the active tab is visually marked with the existing hairline/primary tokens.
- Keyboard access: tabs are focusable, arrow-key navigation between tabs, correct `role="tablist"` / `role="tab"` / `role="tabpanel"` wiring.
- A small placeholder footer strip inside the window reserved for future run controls — label only, no buttons that do anything.
- Content comes from a static in-file sample set (one Python file, one JavaScript file) so the layout is visible immediately. This is a props-driven component: the file list is passed in, so Phase E content loading swaps the source without touching the layout.

## Explicitly out of scope for this step

- Syntax highlighting (colouring), copy-file and copy-selection actions — the rest of D3, next step.
- Execution provider, Pyodide, workers, run/cancel, console pane (D4–D6).
- `code_executions` telemetry and any database work (D7).

## Technical notes

- New file `src/components/StudyCanvasTabs.tsx`: accepts `files: { name: string; language: "python" | "javascript"; content: string }[]`, keeps the active index in local state, renders tab strip + read-only pane.
- `src/routes/_authenticated/study.$slug.tsx`: replace the placeholder paragraph inside the existing `FloatingWindow` with `<StudyCanvasTabs files={...} />`. The window geometry, persistence and open/close logic from D1/D2 are untouched.
- No new dependencies. Styling reuses existing tokens (`border-border`, `bg-card`, `font-mono`, uppercase micro-labels) — no design system changes.

## Handoff

After this step, `AGENTS.md` Section 3 keeps D3 open, with the remaining D3 work noted as: syntax highlighting for Python/JavaScript plus copy-file and copy-selection utilities.
