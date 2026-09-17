# Phase H2 — CodeCanvas semantic accessibility

## Scope

Improve keyboard and assistive-technology access across the Study Canvas, Mentor drawer, nested video dialog, and tab interfaces without changing their visual design or business logic.

## Implementation

1. **Shared focus management**
   - Add a small reusable focus-management hook for opening surfaces: remember the trigger, move focus into the surface, cycle `Tab` / `Shift+Tab`, close on `Escape`, and restore focus on close.
   - Apply trapping only to true modal surfaces: the mobile Mentor overlay and video dialog.
   - Keep the desktop Mentor frame and desktop floating Study Canvas non-modal so learners can continue using all three frames; focus moves into them on open and returns to their trigger on close, but is not trapped.
   - Treat the mobile Study Canvas bottom sheet as a modal drawer with focus containment.

2. **Study Canvas window and global shortcuts**
   - Give `FloatingWindow` explicit dialog semantics, labelled title/subtitle relationships, keyboard-operable close behavior, and modal state appropriate to the current viewport.
   - Add `Escape` handling for the active surface, with nested video dialogs closing before their parent drawer.
   - Add `Ctrl+Shift+C` / `Cmd+Shift+C` to toggle Study Canvas, ignoring the shortcut while typing in inputs or editable fields.
   - Add `aria-expanded`, `aria-controls`, and stable IDs to Study Canvas and Mentor launch buttons.

3. **Canvas tabs and panels**
   - Complete the Code / Video / Docs tab contract with stable tab IDs, `aria-controls`, roving `tabIndex`, arrow-key/Home/End navigation, and matching labelled tab panels.
   - Preserve the existing file tablist and add Home/End keyboard support plus deterministic IDs that remain unique across mounted canvases.
   - Mark console output and run status with suitable live/status semantics without repeatedly announcing the whole code pane.

4. **Mentor drawer and video dialog**
   - Give the Mentor surface a labelled dialog/complementary relationship appropriate to modal versus desktop mode, expose live response/status regions, and connect expandable references with `aria-controls`.
   - Upgrade `VideoModal` to a correctly labelled modal dialog with initial focus, focus trap, Escape close, backdrop close, and focus restoration.
   - Ensure icon-only close controls retain accessible names and mobile primary controls meet keyboard/touch requirements.

5. **Motion reduction**
   - Add `prefers-reduced-motion` handling for the blinking mentor highlight, entrance animation, pulsing stream cursor, smooth scrolling, and drawer transitions.

6. **Roadmap and handoff**
   - Mark H2 complete in both Section 3 and Section 4 of `AGENTS.md`.
   - Set `CURRENT ACTIVE TASK` to Phase H3: resilient loading and fallback boundaries.
   - Record the H2 implementation handoff plan and update the project handoff summary.

## Validation

- Run the full TypeScript check.
- Exercise desktop and mobile study views with Playwright: open/close/restore focus, Tab containment in modal surfaces, Escape precedence, keyboard shortcut toggling, tab arrow/Home/End navigation, and nested video-dialog behavior.
- Inspect browser console for accessibility/runtime errors.
- Verify both GitHub `main` branches are synchronized after the project-managed commit/push workflow.

## Files expected to change

- `src/hooks/use-focus-surface.ts`
- `src/components/FloatingWindow.tsx`
- `src/components/StudyCanvasTabs.tsx`
- `src/components/MentorCanvas.tsx`
- `src/components/VideoModal.tsx`
- `src/routes/_authenticated/study.$slug.tsx`
- `src/routes/_authenticated/study.session.tsx`
- `src/styles.css`
- `AGENTS.md`
- `.lovable-context.md`
- `.lovable/plan/phase-h2-semantic-accessibility-2026-09-17.md`

No database, model, quota, or content-generation behavior changes are included.
