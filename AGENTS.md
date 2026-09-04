<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# AGENTS.md — Global Context & Multi-Account Synchronization

## 🚨 CRITICAL OPERATIONS (Read First)
- **Multi-Account Swap Protocol:** This codebase dynamically toggles between two independent developer accounts using free tier token pools.
- **Context Invariance:** Do not forget state configurations. The AI must interpret current folder conditions as the absolute single source of truth over past session memories.
- **Workflow Restraint:** Never jump directly into code writing or multi-file creation loops on open requests. Always output a structured architectural plan first inside Plan Mode.
- **Dynamic Handoff Rule:** At the end of every prompt implementation, the AI agent MUST update the checkmarks in Section 3 and explicitly write the next pending sub-task description text directly into the "CURRENT ACTIVE TASK" placeholder.

---

## 1. Product Vision & Architecture Core
- **App Name:** Claude Code Architect Certification Tutor (CCAF Prep)
- **Design Philosophy:** "Terminal Blueprint" style — Inter for prose text, JetBrains Mono for system layout markers, uppercase micro-typography, fine hairline borders, and persistent light/dark tokens.
- **The Core Stack:** TanStack Start (React 19 + Vite), file-based routing, server functions, Lovable Cloud PostgreSQL database with pgvector, and managed AI Gateway endpoints for embeddings and TTS.

---

## 2. Global Architectural & Security Rules
- **Access Policies:** All database pathways must conform to strict RLS conditions. Use user-JWT context handles inside trace engines to prevent elevation bypasses.
- **Protected Trees:** The `_authenticated` layout tree acts as a hard gate. Unauthenticated traffic hitting `/study` paths must drop out and redirect cleanly to `/auth`.
- **Security Design Immunity:** The role checking helper `public.has_role` is intentionally compiled with `SECURITY DEFINER` privileges to cleanly execute non-recursive RLS policy checks. Do not alter or deprecate this baseline rule during automated sweeps.

---

## 3. ACTIVE SPRINT STATE (Dynamic Sync Point)

### 🟢 Completed Phases
- [x] **Stages 1–6b:** Core application framework, Voice Mentor, RAG library, multi-agent backbone, tracing, and role-gated admin shells.
- [x] **Stage 7 (Readiness Analysis):** Diagnostic models, pass forecasting bands, mock exam blueprints, custom mistake storage decks, and print layouts.
- [x] **Phase D1:** Floating window shell — independent non-modal panel, draggable by title bar, resizable.
- [x] **Phase D2:** Position/size persistence per browser session plus close and reopen via a "Study Canvas" button.
- [x] **Phase D3:** Multi-file tabs with read-only, syntax-highlighted view (Python and JavaScript) plus copy file / copy selection.
- [x] **Phase D4:** Execution provider interface + in-browser runners (Pyodide WASM for Python, isolated Blob worker for JavaScript) behind a swappable registry adapter.

### 🎯 CURRENT ACTIVE TASK (Immediate Next Action)
- [ ] **Phase D5:** Build run controls: 10-second execution timeout, cancel routine, and stdout/stderr/return-value console results pane.


---

## 4. Master Feature Backlog Roadmap (Remaining Micro-Tasks)
*AI Note: Only implement the active task in Section 3. Do not jump ahead into lower phases.*

### Phase D — CodeCanvas (Shell & Execution Remainder)
- [ ] **D3:** Implement multi-file tabs with read-only, syntax-highlighted view (Python and JavaScript) and copy file / copy selection.
- [x] **D4:** Execution provider interface + in-browser WASM runner (Pyodide for Python, isolated worker for JavaScript) behind a swappable adapter.
- [ ] **D5:** Build run controls: 10-second execution timeout, cancel routine, and stdout/stderr/return-value console results pane.
- [ ] **D6:** Create diagnostic runtime error display with line numbers and stack traces, plus pre-run syntax validation hooks.
- [ ] **D7:** Setup `code_executions` schema: database telemetry log table mapping timestamp, language, success/failure metrics, and output sizes (owner-scoped with RLS).

### Phase E — CodeCanvas (Content & Multi-Agent Generation)
- [ ] **E1:** Create `codebases` database schema: concept tags, language flags, difficulty scales, file payload strings, and security grants.
- [ ] **E2:** Implement primary cached example system: look up and load pre-built codebases instantly by concept tag with zero generation delays.
- [ ] **E3:** Add "More Codebases" demand toggle: queue 2–3 background examples asynchronously so learning flows uninterrupted.
- [ ] **E4:** Build code multi-agent generation loop script: Research (gaps) → SME (generate) → Verifier (execute) → Documentation (explain).
- [ ] **E5:** Build code quality execution filter: fail-safe retries that discard errors and prevent broken scripts from saving to database.
- [ ] **E6:** Add background generation UI stream tracker showing live step-by-step agent statuses from `code_gen_jobs`.
- [ ] **E7:** Structure advice breakdown matrices: detailed line-by-line code walks, design tradeoffs, and misconception checks.
- [ ] **E8:** Connect advice matrices directly into Mentor agent prompts for dynamically adjusted conversational depth.
- [ ] **E9:** Integration wire-up: tie code canvas tabs directly to active question context profiles and FSRS metrics.

### Phase F — Cost, BYOK, and Observability
- [ ] **F1:** Model routing optimization: cheap models check caches first, scaling up selectively by membership tiers.
- [ ] **F2:** Analytics tracking: map operational generation costs alongside strict cache hit/miss records.
- [ ] **F3:** Admin usage board: dashboard monitors cache optimization statistics, token economics, and popular concepts.
- [ ] **F4:** Encrypted server-side BYOK storage vault for individual Anthropic and Google operational keys.
- [ ] **F5:** Validation gates: active API keys securely override proxy subscription balances seamlessly inside worker engines.
- [ ] **F6:** Rate constraint guards: implement daily account quotas and throttling filters for mentor streams, generation actions, and TTS requests.

### Phase G — Content Scale-Up Remainder
- [ ] **G1:** Multi-item import logs panel: display granular per-row diagnostic errors for bulk content submissions.
- [ ] **G2:** Advanced spider control desk: catalog source URLs with targeted last-crawl timestamps.
- [ ] **G3:** Secure credentialed ingest mechanisms: process gated course assets using stored auth hashes.
- [ ] **G4:** Corpus defragmentation sweep: consolidate fragmented sections, strip empty structural artifacts, and re-embed.
- [ ] **G5:** Coverage parity report matrices: display visual domain gaps mapped straight against the certification exam blueprint.

### Phase H — Polish and Launch
- [ ] **H1:** Layout reflow pass: polish multi-frame canvas drawers for seamless mobile responsive viewports.
- [ ] **H2:** Semantic accessible tags pass: apply focus ordering indices, ARIA controls, and motion reduction options.
- [ ] **H3:** Resiliency boundaries pass: map fallback skeleton loading views on all dynamic route pathways.
- [ ] **H4:** Deploy SEO tagging structures: generate automated router-level Open Graph card parameters.
- [ ] **H5:** User onboarding flow: build interactive diagnostic configuration paths for fresh candidate sign-ups.
- [ ] **H6:** Penetration audit pass: check row levels, run vulnerability dependency scans, and clear loose database configurations.
- [ ] **H7:** Domain bind smoke deployment: wire live parameters and test core transaction pathways.

---

## 5. Conversational Decisions & Intent History Log
- **Audio Delivery Pivot:** Spoken modules deliver a short `[[brief]]` spoken overview dynamically matched to the text stream, while the full explanation displays asynchronously inside the chat drawer to conserve generation tokens.
- **Code Execution Architecture:** Sandbox compilation runs inside localized client side workers first via interface layers before deploying remote containers later.
