# Phase G5 — Coverage parity report matrices

## Goal
Show, at a glance, where the live question bank drifts from the certification exam
blueprint weights.

## What was built
1. `src/lib/coverage.functions.ts` — admin-gated `getCoverageParity`. Per domain it
   returns blueprint share, actual bank share, signed delta in points, published count,
   blueprint-derived target at a chosen bank size, gap, easy/medium/hard mix, citation
   share, and a short/parity/over state (±3 points band).
2. `src/components/admin/ParityPanel.tsx` — target-bank-size slider, summary tiles
   (published, in bank, shortfall, mean deviation), and a matrix with a diverging
   parity bar centred on the blueprint share.
3. `/admin` section 15 · Coverage_Parity.

## Bounds
- Read-only report; no writes, no schema changes.
- Deltas are computed against published questions only; drafts show in "in bank".

## Next
Phase F1 — model routing optimization.
