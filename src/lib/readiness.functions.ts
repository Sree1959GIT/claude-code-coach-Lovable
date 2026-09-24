/**
 * Stage 7 sub-task 1 — readiness server function.
 * Reads the caller's own mastery + attempts (RLS-scoped) and blends them with
 * the domain blueprint into a 0-100 readiness report.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeReadiness, type ReadinessReport } from "./readiness";
import { computeReadinessTrend, type ReadinessTrendPoint } from "./readiness-trend";

export const getReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { examId?: string | null } | undefined) => ({
    examId: typeof d?.examId === "string" && d.examId ? d.examId : null,
  }))
  .handler(async ({ context, data }): Promise<ReadinessReport> => {
    const { supabase, userId } = context;

    // G5 — readiness is isolated per exam when an exam id is given.
    let domainsQ = supabase.from("domains").select("id, slug, title, weight").order("sort_order");
    if (data.examId) domainsQ = domainsQ.eq("exam_id", data.examId);

    const [domainsRes, questionsRes, masteryRes, attemptsRes] = await Promise.all([
      domainsQ,
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

    const domains = domainsRes.data ?? [];
    const domainIds = new Set(domains.map((d) => d.id));
    const questions = (questionsRes.data ?? []).filter((q) => domainIds.has(q.domain_id));
    const qIds = new Set(questions.map((q) => q.id));

    return computeReadiness({
      domains,
      questions,
      mastery: (masteryRes.data ?? []).filter((m) => qIds.has(m.question_id)),
      attempts: (attemptsRes.data ?? []).filter((a) => qIds.has(a.question_id)),
    });
  });

/**
 * Stage 7 sub-task 8 — readiness trend (last N days) from the caller's attempts.
 */
export const getReadinessTrend = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReadinessTrendPoint[]> => {
    const { supabase, userId } = context;
    const since = new Date();
    since.setDate(since.getDate() - 45);

    const [domainsRes, questionsRes, attemptsRes] = await Promise.all([
      supabase.from("domains").select("id, slug, title, weight").order("sort_order"),
      supabase.from("questions").select("id, domain_id"),
      supabase
        .from("question_attempts")
        .select("question_id, is_correct, created_at")
        .eq("user_id", userId)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true })
        .limit(5000),
    ]);

    const err = domainsRes.error || questionsRes.error || attemptsRes.error;
    if (err) throw err;

    return computeReadinessTrend({
      domains: domainsRes.data ?? [],
      questions: questionsRes.data ?? [],
      attempts: attemptsRes.data ?? [],
      days: 30,
    });
  });
