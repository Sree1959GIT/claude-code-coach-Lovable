# Faster mentor + real on-device listening (L1–L5)

Both GitHub copies are in sync (same latest version, no pending changes).

## What the article means for this app

Jev and its open versions (Laya, Semlf / "OpenJev", decider, GLiNER2.5-Decide) make **bounded choices** fast: "which of these options?" in one pass, no written text. They do **not** speed up writing an explanation. So:

- They can replace the mentor's slow **choice** steps: what kind of question is this, is library lookup needed, which clips fit, did the answer leak the correct option.
- The written answer and voice still come from a normal model. Those get faster through streaming, a quicker first model, and doing more work on your own device.

The mentor today already picks its route with fixed keyword rules (instant), so the biggest wins are elsewhere. The order below puts the biggest wins first.

## Steps (each fits in about 2 credits)

**L1 — Real on-device listening (fixes the message you saw)**
Chrome's built-in on-device option is often missing, so the mentor falls back. Replace it with open-source Whisper that runs in the browser (WebGPU, or slower fallback). It downloads once (~40 MB small English model) and is kept, like the Instant voice. Settings › Mentor & voice gets a Download / Test / Remove row. Browser dictation stays only as the last resort.

**L2 — Voice starts on the first sentence**
Send the first finished sentence to the voice while the rest is still writing, and prepare the next sentence while the current one plays. Instant (on-device Piper) voice needs no cloud round trip at all.

**L3 — Faster first words of text**
The first words come from the quickest model. Library lookup and learner memory get a short time limit (skipped if slow). The prompt is trimmed, and repeated context is cached. Each reply shows "first words in X ms" on the Traces page, so we can measure it.

**L4 — Fast decision step (Jev-style, open source)**
Add one "decide" step using the letter-scoring method from Semlf / mini-Jev: ask a small model a lettered question and read the answer in one pass. Use it for: question type, whether library lookup is needed, and the answer-leak check. Runs on the built-in allowance now, and on Ollama if you use it (F3). The keyword rules remain as an instant backup. The Traces page compares speed and agreement before we rely on it.

**L5 — Mentor answers through your local Ollama (optional)**
If Ollama is running on your computer, the mentor can write its answers there: no network wait, no allowance used. The cloud is used automatically when Ollama isn't reachable.

## Honest limits
- The article's speed figures come from the projects themselves, measured on server GPUs. Test on our own data (L4 trace) before trusting them.
- Laya / GLiNER-style small encoders need a GPU server or in-browser build. The server we run on can't host them. That's why L4 uses the letter-scoring method, which works with any model we can already call.
- Whisper in the browser is quick on recent laptops, but it can be slow on older phones.

## Technical details
- L1: `@huggingface/transformers` (Whisper tiny.en/base.en, WebGPU → WASM), in a Web Worker. MediaRecorder → 16 kHz PCM → transcript. New `src/lib/offline-stt.ts` mirrors `offline-voice.ts` (Cache Storage, progress). MentorCanvas swaps its `processLocally` path for it.
- L2: sentence queue in MentorCanvas; pre-synthesise n+1; Piper path already client-side.
- L3: `mentor-stream.ts` — `Promise.race` timeouts on memory/retrieval, a cheap rung for first-token model, and a `ttft` step in the trace/Server-Timing.
- L4: `src/lib/agents/decide.server.ts` — lettered prompt, `max_tokens:1`, `logprobs` where the provider returns them, else parse single letter; fallback to `planRoute`.
- L5: client-side streaming from `localhost:11434/api/chat` when the provider pref is `ollama` and it can be reached; requires `OLLAMA_ORIGINS`.
- roadmap.md + AGENTS.md updated per step.
