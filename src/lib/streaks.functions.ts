/**
 * Stage 7 sub-task 7 — activity feed for daily goals & streaks.
 * Returns the caller's own recent attempt timestamps (RLS-scoped).
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getActivityTimestamps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    const { supabase, userId } = context;
    const since = new Date();
    since.setDate(since.getDate() - 200);

    const { data, error } = await supabase
      .from("question_attempts")
      .select("created_at")
      .eq("user_id", userId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) throw error;
    return (data ?? []).map((r) => r.created_at as string);
  });
