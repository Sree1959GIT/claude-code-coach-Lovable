# L4 review: Jev agreement report (review only, no switch)

## What "Switch routing to Jev" meant
Jev is built, but it only runs in the background right now. Each mentor question is still routed by the older keyword rules. Jev's guess is supposed to be recorded next to that route so the two can be compared. Switching would make Jev's guess the one that counts. You chose **review only**, so routing stays exactly as it is.

## What the data shows today
- 12 mentor conversations ran in the last 7 days.
- **No Jev decisions were recorded at all.** Nothing has been saved to compare yet.
- Failures are silently ignored, so the cause is **not confirmed**. It could be a failed call, the 2.5-second timeout, or a mismatch in how the reply is read.

## Plan
1. **Find out why nothing is recorded.** Call Jev directly with a sample question and check the reply. Then fix the cause: how the reply is read, the timeout, or the request.
2. **Record failures too.** A failed or timed-out Jev call gets saved as a "decide failed" step with the reason, so problems can't stay hidden again.
3. **Agreement report on the Traces page (admins only).** A new "Jev vs keyword" panel shows:
   - how many decisions were recorded, how often they agreed, how many failed, and average speed
   - a breakdown by question type, showing where the two disagree most
   - the 20 most recent disagreements (the learner's message, the keyword route, Jev's pick and how confident it was)
   - a readiness line: "Not enough data" under 50 decisions, otherwise the agreement percentage. It only informs you; it doesn't switch anything.
4. Update AGENTS.md and roadmap.md with L4b (the review report), and note that switching routing stays a decision for you.

## Technical details
- Sample call to `/v1/systemone` from the server with the existing request. Compare the reply to how it's read today (`answers.intent.choice`, plus `confidence` versus `score`). Keep the model `typesafe/jev-latest` and don't retry blocked calls.
- `decideTurn` returns `{ ok: false, reason, status }` instead of `null`. In `mentor-stream.ts`, the `decide` step logs `status: "error"` with the reason.
- New admin-only `getJevAgreement` server function (checks `has_role` through the user's session). It reads `agent_steps` rows where `role = 'decide'`, grouped by `input.keywordIntent`. It changes no data and needs no database changes.
- New panel added to `src/routes/_authenticated/traces.tsx`. `planRoute` is not touched.
