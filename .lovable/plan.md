## Problem

Opening any domain (e.g. `/study/deployment`) still shows the Study Hub grid, not the question runner. That's why you don't see questions or the **Ask_Mentor** button — the runner component never mounts.

## Root cause (verified)

With TanStack file-based routing, having `src/routes/_authenticated/study.tsx` **and** `src/routes/_authenticated/study.$slug.tsx` as siblings promotes `study.tsx` to a **layout route** for `/study/*`. The generated `routeTree.gen.ts` confirms this:

```
'/_authenticated/study': typeof AuthenticatedStudyRouteWithChildren
```

But `study.tsx` renders `<StudyHub />` directly — it never renders `<Outlet />`. So on `/study/deployment`, the router matches the parent (StudyHub renders) and the child `study.$slug` route's component is skipped entirely. This matches your network logs: `/study/deployment` fires `page_view` with `page: "study_hub"`.

Ask_Mentor is fine — you just can't reach the page that hosts it.

## Fix

Rename one file so the hub becomes a proper leaf, not a layout:

- `src/routes/_authenticated/study.tsx` → `src/routes/_authenticated/study.index.tsx`
- Update its `createFileRoute("/_authenticated/study")` → `createFileRoute("/_authenticated/study/")`

Result: `/study` renders StudyHub (leaf), `/study/$slug` renders DomainRunner (sibling leaf) with the Ask_Mentor button.

## How to use Stage 3 after the fix

1. Sign in and go to **Study** in the header.
2. Click any domain card (e.g. Prompting Fundamentals).
3. Each question shows a **🎙 Ask_Mentor** button under the stem — click it to open the right-side canvas.
4. Type or press mic (Chrome/Edge) to ask about the concept; the mentor replies in text and speaks it back if **Voice_reply** is checked.

## Verification

- `bun run build` / typecheck passes.
- Navigate to `/study/prompting`: URL shows the question runner (scenario + stem + options + Ask_Mentor).
- Click Ask_Mentor → drawer opens → send a message → text reply + audio playback.
