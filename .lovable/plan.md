# Phase D3 — Study Canvas multi-file tabs with read-only code views

Confirmation: per `AGENTS.md` Section 3, the current active task is **Phase D3 — implement multi-file tabs inside the Study Canvas window with read-only, syntax-highlighted code views (Python and JavaScript), code copying utilities, and text-selection copy hooks**. D1 and D2 (floating window shell, session persistence) are already complete; GitHub sync is current.

## Scope (this sub-task only)

- Add a tabbed file-viewer component rendered inside the existing `FloatingWindow` Study Canvas.
- Each tab shows one file: filename label, language badge, read-only syntax-highlighted code (Python and JavaScript).
- Copy utilities: a "Copy file" button per tab, plus copy of the user's current text selection.
- Demo content: ship with 1–2 sample multi-file codebases (Python + JavaScript) so tabs are visible immediately; real codebase loading arrives in Phase E.

## Technical notes

- New file: `src/components/StudyCanvasContent.tsx` (tabs + read-only code view + copy buttons).
- Lightweight highlighting: a small tokenizer/regex-based highlighter for Python and JS keywords/strings/comments — no new heavy dependency; avoids SSR issues since the canvas is client-rendered.
- Copy uses `navigator.clipboard.writeText` with a sonner toast confirmation; selection copy reads `window.getSelection()` within the code pane.
- Only touch: `src/components/StudyCanvasContent.tsx` (new) and `src/routes/_authenticated/study.$slug.tsx` (render the content inside the existing `FloatingWindow` — one-line change, geometry/persistence logic untouched).
- No styling system changes; reuse existing hairline-border / mono-font tokens. No database, no execution engine (D4–D7 stay pending).

## Handoff (per AGENTS.md Dynamic Handoff Rule)

- After implementation: check off Phase D3 in `AGENTS.md` Section 3 and set CURRENT ACTIVE TASK to **Phase D4 — execution provider interface + in-browser WASM runner (Pyodide for Python, isolated worker for JavaScript)**.
