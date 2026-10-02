- [x] Phase H2: Semantic accessibility pass — focus management, dialog semantics, keyboard shortcuts, tab/tabpanel contract, reduced motion
- [x] Phase H3: Resiliency boundaries — skeleton fallbacks + error boundaries + retry on dynamic routes
- [x] Phase H4: Router SEO, Open Graph/Twitter cards, JSON-LD, dynamic study metadata, manifest, and social card
- [x] Phase H5: User onboarding flow — interactive diagnostic setup for new candidates
- [x] Phase H6: Penetration audit pass
- [x] Phase H7: Domain bind smoke deployment — backend rebound to the live instance, full authenticated smoke pass, hydration fix
- [x] Password recovery callback repair — preserve email-link credentials, validate the recovery session, and return to Sign In after update

## Next Build Wave (UI redesign review folded in)

### S — Shell first
- [x] S1: Colour + state tokens (success / warning / danger), surface ladder, radius, spacing, 44px touch target
- [x] S2: Typography pass — 12px floor, 15px body, sentence case, monospace budget, drop Snake_Case chrome
- [x] S3: Navigation — four destinations + Progress menu + account menu; operator tools leave the student header
- [x] S4: Mobile bottom bar + session focus mode
- [x] S5: Split /admin into five grouped routes, promote the review queue, admin overview
- [x] S6: Settings page (Study / Mentor & voice / Models / Account & plan)
- [x] S7: Dashboard reorder — day's task and one primary action first; real empty + error states

### G — Any-exam support (lands with the shell)
- [x] G1: Exam entity and blueprint data — exams table, domains.exam_id, seeded CCAF exam, mock exam reads the record
- [x] G2: Exam switcher in the header — exams table created and seeded, active exam remembered per browser, shown beside the product name with the readiness figure
- [x] G3: De-hardcode CCAF wording — landing hero, blueprint grid and every agent prompt read the active exam; empty blueprint renders a real message
- [x] G4: Create-an-exam wizard
  - [x] G4a: Steps 1–2 (name, blueprint with provenance) — save as draft
  - [x] G4b: Steps 3–4 (scope, live build progress)
- [x] G5: Per-exam isolation and sharing (study areas + readiness scoped to the active exam, ?exam= share links)

### A — Mentor speed and voice
- [x] A1: Stage timings + parallel pre-steps
- [x] A2: Spoken summary first — mentor speaks a short summary first ([[brief]]), then streams the written answer ([[written]]); legacy order still parsed
- [x] A3: Offline voice engine with download progress — ~60 MB Piper voice cached in browser storage, real byte progress bar in Settings › Mentor & voice, used by the mentor when Instant is chosen
- [x] A4: Voice picker (Instant / Studio) with announced fallback
- [x] A5: Microphone choice (on-device / browser)
- [x] A6: Barge-in with a visible Stop

### B — Study Canvas
- [x] B1: Raised-surface contrast — raised shell, stronger edge/elevation, and distinct chrome/workspace/console surfaces in both themes
- [x] B2: Explain code / Guide me / Example videos buttons
- [x] B3: Send file, selection, language and run output to the mentor, and show what was captured
- [x] B4: Guide me walkthrough + example videos

### D — Multi-answer questions
- [x] D1: Answer mode + baseline lock
- [x] D2: Authoring honours the mode
- [x] D3: Checkbox answering with explicit submit
- [x] D4: Partial credit as a third result state
- [x] D5: Downstream — mistakes, history, analytics, scheduling

### C — Video clip windows
- [x] C1: End times
- [x] C2: Player honours the window + clip badge
- [x] C3: Admin range scrubber

### E — Question-bank finder
- [x] E1: Deep research job with staged progress
- [x] E2: Source results desk
- [x] E3: Import to library with per-row log
- [x] E4: Safety and dedupe

### F — Model configuration
- [x] F1: Provider registry
- [x] F2: Learner picker in Settings
- [x] F3: Hardware scan and recommendation
- [x] F4: Health badges and fallback

### Current fixes
- [x] Recheck the cached Instant voice when Mentor opens and before playback; offer download inside Mentor when absent (existing browser download still needs user-browser playback verification).
- [x] Increase floating Study Canvas and video frame contrast in both themes; verified canvas in preview.
- [x] Publish an Agentic Workflows multi-answer question; verified checkbox selection and 0.5/1 partial credit in authenticated practice.

### L — Latency (Jev-style article)
- [x] L1: On-device listening (open-source Whisper in the browser)
- [x] L2: Voice starts on the first sentence
- [x] L3: Faster first words of text
- [x] L4: Fast decision step (letter-scoring, Semlf/mini-Jev style)
- [x] L5: Mentor answers through local Ollama
- [x] L4b: Jev agreement review panel on Traces (review only; switching waits on 50+ decisions and your decision)

### Phase 1 — Fast voice response and spoken briefs
- [x] P1.1: Jev also returns a visual focus target (scenario / stem / option / none); a short spoken opener is built from intent + focus with no model call and streamed before the first model token.
- [x] P1.2: Audio pipelining — two sentences of voice are prepared ahead of playback, and a barge-in silences and clears the current clip instantly.
- [x] P1.3: Deterministic highlighting — the focus target travels in an `X-Mentor-Focus` header and highlights the question part as the reply begins, then per-sentence markers take over.
- Verified: typecheck clean, live Jev call returns the focus answer. Not verified: audible playback in a real browser session.

### Phase 2 — Jev-driven Ask_Mentor text generation
- [x] P2.1: Active Jev router — Jev's intent drives `planRoute` with automatic fallback to keyword routing on Jev error or timeout; agreement still logged to Traces.
- [x] P2.2: Dynamic library gating — skip retrieval when Jev indicates the answer needs no reference material; time-box still applies.
- [x] P2.3: Prompt conditioning & scoping — pass Jev's intent and learner-misconception signals to the explainer/evaluator prompts; per-exam isolation must remain strictly maintained.

### Phase 3 — Check, separate and unblock
- [ ] P3.1: Fix or dismiss the 4 security findings, then publish
- [ ] P3.2: Dashboard, Progress and Mock exam scoped to the active exam
- [ ] P3.3: Seed CCAF areas + guided import of existing questions
- [ ] P3.4: Browser check of voice, listening, Ollama, research import

### Phase 4 — Measure and tune the mentor
- [ ] P4.1: Speed panel on Traces (first words / first voice by path)
- [ ] P4.2: Jev budget + library-skip tuning from real data
- [ ] P4.3: Ollama mentor gets exam context + Jev focus
- [ ] P4.4: One / Several answers column + filter in admin question list
