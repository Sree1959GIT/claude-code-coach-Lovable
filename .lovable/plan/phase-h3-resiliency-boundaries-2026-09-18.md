# Phase H3 — Resiliency boundaries pass

## What shipped

- New shared module `src/components/Resilience.tsx`:
  - `SkeletonBar`, `SkeletonLines`, `SkeletonCards`, `SkeletonTable` — animated placeholders using design tokens.
  - `PageSkeleton` — full-page pending view with header, stat cards and table shapes.
  - `InlineError` — friendly, jargon-free error panel with a retry trigger and spinner state; translates network / 401 / 429 failures into plain language.
  - `RouteErrorView` / `routeErrorComponent` — route-level error boundary that invalidates the router and resets the boundary on retry.
- Route-level `pendingComponent` and `errorComponent` added to:
  `/dashboard`, `/history`, `/estimator`, `/mock-exam`, `/admin`, `/study/$slug`, `/study/session`.
- Inline query states replaced with skeletons plus retry:
  - dashboard quick stats and readiness panel
  - session history table
  - mock exam blueprint allocation rows
  - study domain runner (domain + questions)
  - session runner question pane and error state
  - admin learners, content, review queue, job history, eval history and eval cases.
- Raw stack traces and bare "Loading…" strings are no longer rendered on these paths.

## Verification

- `bunx tsgo --noEmit` passes with no errors.
- `/dashboard` and `/history` return HTTP 200 from the dev server; no new console or SSR errors.

## Next task

Phase H4 — Deploy SEO tagging structures: generate automated router-level Open Graph card parameters.
