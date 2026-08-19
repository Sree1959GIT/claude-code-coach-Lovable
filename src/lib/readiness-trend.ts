/**
 * Stage 7 sub-task 8 — Readiness trend over time.
 *
 * Pure helper: replays the readiness model day-by-day using only the attempts
 * that existed at the end of each day, so learners can see whether their
 * readiness is trending up, flat, or decaying.
 */

import {
  computeReadiness,
  type ReadinessAttemptRow,
  type ReadinessDomainRow,
  type ReadinessMasteryRow,
  type ReadinessQuestionRow,
} from "./readiness";

export type ReadinessTrendPoint = {
  /** YYYY-MM-DD (UTC day boundary). */
  date: string;
  score: number;
  mastery: number;
  coverage: number;
  recency: number;
  /** Cumulative attempts recorded up to and including this day. */
  attempts: number;
};

/** Rebuild approximate FSRS-ish mastery state from raw attempt history. */
function masteryFromAttempts(attempts: ReadinessAttemptRow[]): ReadinessMasteryRow[] {
  const byQuestion = new Map<
    string,
    { reps: number; lapses: number; streak: number; lastCorrect: boolean; lastAt: string }
  >();
  // Oldest → newest so the running streak is meaningful.
  const ordered = [...attempts].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const a of ordered) {
    const row =
      byQuestion.get(a.question_id) ??
      { reps: 0, lapses: 0, streak: 0, lastCorrect: false, lastAt: a.created_at };
    row.reps += 1;
    if (a.is_correct) row.streak += 1;
    else {
      row.streak = 0;
      row.lapses += 1;
    }
    row.lastCorrect = a.is_correct;
    row.lastAt = a.created_at;
    byQuestion.set(a.question_id, row);
  }

  return [...byQuestion.entries()].map(([question_id, r]) => ({
    question_id,
    status: r.streak >= 3 ? "mastered" : r.lapses > 0 && !r.lastCorrect ? "lapsed" : "learning",
    stability: Math.min(30, r.streak * 8),
    reps: r.reps,
    lapses: r.lapses,
    last_attempt_at: r.lastAt,
    last_attempt_correct: r.lastCorrect,
  }));
}

export function computeReadinessTrend(input: {
  domains: ReadinessDomainRow[];
  questions: ReadinessQuestionRow[];
  attempts: ReadinessAttemptRow[];
  days?: number;
  now?: Date;
}): ReadinessTrendPoint[] {
  const days = Math.max(2, Math.min(180, input.days ?? 30));
  const now = input.now ?? new Date();
  const attempts = [...input.attempts].sort((a, b) => a.created_at.localeCompare(b.created_at));

  const points: ReadinessTrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - i);
    cutoff.setHours(23, 59, 59, 999);
    const cutoffMs = Math.min(cutoff.getTime(), now.getTime());
    const upTo = attempts.filter((a) => new Date(a.created_at).getTime() <= cutoffMs);

    const report = computeReadiness({
      domains: input.domains,
      questions: input.questions,
      mastery: masteryFromAttempts(upTo),
      attempts: upTo,
      now: new Date(cutoffMs),
    });

    points.push({
      date: new Date(cutoffMs).toISOString().slice(0, 10),
      score: report.score,
      mastery: report.mastery,
      coverage: report.coverage,
      recency: report.recency,
      attempts: upTo.length,
    });
  }
  return points;
}
