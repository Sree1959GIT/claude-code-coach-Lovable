# Live Talk: turn-taking, interrupting and faster voice (T1–T3)

## Step 0 — Record the plan (done first)
- AGENTS.md: replace "Current active task" with this wave (T1 → T2 → T3), keeping the note that real-question loading and Jev tuning are still waiting.
- roadmap.md and docs/sprint-log.md §3: add T1–T3 as open tasks.

## T1 — Turn-taking and interrupting
- The microphone keeps listening while the mentor speaks. Echo cancellation stops the mentor's own voice from counting as you.
- When you start talking (about 80 ms of speech), the mentor stops at once: audio stops, its half-written reply is cut off, and the screen shows "Listening".
- Clear turn states: Idle → Listening → Thinking → Speaking (can be interrupted) → Interrupted → Listening.
- What you say after interrupting goes to the listener you picked (on-device Whisper or the browser).

## T2 — Voice starts with the text
- The server sends a short spoken opener based on the question type before the full answer arrives (the existing opener, made faster in live talk).
- Speech starts on the first short phrase (4–8 words, or the first comma/full stop), not on the first full sentence. The next phrase is prepared while the current one plays.
- Live talk uses a short spoken style (2–3 sentences). Typed questions still get the full written answer.
- In live talk, library search is skipped unless Jev says it is clearly needed, and Jev gets a shorter time limit.
- Traces shows time to first sound next to time to first words.

## T3 — Use your own Gemini key (saves Lovable credits, works on Vercel)
- If a Gemini key is saved as a server secret, the mentor talks to Google directly instead of the Lovable gateway. With no key, nothing changes.
- Learner keys saved in Settings still come first.

## Target timings
- First sound under 0.5 s after you stop talking (cloud), and under 1 s with Ollama on your own computer.
- Audio stops under 0.1 s after you start talking.

## Technical details
- `MentorCanvas.tsx`: one `getUserMedia` stream with echoCancellation/noiseSuppression/autoGainControl; an AnalyserNode RMS detector with an adaptive noise floor; a `bargeIn()` that pauses audio, cancels speechSynthesis, empties the queue, and aborts the `fetch` AbortController / Ollama stream; a turn state reducer; `SegmentParser` clause mode for `liveMode`.
- `api/mentor-stream.ts`: a `live` flag → short prompt, smaller decide budget, retrieval only when needsLibrary ≥ 0.6; connect `request.signal` so the model call stops when you interrupt; log `ttfa_ms` from the client via analytics.
- `offline-voice.ts`: phrase queue that reuses the warm Piper session.
- `inference-target.server.ts`: after the BYOK check, use `GEMINI_API_KEY` if present → Google's OpenAI-compatible endpoint (`generativelanguage.googleapis.com/v1beta/openai/chat/completions`), then the Lovable proxy. `decide.server.ts` stays on the gateway, with the keyword fallback.
- Ask for `GEMINI_API_KEY` through the secure secret form only when T3 starts.
- No database changes; RLS, exam isolation and `has_role` stay as they are.

## Checks
- Browser run: start live talk, interrupt mid-reply → audio stops and the request is aborted (network tab).
- Traces shows first-sound times; typed mentor replies are unchanged.
- With the Gemini key set, one mentor reply goes to Google and streams fully.
- Voice and mic have to be confirmed by you on a real device.
