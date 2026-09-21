# Next Build Wave — revised against the UI redesign review

The redesign document changes the order, not the content. Its core argument: turning this into a multi-exam platform rewrites the header, the brand lockup and every page title — and the navigation redesign rewrites the same header. Build them together first, or build the header twice.

So the wave now opens with **Shell** (navigation, design tokens, admin split, settings page, exam entity), then the feature workstreams land into a system that can hold them.

One honest note carried over: you chose the in-browser offline voice. It cannot sound exactly like today's cloud voice. It ships as the default "Instant" option with the cloud voice as "Studio", side by side in settings, so you can judge.

---

## S. Shell first (new — from the review)

**S1 — Colour and type tokens.**
Keep the zinc canvas and blue accent. Add the three missing state colours so blue stops doing every job: success (mastered/passing), warning (due now/awaiting a human), danger (lapsed/failed). Restore the 6px corner radius, set the spacing scale to 4/8, and set a 44px minimum touch target.

**S2 — Typography pass.**
Smallest text becomes 12px, not 10px. Body copy 15px, sentence case. Uppercase survives only as a section label — never a link, button or heading. Monospace is spent only on machine values: scores, timers, counts, routes, IDs, model names and code. Drop Snake_Case from navigation and buttons ("Mock exam", "Sign out", "Start today's session").

**S3 — Navigation: four destinations.**
Dashboard, Study, Mock exam, and a **Progress** menu holding analytics, mistake bank, session history and readiness report. Clear current-section marker. Streak chip, theme toggle and one account menu on the right. Operator tools (Library, Traces, Estimator) leave the student header.

**S4 — Mobile bottom bar.**
Home / Study / Exam / Progress, one thumb-tap away mid-session. Plus a focus mode for the question runner: the session screen drops the chrome.

**S5 — Split the admin console.**
Five routes instead of one 17-section scroll: Learners, Content, Quality, Retrieval, Operations, with a grouped side rail and counts (drafts awaiting review, failing jobs). Promote the Draft Review Queue, which today is linked from nowhere. An admin overview page leads with "what needs a human today".

**S6 — Settings page (built once, serves four features).**
Four tabs: Study (exam date, daily goal, notifications — the exam date currently lives only in browser storage), Mentor & voice, Models, Account & plan. This is where the voice picker, microphone choice and model picker live.

**S7 — Dashboard reorder.**
Lead with the day's task and a single primary action ("Start today's session"), then readiness, then the rest. Give a brand-new learner a first task instead of "Readiness unavailable" over blank meters. Replace `alert()` failures with real error states.

---

## G. Any-exam support (moves up — lands with the shell)

**G1 — Exam entity.** Exam record: name, description, domains, blueprint weights, pass mark, question count, duration. The five hard-coded domains become exam data. Current CCAF content moves under it.

**G2 — Exam switcher in the header.** The active exam is context, not brand: "CCA Prep" stays the product, the exam name sits beside it with a readiness figure, visible on every screen so no one misreads whose score they are seeing.

**G3 — De-hardcode the wording.** Landing hero, page titles, prompts and domain grid all read from the exam record, and render sanely for an exam with no blueprint yet.

**G4 — Create-an-exam wizard.** Four steps: name, blueprint, scope, build. The research agent proposes weights with provenance ("official guide" vs "inferred from practice sets"); the total is a live amber/green check rather than a submit-time error; nothing is irreversible and the screen says so; if the agent finds nothing, step two still works as a blank table. Step four hands over a **building** exam with live progress, not a spinner — the learner can close the tab.

**G5 — Isolation and sharing.** Per-exam library, questions, progress and readiness; exam cards show building / ready / needs attention; optional sharing of a published exam.

---

## A. Mentor speed and voice

**A1 — Measure and trim the wait.** Stage-by-stage timings (routing, memory, library lookup, first token) surfaced in the admin Operations area; run memory and retrieval in parallel with model warm-up; skip retrieval on chit-chat.

**A2 — Speak the first sentence immediately.** Move the spoken summary to the front of the reply so speech starts on sentence one.

**A3 — Offline voice engine.** In-browser neural voice, downloaded once and cached, with a real progress bar for the ~60 MB download — not a spinner.

**A4 — Voice picker in Settings.** Instant (default, on-device, starts in about a fifth of a second, free, offline) vs Studio (today's cloud voice, warmer, ~1s, uses credits), with "hear both". Fallback to Studio is announced in one quiet line so a changed voice never reads as a glitch.

**A5 — Microphone choice.** On-device transcription (consistent across browsers, works offline) or browser dictation.

**A6 — Barge-in.** Speaking over the mentor stops it, with a **visible Stop button** whenever it is talking.

---

## B. Study Canvas

**B1 — Contrast.** The canvas takes the raised surface tone against the page surface — solved by the S1 token board.

**B2 — Action buttons, renamed.** "Explain code" (primary), "Guide me" and "Example videos" (quiet). Sentence case, per S2.

**B3 — Explain code actually sees the code.** Send the open file, the selected lines, the language and the last run output to the mentor, add a code-explaining mode to its prompt, and **show what was captured** — "lines 14–28 of retry.ts" — so the context is never silent.

**B4 — Guide me / Example videos.** Step-by-step walkthrough with checkpoints; matching video clips for the code's concept.

---

## D. Multi-answer questions

**D1 — Mode and lock.** Per-question answer mode (single / multiple) plus a baseline lock that freezes it once published.

**D2 — Authoring.** Generator and editor honour the mode and produce the right number of correct options.

**D3 — Answering.** Checkboxes, "Select all that apply" shown **above the options** (not buried in the stem), a live selected-count, and an explicit Submit — nothing auto-advances.

**D4 — Partial credit is a third state.** Result reads "You found 2 of 3" with a per-option breakdown (correct / missed / wrong), each state carrying colour **plus** an icon and a word so it survives colour blindness and greyscale. Score shown as 2 of 3, never a bare percentage.

**D5 — Downstream.** Mistake bank gets its own "partly correct" filter; analytics and history show the split rather than one accuracy number; the review scheduler gets an explicit rule for what a partial score means, explained in the interface.

---

## C. Video clips with exact windows

**C1 — End times** on every video reference, backfilled for the existing library.
**C2 — Player honours the window**, with a monospace clip badge (`2:10-3:40`) and replay-clip.
**C3 — Admin correction via a range scrubber** on the timeline, not two number fields.

---

## E. Research agent — question-bank finder

**E1 — Deep research run** as a long-running job with staged progress in a closable panel, never a blocked screen.
**E2 — Results desk** reusing the review-queue table: URL, title, estimated question count, access notes, confidence; a row opens a preview.
**E3 — Import to library** with a per-row log.
**E4 — Safety and dedupe**: skip paywalled or disallowed sources, flag copyright risk, de-duplicate before import.

---

## F. Model configuration

**F1 — Provider registry** (Ollama, OpenRouter or any aggregator, cloud): admin-only, form-heavy, reusing the review-queue table shell.
**F2 — Learner picker lives in Settings → Models only.** A good default is chosen for them; nobody picks an inference provider to start a session.
**F3 — Hardware scan and recommendation** for the minority who want a local model.
**F4 — Health badges** (green / amber / red) with automatic fallback.

---

## Order

S1–S4 and G1–G3 together, then S5–S7, then A, then B, then D, then C and E, then F and G4–G5.

---

## Technical notes

- Tokens: extend the existing CSS variables with success/warning/danger pairs and restore `--radius`; the code-syntax tokens already exist and stay.
- Nav/admin split: new route files per admin group; the existing 17 panel components move under them unchanged.
- Offline voice: WASM text-to-speech in a worker with cache storage; on-device speech-to-text via a small WASM model, both behind a provider registry so cloud stays swappable.
- Mentor latency: the pre-steps currently run before the model stream opens, and the spoken marker sits after the written body.
- Canvas context: the mentor payload currently carries only the question; B3 extends it with file, selection, language and run output.
- Video: `LearnResource` has `start` only — add `end` and stop via the player API.
- Multi-answer: several correct options are already storable; the gap is the mode/lock field, grading, and the third result state across mistakes, history, analytics and scheduling.
- Exams: an `exams` table referenced by domains, questions, library documents and progress, with access rules scoped per exam.
