# Phase H4 — Router SEO and social cards

## Scope

Add consistent route-level metadata for the public entry pages and authenticated learning routes, including dynamic domain/question context, canonical URLs, Open Graph/Twitter cards, and structured data. This phase changes metadata and public web assets only; it does not change study behavior, authentication, or stored data.

## Implementation

1. **Shared metadata builder**
   - Add a typed SEO utility that produces title, description, canonical, Open Graph, Twitter, robots, and JSON-LD entries from one route-specific definition.
   - Use the project domain for absolute canonical, `og:url`, and share-image URLs, with safe description/title normalization and fallbacks.
   - Keep sitewide charset, viewport, brand name, favicon, font links, and Twitter defaults in the root shell while leaving page-specific tags on leaf routes.

2. **Share card and install metadata**
   - Create a 1200×630 social-card rendition from the dashboard visual already shown on the landing page and expose it as a public asset.
   - Add a web app manifest with the product name, theme/background colors, and existing favicon; link it from root head metadata.
   - Use the same share card across routes that do not show a more specific absolute cover, and keep `og:image` and `twitter:image` synchronized.

3. **Public route metadata**
   - Upgrade `/`, `/auth`, and `/reset-password` with complete route-specific title, description, canonical, `og:*`, Twitter, and robots settings.
   - Add `WebApplication` plus `Course` JSON-LD to the landing page; mark account/password utility pages `noindex` while retaining useful social metadata.

4. **Study and account route metadata**
   - Apply complete, unique metadata to the study hub and the key study/exam/report routes, using `noindex` for private account content.
   - Add suitable JSON-LD types such as `LearningResource` for domain study modules and `Quiz` for mock-exam surfaces.
   - Bring the remaining authenticated content routes into the same helper so every content route has a complete, unique head definition without changing page behavior.

5. **Dynamic domain/question metadata**
   - Reuse the authenticated route's existing domain/question queries through the route query client so `head()` can read the selected domain title, blueprint weight, description, and first/current question concept when available.
   - Generate concise fallback metadata from the slug while data loads or a domain is unavailable.
   - Keep protected data behind the authenticated route gate and never expose question answers in metadata or structured data.

6. **Roadmap and validation**
   - Mark H4 complete in both sprint sections of `AGENTS.md` and make H5 (fresh-user onboarding) the next active task.
   - Run the full TypeScript check, inspect the preview build log, and verify rendered `<head>` output for the public landing and a representative study route.
   - Re-check both GitHub `main` branches after the project-managed synchronization completes.

## Files expected to change

- `src/lib/seo.ts`
- `src/routes/__root.tsx`
- `src/routes/index.tsx`
- `src/routes/auth.tsx`
- `src/routes/reset-password.tsx`
- `src/routes/_authenticated/*.tsx` metadata definitions
- `public/site.webmanifest`
- `public/og-card.jpg`
- `AGENTS.md`
- `.lovable-context.md`

No database migrations, permissions, AI behavior, or visual page redesign are included.
