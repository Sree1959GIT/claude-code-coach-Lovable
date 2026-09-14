/**
 * Phase F4 — BYOK vault server functions.
 * Every call is scoped to the signed-in learner; raw keys never leave the server.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type KeyProvider = "anthropic" | "google";

export type StoredKeyMeta = {
  provider: KeyProvider;
  label: string | null;
  last4: string;
  isActive: boolean;
  lastVerifiedAt: string | null;
  lastVerifyStatus: string | null;
  updatedAt: string;
};

const providerSchema = z.enum(["anthropic", "google"]);

export const listMyProviderKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StoredKeyMeta[]> => {
    const { listKeyMeta } = await import("./byok.server");
    return listKeyMeta(context.userId);
  });

export const saveProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        provider: providerSchema,
        key: z.string().min(10).max(400),
        label: z.string().max(80).nullable().optional(),
        verify: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { validateKeyShape, verifyProviderKey, storeKey } = await import("./byok.server");
    const shapeError = validateKeyShape(data.provider, data.key);
    if (shapeError) throw new Error(shapeError);

    const verify = data.verify === false ? null : await verifyProviderKey(data.provider, data.key);
    if (verify && !verify.ok) {
      throw new Error(`The provider rejected that key (${verify.status}).`);
    }

    const meta = await storeKey({
      userId: context.userId,
      provider: data.provider,
      key: data.key,
      label: data.label ?? null,
      verify,
    });
    return meta;
  });

export const testProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ provider: providerSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { getActiveKey, verifyProviderKey } = await import("./byok.server");
    const key = await getActiveKey(context.userId, data.provider);
    if (!key) throw new Error("No active key stored for that provider.");
    const result = await verifyProviderKey(data.provider, key);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("user_provider_keys")
      .update({ last_verified_at: new Date().toISOString(), last_verify_status: result.status })
      .eq("user_id", context.userId)
      .eq("provider", data.provider);

    return result;
  });

export const setProviderKeyActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ provider: providerSchema, isActive: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { setKeyActive } = await import("./byok.server");
    await setKeyActive(context.userId, data.provider, data.isActive);
    return { ok: true };
  });

export const deleteProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ provider: providerSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { removeKey } = await import("./byok.server");
    await removeKey(context.userId, data.provider);
    return { ok: true };
  });
