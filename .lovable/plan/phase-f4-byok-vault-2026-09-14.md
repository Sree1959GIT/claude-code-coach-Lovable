# Phase F4 — Encrypted BYOK key vault

## What shipped
- `user_provider_keys` table: one row per user per provider (`anthropic` | `google`),
  storing AES-256-GCM ciphertext, last-4, label, active flag, last verify status.
  Service-role only (no anon/authenticated grants; RLS on with a service-role policy).
- `src/lib/byok.server.ts` — encrypt/decrypt with a key derived (SHA-256) from the
  `BYOK_ENCRYPTION_KEY` secret, key-shape validation, live provider verification
  (Anthropic `/v1/models`, Google `/v1beta/models`), store/remove/toggle, and
  `getActiveKey()` for server-side use.
- `src/lib/byok.functions.ts` — auth-scoped server fns: list metadata, save (verify
  before store), test, pause/resume, delete. Raw keys never return to the browser.
- `src/components/admin/ByokPanel.tsx` + admin section 17 · BYOK_Key_Vault.

## Next step
Phase F5 — route completions through a stored active key when present, falling back
to the Lovable gateway otherwise.
