# Estimator accuracy pass — mark what is actually built

The unticked items in the Estimator are not a sign of missing features. Those checkboxes are *cost toggles* for a "what will this stage cost" calculator, and they default to off; nothing ever flipped them to reflect what shipped. The Estimator also still shows Stage 5 as "next" and Stage 6 as "planned", and it has no entries for the Enhancement 2.0 phases (A–H).

## Actual status of the eight items

| Item | Built? | Where |
|---|---|---|
| a. Custom illustrations / generated art | Yes | generated dashboard preview art used on the landing page |
| b. Bulk question import tooling | Yes | bulk import panel in `/admin` + import server functions |
| c. Video reference modal (timestamped playback) | Yes | curated resource catalog + in-app YouTube modal in the mentor |
| d. Self-hosted TTS (Inflect) | No — deliberate | replaced by gateway TTS; no hosting for a HF model |
| e. Authenticated source fetching | No | still open (Phase G3) |
| f. Library admin viewer | Yes | `/library` admin: seed, re-embed, ingest, retrieval test |
| g. Human review queue | Yes | `/reviews` with claim, filters, notes, publish-on-approve |
| h. Agent eval harness | Yes | agent evals + runs + results, admin panel section |

So six of the eight are done, one is intentionally dropped, one is genuinely outstanding.

## Are the two gaps required?

- Self-hosted Inflect TTS: not required. The gateway voice already covers narration, and self-hosting a model needs an inference host this app does not have. Recommend removing it from the Estimator rather than leaving it as an unbuilt option.
- Authenticated source fetching: only required if you want the tutor grounded in gated Skilljar/course material. Keep it as a listed, unticked option under Phase G until you decide.

## Changes to make

1. Update `src/lib/credit-estimates.ts`:
   - Mark Stage 5 and Stage 6 as `done`.
   - Set `default: true` on the six shipped options (a, b, c, f, g, h) so the Estimator reflects reality.
   - Remove the Inflect self-hosted TTS option; keep authenticated source fetching unticked.
   - Add the Enhancement 2.0 phases as stages: A–C (agentic authoring) marked `done`, D–E (CodeCanvas) `next`, F (cost/BYOK), G (content scale-up), H (polish/launch) `planned`, each with sub-task options and credit ranges from the enhancement plan.
2. Update `src/routes/_authenticated/estimator.tsx` only where needed: a short "shipped" vs "remaining" total so the page reads as a progress view as well as a cost calculator, and make sure `done` stages are visually distinct.

No backend, schema, or feature code changes — this is an accuracy fix to the Estimator data plus a small presentation tweak. Phase D CodeCanvas stays untouched and ready to start.
