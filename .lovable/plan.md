# Next Build Wave — Speed, Multi-Answer, Canvas, Any-Exam

Eight workstreams, broken into small prompts. Each prompt is one sitting of work (roughly two credits) and leaves the app working.

One honest note up front: you chose the in-browser offline voice. A voice that runs on the learner's own machine cannot sound exactly like today's cloud "alloy" voice. The plan ships the offline voice as the default for instant speech and keeps the cloud voice as a selectable option, so you can compare them side by side and decide.

---

## A. Mentor speed and voice (first priority)

**A1 — Measure and trim the wait.**
Time each stage of a mentor reply (routing, memory, library lookup, first token). Log the timings and show them in the admin console. Run the memory and library steps at the same time as the model warm-up instead of before it, and skip the library lookup for chit-chat turns.

**A2 — Speak the first sentence immediately.**
Move the short spoken summary to the *front* of the reply instead of after the written answer, so speech can begin on the first sentence while the written explanation is still arriving.

**A3 — Offline voice engine.**
Add an in-browser speech engine (WASM neural voice, downloaded once and cached). Speech starts within a fraction of a second, costs nothing, and works offline.

**A4 — Voice picker.**
Settings control: Instant (offline) or Studio (today's cloud voice). Remembered per learner. Automatic fallback to cloud if the offline engine can't load.

**A5 — Offline listening.**
Replace the browser's built-in dictation with the same local engine so microphone input works consistently across browsers and keeps working offline.

**A6 — Sentence-level pipelining.**
Speak sentence N while sentence N+1 is still being prepared, with a barge-in stop so the learner can interrupt mid-sentence.

---

## B. Study Canvas fixes (quick wins)

**B1 — Contrast pass.**
Give the Study Canvas its own raised surface: darker/lighter panel than the page behind it, stronger border, clear shadow, readable code colours in both light and dark mode.

**B2 — Canvas action buttons.**
Add a toolbar row to the Canvas: **Explain_Code**, **Guide_Me**, **Example_Videos**.

**B3 — Wire Explain_Code to the mentor.**
Today the mentor only ever sees the question. Send the currently open file, the visible/selected lines, the language and any run output along with the request, and add a code-explaining mode to the mentor prompt so it walks through the code rather than the question.

**B4 — Guide_Me and Example_Videos.**
Guide_Me asks for a step-by-step walkthrough with checkpoints. Example_Videos pulls matching video clips for the code's concept into the Canvas video tab.

---

## C. Video clips with exact windows

**C1 — Stop timestamps.**
Add an end time to every video reference and fill in the existing library entries.

**C2 — Player honours the window.**
The player starts at the start time and stops at the end time, with a small "clip 2:10–3:40" label and a replay-clip button.

**C3 — Agent-picked windows.**
When the resource agent suggests a video, it also proposes the start/stop for the relevant passage; admin can correct it.

---

## D. Multi-answer questions

**D1 — Data and admin switch.**
Add an answer-count setting per question (single or multiple) plus a baseline lock. Once a question is baselined the setting can't change.

**D2 — Authoring.**
The question generator and editor respect the setting: multi-answer questions get the right number of correct options and a "select all that apply" instruction.

**D3 — Answering.**
Checkboxes instead of radio buttons for multi-answer questions, with a submit step and partial-credit scoring (all-or-nothing by default, configurable).

**D4 — Everything downstream.**
Scoring, review, mistakes deck, mock exams and the readiness model all handle multi-answer results.

---

## E. Research agent — question-bank finder

**E1 — Deep research run.**
Admin button that sends the research agent out to find question banks and practice sets for the current exam subject. It returns candidate sources.

**E2 — Results desk.**
A table of found sources: URL, title, estimated number of questions/answers, licence/access notes, confidence. Click a row to open a preview canvas showing sampled questions.

**E3 — Import.**
"Import to library" per source: pulls raw content into the library ingest pipeline, with a per-row log like the existing bulk-import panel.

**E4 — Safety and dedupe.**
Skip paywalled/disallowed sources, flag copyright risks, and de-duplicate against existing questions before import.

---

## F. Model configuration (Ollama / OpenRouter / cloud)

**F1 — Provider registry.**
Admin can register model endpoints: Ollama, OpenRouter or any aggregator, and cloud providers. Each entry stores its address, credentials and whether learners may pick it.

**F2 — Learner picker.**
Learners choose from the models the admin allows, per task type (mentor, code generation, research).

**F3 — Hardware scan and recommendation.**
Detect the learner's machine capability and recommend suitable local models for this subject, ranked by speed, tool-calling support and quality, with a note on speed-up options.

**F4 — Capability checks.**
Before a model is offered, verify it responds and supports tool calling; show a health badge and fall back automatically when one is down.

---

## G. Any-exam support (multiple exams + self-serve)

**G1 — Exam entity.**
Introduce an exam record: name, description, domains, blueprint weights, passing score, question count, duration. Move the current CCAF content under it.

**G2 — Exam switching.**
Header switcher; the dashboard, study, library, readiness and admin screens all scope to the active exam.

**G3 — De-hardcode the wording.**
Replace CCAF-specific titles, prompts and page copy with values from the exam record.

**G4 — Create-an-exam wizard.**
Any user creates an exam: name it, describe it, set domains and weights (or let the research agent propose them), then kick off library building and question generation.

**G5 — Isolation and sharing.**
Each exam's library, questions, progress and readiness stay separate; optional sharing of a published exam with other learners.

---

## H. Housekeeping

**H1** — Update the roadmap and sprint state file with all of the above as the new backlog, replacing the finished Phase D–H list.

---

## Technical notes

- Offline voice: a WASM text-to-speech model (Piper/Kokoro class) loaded via a worker and cached in the browser; speech-to-text via a small local Whisper-class WASM model. Both behind the existing execution-provider style registry so cloud remains a swappable adapter.
- Mentor latency: the current chain runs routing, memory and retrieval before opening the model stream, and the spoken summary sits after the written body, so speech cannot begin until late in the stream. A2 reorders the marker; A1 parallelises the pre-steps.
- Canvas context: `MentorCanvas` currently receives only the question context; B3 extends that payload with the active file, selection, language and last run output.
- Video windows: `LearnResource` has `start` only — add `end`, and stop playback via the player API rather than the embed URL.
- Multi-answer: `question_options.is_correct` already allows several true rows; the gap is an answer-count/lock field on `questions` plus the grading and UI paths.
- Exams: a new `exams` table with an exam reference on domains, questions, library documents and progress tables, plus row-level rules scoped by exam.
