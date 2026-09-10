# Phase G4 — Corpus defragmentation sweep

## Goal
Clean up the ingested library so retrieval stops returning half-sentences and empty
structural leftovers, then re-embed whatever changed.

## What was built
1. **Artifact stripping** — horizontal rules, markdown table separators, empty headings
   and bullets, stray markup, and boilerplate nav lines ("Skip to content", "On this
   page", "Was this page helpful?") are removed from every chunk. A chunk with fewer
   than 40 letter/digit characters left is deleted outright.
2. **Section consolidation** — adjacent chunks are merged when either side is under
   220 characters and the merged window stays under 1400 characters, so fragmented
   sections become coherent retrieval units again.
3. **Renumber + re-embed** — surviving chunks are renumbered from 0, folded chunks are
   deleted, and only chunks whose text actually changed are re-embedded.
4. **Reporting** — apply runs write a `job_runs` row (`defrag-corpus`) with counts and
   duration; the admin panel shows before/after totals and a per-document table.

## Surfaces
- `src/lib/defrag.server.ts` — sweep core (server-only).
- `src/lib/defrag.functions.ts` — `runDefragSweep`, admin-gated.
- `src/components/admin/DefragPanel.tsx` — Dry_Run then Apply_Sweep.
- `/admin` section 14 · Corpus_Defrag.

## Bounds
- Max 20 documents per run (hard cap 40), oldest-updated first.
- Dry run writes nothing; apply is the only path that mutates or logs.

## Next
Phase G5 — coverage parity report matrices.
