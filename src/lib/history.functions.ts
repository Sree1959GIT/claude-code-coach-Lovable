import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchDomains } from "./study";

export type SessionHistoryItem = {
  id: string;
  mode: string;
  domainTitle: string | null;
  planned: number;
  answered: number;
  correct: number;
  accuracy: number;
  durationMs: number | null;
  startedAt: string;
  endedAt: string | null;
  completed: boolean;
};

export const getSessionHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SessionHistoryItem[]> => {
    const { supabase, userId } = context;

    const [sessionsRes, domains] = await Promise.all([
      supabase
        .from("practice_sessions")
        .select("id, mode, domain_id, target_count, started_at, ended_at, metadata")
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .limit(60),
      fetchDomains(),
    ]);
    if (sessionsRes.error) throw sessionsRes.error;
    const sessions = sessionsRes.data ?? [];
    if (sessions.length === 0) return [];

    const domainById = new Map(domains.map((d) => [d.id, d]));

    const oldest = sessions[sessions.length - 1]!.started_at;
    const { data: attempts, error: attemptsErr } = await supabase
      .from("question_attempts")
      .select("question_id, is_correct, time_ms, created_at")
      .eq("user_id", userId)
      .gte("created_at", oldest)
      .order("created_at");
    if (attemptsErr) throw attemptsErr;

    return sessions.map((s) => {
      const ids = new Set(
        ((s.metadata as { question_ids?: string[] } | null)?.question_ids ?? []) as string[],
      );
      const start = new Date(s.started_at).getTime();
      const end = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
      const seen = new Map<string, boolean>();
      let timeMs = 0;
      for (const a of attempts ?? []) {
        const t = new Date(a.created_at).getTime();
        if (t < start || t > end) continue;
        if (ids.size && !ids.has(a.question_id)) continue;
        if (!seen.has(a.question_id)) timeMs += a.time_ms ?? 0;
        seen.set(a.question_id, a.is_correct);
      }
      const answered = seen.size;
      let correct = 0;
      for (const ok of seen.values()) if (ok) correct += 1;
      return {
        id: s.id,
        mode: s.mode,
        domainTitle: s.domain_id ? (domainById.get(s.domain_id)?.title ?? null) : null,
        planned: ids.size || s.target_count,
        answered,
        correct,
        accuracy: answered ? correct / answered : 0,
        durationMs: s.ended_at ? end - start : timeMs || null,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        completed: Boolean(s.ended_at),
      };
    });
  });
