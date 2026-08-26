# Close the Phase B/C authoring gaps

Three gaps remain before agentic authoring is complete. Each is scoped to roughly 2 credits and can be built and verified on its own.

## Gap 1 — B7: Edit mode with field-level diff

Seed the same agent loop with an existing question instead of a blank brief.

- New input on the authoring run: an optional base question id plus revision notes.
- When present, load the live question, its options and domain, and feed them to the Setter as the starting point; the Adversary and Reviewer then attack the revision rather than a fresh item.
- The result carries a field-level diff (scenario, stem, key concept, difficulty, each option text / correct flag / explanation) comparing the live question with the proposed revision.
- The draft is saved with the base question recorded, so the review queue knows it is a revision, not a new item.

## Gap 2 — C1: Manual / Agentic mode switch

Today manual authoring and agentic authoring are two separate admin sections.

- Put a single Manual | Agentic toggle at the top of the question authoring section.
- Manual stays selected by default and its existing form is unchanged.
- Agentic renders the existing agentic panel in place; the standalone section 12 is removed so there is one authoring surface.

## Gap 3 — C4: Diff view and inline editing in review

The review page shows the draft and approve/reject, but no comparison or editing.

- For revision drafts, show the live question beside the proposed one with changed fields marked.
- Allow inline editing of stem, scenario, difficulty, and each option's text, correct flag and explanation before approving; edits are saved to the question and its options as part of approval.
- Add a Regenerate action that re-runs the loop from the current draft, and keep the existing approve (publish) / reject (archive) behaviour.

## Technical notes

- Loop changes live in `src/lib/authoring.server.ts`; the new inputs, diff computation and draft persistence go through `src/lib/authoring.functions.ts`, all admin-gated as today.
- The diff uses the existing `question_drafts.base_question_id` and `payload` columns — no migration needed.
- UI changes touch `src/components/admin/AgenticAuthoringPanel.tsx`, the authoring section of `src/routes/_authenticated/admin.tsx`, and `src/routes/_authenticated/reviews.tsx` only.
- Approval keeps publishing through the existing review resolution path so status, `published_at` and draft sync stay consistent.

Order: Gap 1, then Gap 2, then Gap 3.
