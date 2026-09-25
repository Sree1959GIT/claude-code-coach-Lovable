# B1 — Study Canvas raised-surface contrast

## What will change
- Make the Study Canvas clearly distinct from the study page in both light and dark themes by applying the existing raised-surface token to its floating shell and mobile bottom sheet.
- Strengthen the shell edge and elevation while keeping the established 6px radius and Terminal Blueprint styling.
- Separate the title bar, section tabs, file tabs, code workspace, and console with the existing canvas → surface → raised hierarchy, avoiding a flat stack of similar muted backgrounds.
- Preserve all current desktop dragging/resizing, mobile docking, keyboard behavior, tabs, code execution, video, docs, and Mentor interactions.

## Per-exam isolation safeguard
- No database, exam selector, study loader, readiness, question context, codebase lookup, or sharing code will change.
- The active question and exam-scoped context will continue to flow through the existing props unchanged; B1 modifies presentation classes and semantic design tokens only.

## Files
- `src/components/FloatingWindow.tsx` — raised shell, stronger edge/elevation, distinct title bar.
- `src/components/StudyCanvasTabs.tsx` — clearer internal surface hierarchy using existing semantic tokens.
- `src/styles.css` — adjust the shared raised-surface treatment only if the shell needs a stronger tokenized border/shadow.
- `roadmap.md` and `AGENTS.md` — mark B1 complete and hand off to B2.

## Verification
- Confirm the preview builds without errors.
- Open an authenticated study question and inspect the Canvas at desktop and mobile widths in both themes.
- Confirm the selected exam and question context remain unchanged while opening, moving, resizing, and using Canvas tabs.
