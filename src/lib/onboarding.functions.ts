/**
 * Phase H5 — candidate onboarding preferences.
 * Stores target exam date, target score band and weekly study hours on the
 * caller's own profile row (RLS-scoped).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OnboardingPrefs = {
  examDate: string | null;
  targetScore: number | null;
  weeklyHours: number | null;
  onboardedAt: string | null;
  displayName: string | null;
};

export const getOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OnboardingPrefs> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("exam_date, target_score, weekly_hours, onboarded_at, display_name")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return {
      examDate: data?.exam_date ?? null,
      targetScore: data?.target_score ?? null,
      weeklyHours: data?.weekly_hours ?? null,
      onboardedAt: data?.onboarded_at ?? null,
      displayName: data?.display_name ?? null,
    };
  });

export const saveOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        targetScore: z.number().int().min(50).max(100),
        weeklyHours: z.number().int().min(1).max(60),
        complete: z.boolean().optional().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<OnboardingPrefs> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          exam_date: data.examDate ?? null,
          target_score: data.targetScore,
          weekly_hours: data.weeklyHours,
          onboarded_at: data.complete ? new Date().toISOString() : null,
        },
        { onConflict: "id" },
      )
      .select("exam_date, target_score, weekly_hours, onboarded_at, display_name")
      .single();
    if (error) throw error;
    return {
      examDate: row.exam_date ?? null,
      targetScore: row.target_score ?? null,
      weeklyHours: row.weekly_hours ?? null,
      onboardedAt: row.onboarded_at ?? null,
      displayName: row.display_name ?? null,
    };
  });
