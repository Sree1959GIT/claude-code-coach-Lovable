/** F2 — learner provider picker: read/save `profiles.preferred_provider`. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isProviderPref, PROVIDER_PREFS, type ProviderPref } from "./model-providers";
import { invalidateInferenceTarget } from "./inference-target.server";

export const getProviderPref = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("preferred_provider")
      .eq("id", context.userId)
      .maybeSingle();
    const v = (data as { preferred_provider?: string } | null)?.preferred_provider;
    return { pref: (isProviderPref(v) ? v : "auto") as ProviderPref };
  });

export const setProviderPref = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ pref: z.enum(PROVIDER_PREFS as [ProviderPref, ...ProviderPref[]]) }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ preferred_provider: data.pref } as never)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    invalidateInferenceTarget(context.userId);
    return { pref: data.pref };
  });

export const getMentorTemperature = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("profiles").select("mentor_temperature" as never).eq("id", context.userId).maybeSingle();
    const v = (data as { mentor_temperature?: unknown } | null)?.mentor_temperature;
    return { temperature: v == null ? null : Number(v) };
  });

export const setMentorTemperature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ temperature: z.number().min(0).max(1).nullable() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ mentor_temperature: data.temperature } as never)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    invalidateInferenceTarget(context.userId);
    return data;
  });
