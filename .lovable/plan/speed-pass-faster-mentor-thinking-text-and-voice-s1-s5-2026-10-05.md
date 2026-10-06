# Speed pass: faster mentor thinking, text and voice (S1–S5)

Both GitHub copies are in sync (de204c7).

## Where the ~4.5 s goes today
The mentor does these steps one after another before the AI writes a word:
sign-in check → usage limit + trace record → Jev decision (up to 0.35 s) → library search → learner memory → clip/resource pick → AI call. Then Gemini 2.5 Flash "thinks" silently before answering (it reasons by default, often 1–3 s). That hidden thinking is the single biggest delay — not the mentor's own logic.

## What the research says (fastest options, Oct 2026)
- Cloud, fastest first word: **Gemini 2.5 Flash-Lite** or **Gemini 2.5 Flash with thinking turned off** (~0.3–0.6 s first word). Groq / Cerebras serving Llama or Qwen are faster still (~0.2 s) but need another key — optional later.
- Local (your 12 GB card): **Qwen3 4B / Llama 3.2 3B / Gemma 3 4B** at Q4 give 60–120 words/s; first word ~0.15 s when kept loaded. Qwen3 needs "no-think" mode, else it also thinks first.
- Local voice: **Kokoro-82M** (open weights, near-studio quality, runs in the browser on WebGPU) beats Piper on quality at similar speed. Piper stays as fallback.
- Listening: Whisper tiny/base in browser is already in; **Moonshine** (open, made for live speech) is ~3–5x faster on short phrases.
- Jev: it speeds up *choices*, not writing. Best use: decide intent in one tiny call *in parallel* with the answer starting, never in front of it.

## Steps (each about 2 credits)
**S1 — Stop the hidden thinking (biggest win)**
Live talk and first replies use Flash-Lite / Flash with thinking off. Deep "explain why" turns can still opt into thinking. Same for Ollama Qwen3 (no-think).

**S2 — Start the answer immediately**
Run usage check, trace record, memory and clip pick in parallel with the AI call instead of before it. Jev runs alongside: the answer starts with a generic plan, and Jev's reading is only waited on for typed (non-live) turns. Library search in live talk only when the question clearly needs it (already partly done).

**S3 — Instant spoken opener**
Remove the "Okay, look at what the question is actually asking" line. Replace it with a short, natural opener picked on the device (from the question type) and spoken at once while Gemini's first words arrive — so sound starts under 0.3 s.

**S4 — Better local voice and listening (optional download)**
Add Kokoro voice and Moonshine listener as downloads in Settings › Mentor & voice, next to the existing Piper and Whisper. Keep current ones as fallback.

**S5 — Measure**
Traces speed panel shows each step's time (limit check, Jev, search, model wait, first sound) per model, so we can confirm the gains.

## Target
First words under 0.8 s (cloud) and first sound under 0.5 s; local Ollama under 0.5 s first word.

## Technical details
- `inference-target.server.ts` / `model-providers.ts`: add `gemini-2.5-flash-lite`; send `reasoning_effort: "none"` (OpenAI-compatible endpoint) for live/cheap rungs.
- `api/mentor-stream.ts`: reorder awaits (L199–450) — start `streamExplainer` right after auth; quota check non-blocking with abort on failure; `runResourceAgent`, memory, `finishRun` moved off the critical path; Jev `Promise.race` skipped for live turns (fed into the trace only).
- LIVE_MODE prompt: rewrite opener; client-side opener bank in `MentorCanvas.tsx` keyed by Jev/keyword intent.
- `local-mentor.ts`: `think: false` for Qwen3; `keep_alive: "30m"`.
- S4: `kokoro-js` (WebGPU/WASM) and Moonshine via `@huggingface/transformers` in a worker, cached like Whisper.
- No database changes; RLS, exam isolation and `has_role` unchanged. AGENTS.md, roadmap and sprint log updated after each step.
