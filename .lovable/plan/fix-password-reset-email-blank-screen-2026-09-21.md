# Fix password-reset email blank screen

## Goal
Ensure clicking the reset button in the email always opens the app's New Password screen, then returns to Sign In after a successful update.

## Plan
1. Trace the hosted email callback and the app's recovery-session handling for both modern code-based links and legacy hash-token links.
2. Replace the fragile redirect listener with a dedicated recovery callback that waits for authentication to finish before opening the reset form.
3. Show a useful recovery error instead of a blank page when a link is expired or invalid.
4. Test the complete callback and redirect behavior in the preview, then update the project handoff notes.

## Technical details
- Keep `/reset-password` public.
- Support `code`, `token_hash`, and `type=recovery` callback formats without exposing tokens.
- Preserve the existing sign-out and return-to-login behavior after password update.
