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
- [ ] A3: Offline voice engine with download progress
- [ ] A4: Voice picker (Instant / Studio) with announced fallback
- [ ] A5: Microphone choice (on-device / browser)
- [ ] A6: Barge-in with a visible Stop

### B — Study Canvas
- [ ] B1: Raised-surface contrast
- [ ] B2: Explain code / Guide me / Example videos buttons
- [ ] B3: Send file, selection, language and run output to the mentor, and show what was captured
- [ ] B4: Guide me walkthrough + example videos

### D — Multi-answer questions
- [ ] D1: Answer mode + baseline lock
- [ ] D2: Authoring honours the mode
- [ ] D3: Checkbox answering with explicit submit
- [ ] D4: Partial credit as a third result state
- [ ] D5: Downstream — mistakes, history, analytics, scheduling

### C — Video clip windows
- [ ] C1: End times
- [ ] C2: Player honours the window + clip badge
- [ ] C3: Admin range scrubber

### E — Question-bank finder
- [ ] E1: Deep research job with staged progress
- [ ] E2: Source results desk
- [ ] E3: Import to library with per-row log
- [ ] E4: Safety and dedupe

### F — Model configuration
- [ ] F1: Provider registry
- [ ] F2: Learner picker in Settings
- [ ] F3: Hardware scan and recommendation
- [ ] F4: Health badges and fallback
