# Phase D3 (step 1) — Study Canvas tab layout shell only

Current active task per `AGENTS.md` Section 3: **Phase D3 — multi-file tabs inside the Study Canvas window**. This step is deliberately narrowed to the tab layout shell only.

## Scope (this step only)

- Create a `StudyCanvasContent` component rendered inside the existing `FloatingWindow`.
- A tab bar across the top of the canvas body: one tab per file, showing filename + a small language badge (PY / JS).
- Clicking a tab switches the visible pane; active tab is visually distinct, inactive tabs sit muted.
- The pane area renders placeholder body text per file ("content arrives next step") — enough to prove tab switching works.
- Include 2–3 hardcoded demo file entries (e.g. `main.py`, `utils.py`, `agent.js`) so multiple tabs are visible immediately.

## Explicitly NOT in this step

- No syntax highlighting, no real code content.
- No copy file / copy selection buttons.
- No execution, run controls, or console pane (D4–D7).
- No database or backend logic (E1+).

## Technical notes

- New file: `src/components/StudyCanvasContent.tsx` — local `useState` for the active tab index; demo file list as a module-level constant.
- One-line change in `src/routes/_authenticated/study.$slug.tsx`: replace the current placeholder `<div>` inside `<FloatingWindow>` with `<StudyCanvasContent />`. Geometry, drag/resize, and session persistence logic stay untouched.
- Reuse existing design tokens (border-border, font-mono, uppercase tracking, bg-secondary for active tab); no new dependencies, no styling system changes.

## Follow-on steps (later prompts)

- D3 step 2: read-only syntax-highlighted code views + copy file / copy selection.
- Then D4 (execution provider interface + WASM runners) per the roadmap.
