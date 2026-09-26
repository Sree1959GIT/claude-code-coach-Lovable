# Answer mode not visible — stale preview URL

## Diagnosis

The screenshot shows the app open at `preview--code-architect-companion.lovable.app` — an old preview address from before the D1–D5 multi-answer work. The current build (this project's live preview) already contains the "Answer mode" block: it sits in the question editor between the Domain/Difficulty/Key concept row and the Scenario field, with "One correct answer" / "Several correct answers" choices and a "Lock answers (baseline)" button.

So there is no missing feature — the browser tab is pointing at an outdated copy of the app.

## Steps

1. Verify in the current live preview that Admin › Content › Edit question shows the Answer mode block (quick browser check).
2. Publish the app so the stable public address also carries the multi-answer feature — the old bookmarked address will then show it too.
3. Confirm to the user the correct address to use going forward.

## Technical notes

- No code changes expected; QuestionEditor.tsx already renders the Answer mode section (lines 166–218).
- If the current preview also lacks the block, investigate the build before publishing.
