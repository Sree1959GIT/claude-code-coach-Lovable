## Evaluation of the uploaded implementation plan

The uploaded 882-line plan is thoughtful and ambitious, but it was written for a **Vercel + Next.js** stack. This Lovable project runs on **TanStack Start on Cloudflare Workers with Lovable Cloud (Supabase)**. Key adaptations to keep in mind for later stages:

| Original plan | Works as-is on Lovable? | Adaptation |
|---|---|---|
| Vercel Edge Functions for Claude API | No — different runtime | Use TanStack `createServerFn` + Lovable AI Gateway (Claude via gateway, no key management) |
| Inngest for durable agents | Partial | Cron via `pg_cron` + `/api/public/*` route; long-running jobs need an external worker (Inngest Cloud is fine, called from server fn) |
| ego-lite / Stagehand (Playwright) | No | Cannot run in Cloudflare Workers. Use Firecrawl API for scraping; Stagehand needs an external Node host |
| Apify actors (Reddit/X/LinkedIn) | Yes | Call Apify HTTP API from a server fn (needs Apify token) |
| Transformers.js + IndexedDB RAG | Yes (client-side) | Works — pure browser |
| Kokoro-WASM TTS / Deepgram | Yes (browser or API) | Web Speech API for tier 0; Deepgram via server fn for tier 2 |
| Direct Claude API key in client | No — never | Use Lovable AI Gateway; `LOVABLE_API_KEY` auto-provisioned server-side |
| Vercel Cron | No | Use Supabase `pg_cron` calling an `/api/public/*` webhook |

The plan's UI/UX design decisions (question anatomy, StudyHub, mentor canvas, notification bell, FSRS) are all portable and good.

## This stage (Stage 1): Landing + Auth + Analytics stub

Building only the pieces you asked for now — the "Terminal blueprint" landing, sign-in, sign-up, Google OAuth, and event capture — so later stages have a foundation.

### What ships in this stage

1. **Design system** — port terminal-blueprint tokens (Inter + JetBrains Mono, `#3b82f6` accent, zinc palette, hairline borders) into `src/styles.css` with proper light/dark tokens; add `next-themes`-style provider with a working header toggle.
2. **Landing page at `/`** — replace the placeholder with the chosen direction: sticky nav with theme toggle + Sign in + Get started, hero with mini terminal dashboard, trusted strip, 6-tile capabilities grid, dashboard preview section (real generated dark-mode dashboard image), pricing (Free / Architect_Plus), footer. Fully responsive; works in both themes.
3. **Lovable Cloud enabled** with:
   - `profiles` table (id → auth.users, username, display_name, avatar_url) with trigger to auto-create on signup, RLS + GRANTs
   - `user_roles` table + `has_role()` security-definer function (per the roles best practice) — no data behind it yet, but scaffolded for admin/pro later
   - `analytics_events` table (user_id nullable, event_name, payload jsonb, session_id, path, created_at) with insert-only RLS for authenticated + anon, admin-only select
4. **Auth routes**:
   - `/auth` — combined sign-in / sign-up card (terminal-blueprint styled), email+password + "Continue with Google" (Supabase Google provider — you'll enable it in Cloud settings)
   - `/reset-password` — public page consuming `type=recovery` hash and calling `updateUser({ password })`
   - `_authenticated/` gate + `/dashboard` stub ("You're signed in — Stage 2 will build the Study Hub here") so login has somewhere to land
   - Header updates to reflect session (Sign in ↔ account menu with Sign out) driven by `onAuthStateChange`
5. **Analytics capture** — tiny `logEvent()` helper that inserts into `analytics_events` (page_view, cta_click on hero buttons, signup_started, signup_completed, login_success). No dashboard UI yet — Stage 2 renders it. This gives you real data from day one.
6. **SEO head** on `/`, `/auth`, `/reset-password`, `/dashboard` (unique titles/descriptions/og — no more "Lovable App").

### Technical notes

- Auth uses Lovable Cloud (Supabase). Google provider must be enabled in Cloud → Auth after this stage; I'll show you where.
- Theme toggle uses class-based dark mode + `localStorage` with SSR-safe hydration.
- No Claude/AI calls, no Firecrawl, no agents in this stage — those come in later stages.
- Dashboard preview image generated once (premium quality) and imported as ES6 asset.

---

## Full roadmap: stage breakdown + estimated Lovable credits

**Important context on credits:** build-mode credits are usage-based and depend on iterations, debugging cycles, and how much back-and-forth each stage needs. These ranges assume clean requirements per stage and light revisions. Plan-mode messages are a flat 1 credit each. Cloud/AI Gateway usage after launch bills separately from build credits (each workspace gets a free monthly Cloud allowance — 40 credits on Free/Pro).

| Stage | Scope | Est. build credits |
|---|---|---|
| **1. Landing + Auth + Analytics stub** *(this stage)* | Terminal-blueprint landing, light/dark toggle, Lovable Cloud, email+Google auth, profiles, roles scaffold, `analytics_events` capture, reset-password, session-aware header | **40–70** |
| **2. Study Hub + Exam UI parity + Analytics dashboard** | `/study` hub, domain cards + progress rings, question-anatomy exam page redesign (scenario/stem/options, key-concept labels), CourseViewer sidebar, Recharts analytics dashboard reading `analytics_events` + attempts | **120–200** |
| **3. SME Voice Mentor (tier 0 → tier 2)** | MentorButton + MentorCanvas, Web Speech STT/TTS, Lovable AI Gateway (Claude) with mentor system prompt, docs snippet fetcher, YouTube oEmbed, comprehension-check loop, "Second-to-None" disambiguation. Optional Deepgram/Kokoro adds ~30 | **150–260** |
| **4. Adaptive Learning Engine** | Per-question `time_tracking`, FSRS scheduler, question attempts/reviews tables, weakness detection, personalized study plan generator, streak logic | **90–160** |
| **5. Resource Library + Client-side RAG** | `/library` UI, PDF (pdf.js) + DOCX (mammoth) parsing, Transformers.js embeddings + IndexedDB (Dexie) + BM25 hybrid search, Firecrawl edge integration for public URLs (requires Firecrawl API key) | **180–300** |
| **6. Multi-agent backbone (Researcher / Curator / Ingester / Notification)** | `pg_cron` triggers → `/api/public/*` webhooks → server fns calling Lovable AI + Apify + Firecrawl; notification bell UI; ingested-content markdown pipeline. **Excludes** ego-lite/Stagehand (not runnable on Workers — needs your own Node host if you want authenticated SkillJar scraping) | **220–380** |
| **7. Polish, mobile, a11y, published deploy, custom domain** | Motion polish, mobile bottom tab bar, focus/contrast audit, empty states, error boundaries, publish flow | **50–100** |

**Whole-app estimate:** **~850–1,470 build credits** end-to-end, plus ongoing Cloud + AI Gateway usage after launch (Claude calls, embeddings, Firecrawl, Apify are third-party — billed by those providers directly; Lovable AI Gateway usage draws from the workspace credit balance beyond the free monthly Cloud allowance).

Third-party API keys you'll need to supply later (not stage 1): Apify token, Firecrawl API key, optional Deepgram key, optional YouTube Data API key.

For a live view of your current workspace credit balance and burn rate, check **Settings → Plans & credits** in Lovable.

---

## What happens when you approve

I'll build Stage 1 only (landing + auth + analytics capture). After you see it live and sign in, come back and I'll plan Stage 2 (Study Hub + Exam UI parity) with a fresh, tighter estimate based on how Stage 1 actually went.
