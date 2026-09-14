/**
 * Phase F4 — encrypted BYOK vault (server-only).
 *
 * Learner-supplied Anthropic / Google keys are stored as AES-256-GCM
 * ciphertext, never in plaintext. The encryption key is derived from the
 * server secret BYOK_ENCRYPTION_KEY; the stored value is opaque even to
 * anyone browsing the database.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type KeyProvider = "anthropic" | "google";
export const KEY_PROVIDERS: KeyProvider[] = ["anthropic", "google"];

export const PROVIDER_LABELS: Record<KeyProvider, string> = {
  anthropic: "Anthropic",
  google: "Google AI",
};

function vaultKey(): Buffer {
  const raw = process.env["BYOK_ENCRYPTION_KEY"];
  if (!raw) throw new Error("BYOK vault is not configured (missing BYOK_ENCRYPTION_KEY).");
  // Derive a fixed 32-byte key from the secret, whatever its length.
  return createHash("sha256").update(raw, "utf8").digest();
}

/** iv | auth tag | ciphertext, base64 — one opaque column value. */
export function encryptKey(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptKey(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function last4(secret: string): string {
  return secret.trim().slice(-4);
}

/** Shape checks that catch obvious paste mistakes without rejecting new formats. */
export function validateKeyShape(provider: KeyProvider, key: string): string | null {
  const value = key.trim();
  if (value.length < 20) return "That key looks too short.";
  if (/\s/.test(value)) return "That key contains spaces — paste it without line breaks.";
  if (provider === "anthropic" && !value.startsWith("sk-ant-")) {
    return "Anthropic keys normally start with sk-ant-.";
  }
  if (provider === "google" && !value.startsWith("AIza")) {
    return "Google AI keys normally start with AIza.";
  }
  return null;
}

/** Live reachability check against the provider, using the supplied key. */
export async function verifyProviderKey(
  provider: KeyProvider,
  key: string,
): Promise<{ ok: boolean; status: string }> {
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      });
      return { ok: res.ok, status: res.ok ? "ok" : `HTTP ${res.status}` };
    }
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
    );
    return { ok: res.ok, status: res.ok ? "ok" : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, status: err instanceof Error ? err.message.slice(0, 120) : "network error" };
  }
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type StoredKeyMeta = {
  provider: KeyProvider;
  label: string | null;
  last4: string;
  isActive: boolean;
  lastVerifiedAt: string | null;
  lastVerifyStatus: string | null;
  updatedAt: string;
};

export async function listKeyMeta(userId: string): Promise<StoredKeyMeta[]> {
  const db = await admin();
  const { data, error } = await db
    .from("user_provider_keys")
    .select("provider, label, key_last4, is_active, last_verified_at, last_verify_status, updated_at")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    provider: r.provider as KeyProvider,
    label: r.label,
    last4: r.key_last4,
    isActive: r.is_active,
    lastVerifiedAt: r.last_verified_at,
    lastVerifyStatus: r.last_verify_status,
    updatedAt: r.updated_at,
  }));
}

export async function storeKey(args: {
  userId: string;
  provider: KeyProvider;
  key: string;
  label?: string | null;
  verify: { ok: boolean; status: string } | null;
}): Promise<StoredKeyMeta> {
  const db = await admin();
  const now = new Date().toISOString();
  const { error } = await db.from("user_provider_keys").upsert(
    {
      user_id: args.userId,
      provider: args.provider,
      label: args.label ?? null,
      key_ciphertext: encryptKey(args.key.trim()),
      key_last4: last4(args.key),
      is_active: true,
      last_verified_at: args.verify ? now : null,
      last_verify_status: args.verify?.status ?? null,
      updated_at: now,
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw error;
  return {
    provider: args.provider,
    label: args.label ?? null,
    last4: last4(args.key),
    isActive: true,
    lastVerifiedAt: args.verify ? now : null,
    lastVerifyStatus: args.verify?.status ?? null,
    updatedAt: now,
  };
}

export async function removeKey(userId: string, provider: KeyProvider): Promise<void> {
  const db = await admin();
  const { error } = await db
    .from("user_provider_keys")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw error;
}

export async function setKeyActive(
  userId: string,
  provider: KeyProvider,
  isActive: boolean,
): Promise<void> {
  const db = await admin();
  const { error } = await db
    .from("user_provider_keys")
    .update({ is_active: isActive })
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw error;
}

/**
 * Decrypted key for server-side use. Phase F5 wires this into routing; it is
 * never returned to the browser.
 */
export async function getActiveKey(
  userId: string,
  provider: KeyProvider,
): Promise<string | null> {
  try {
    const db = await admin();
    const { data } = await db
      .from("user_provider_keys")
      .select("key_ciphertext, is_active")
      .eq("user_id", userId)
      .eq("provider", provider)
      .maybeSingle();
    if (!data?.is_active || !data.key_ciphertext) return null;
    return decryptKey(data.key_ciphertext);
  } catch {
    return null;
  }
}
