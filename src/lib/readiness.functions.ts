/**
 * Stage 7 sub-task 1 — readiness server function.
 * Reads the caller's own mastery + attempts (RLS-scoped) and blends them with
 * the domain blueprint into a 0-100 readiness report.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeReadiness, type ReadinessReport } from "./readiness";

export const getReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReadinessReport> => {
    const { supabase, userId } = context;

    const [domainsRes, questionsRes, masteryRes, attemptsRes] = await Promise.all([
      supabase.from("domains").select("id, slug, title, weight").order("sort_order"),
      supabase.from("questions").select("id, domain_id"),
      supabase
        .from("user_mastery")
        .select(
          "question_id, status, stability, reps, lapses, last_attempt_at, last_attempt_correct",
        )
        .eq("user_id", userId),
      supabase
        .from("question_attempts")
        .select("question_id, is_correct, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);

    const err =
      domainsRes.error || questionsRes.error || masteryRes.error || attemptsRes.error;
    if (err) throw err;

    return computeReadiness({
      domains: domainsRes.data ?? [],
      questions: questionsRes.data ?? [],
      mastery: masteryRes.data ?? [],
      attempts: attemptsRes.data ?? [],
    });
  });
