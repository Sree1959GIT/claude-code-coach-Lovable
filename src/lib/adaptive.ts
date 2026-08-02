import { supabase } from "@/integrations/supabase/client";
import type { QuestionWithOptions } from "./study";
import type { MasteryState } from "./fsrs";


export type StudyMode = "adaptive" | "weak" | "exam";

export type QuestionPool = {
  dueNow: QuestionWithOptions[];
  newItems: QuestionWithOptions[];
  lapsed: QuestionWithOptions[];
  mastered: QuestionWithOptions[];
};

export function splitPool(
  questions: QuestionWithOptions[],
  masteryByQuestion: Map<string, MasteryState>,
): QuestionPool {
  const dueNow: QuestionWithOptions[] = [];
  const newItems: QuestionWithOptions[] = [];
  const lapsed: QuestionWithOptions[] = [];
  const mastered: QuestionWithOptions[] = [];

  for (const q of questions) {
    const state = masteryByQuestion.get(q.id);
    if (!state) {
      newItems.push(q);
    } else if (state.status === "lapsed" || state.lastAttemptCorrect === false) {
      lapsed.push(q);
    } else if (state.status === "mastered" || state.status === "review") {
      if (state.dueAt.getTime() <= Date.now()) {
        dueNow.push(q);
      } else {
        mastered.push(q);
      }
    } else {
      newItems.push(q);
    }
  }

  return { dueNow, newItems, lapsed, mastered };
}

/** Pick the next question in adaptive mode. */
export function nextAdaptive(
  pool: QuestionPool,
  seenInSession: Set<string>,
): QuestionWithOptions | null {
  const candidates = [
    ...pool.dueNow.filter((q) => !seenInSession.has(q.id)),
    ...pool.lapsed.filter((q) => !seenInSession.has(q.id)),
    ...pool.newItems.filter((q) => !seenInSession.has(q.id)),
    ...pool.mastered.filter((q) => !seenInSession.has(q.id)),
  ];
  if (candidates.length === 0) return null;
  return candidates[0];
}

/** Pick the weakest questions first. */
export function nextWeakArea(
  questions: QuestionWithOptions[],
  masteryByQuestion: Map<string, MasteryState>,
  attemptsByQuestion: Map<string, { isCorrect: boolean; timeMs: number }[]>,
  seenInSession: Set<string>,
): QuestionWithOptions | null {
  const scored = questions
    .filter((q) => !seenInSession.has(q.id))
    .map((q) => {
      const state = masteryByQuestion.get(q.id);
      const attempts = attemptsByQuestion.get(q.id) ?? [];
      const correct = attempts.filter((a) => a.isCorrect).length;
      const total = attempts.length;
      const accuracy = total ? correct / total : 0;
      const avgTime = total
        ? attempts.reduce((s, a) => s + a.timeMs, 0) / total
        : 0;
      // Lower score = weaker; prioritize least accurate, then slowest, then most lapsed.
      const score =
        (1 - accuracy) * 1000 + Math.min(avgTime / 1000, 120) + (state?.lapses ?? 0) * 10;
      return { q, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.q ?? null;
}

/** Build a stratified exam sample weighted by domain weight. */
export function buildExamSample(
  questions: QuestionWithOptions[],
  domains: { id: string; weight: number }[],
  targetCount: number,
): QuestionWithOptions[] {
  const byDomain = new Map<string, QuestionWithOptions[]>();
  for (const q of questions) {
    const arr = byDomain.get(q.domain_id) ?? [];
    arr.push(q);
    byDomain.set(q.domain_id, arr);
  }

  const totalWeight = domains.reduce((s, d) => s + Number(d.weight), 0) || 1;
  let remaining = targetCount;
  const picks: QuestionWithOptions[] = [];

  // Allocate per-domain counts proportionally.
  const allocations = domains.map((d) => {
    const count = Math.max(1, Math.round((Number(d.weight) / totalWeight) * targetCount));
    return { domainId: d.id, count };
  });

  for (const { domainId, count } of allocations) {
    const pool = byDomain.get(domainId) ?? [];
    const take = Math.min(count, pool.length, remaining);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    picks.push(...shuffled.slice(0, take));
    remaining -= take;
  }

  // Fill any remaining slots from the global pool.
  if (remaining > 0) {
    const used = new Set(picks.map((q) => q.id));
    const rest = questions.filter((q) => !used.has(q.id)).sort(() => Math.random() - 0.5);
    picks.push(...rest.slice(0, remaining));
  }

  return picks.sort(() => Math.random() - 0.5);
}

export function buildMasteryMap(
  rows: {
    question_id: string;
    status: string;
    due_at: string;
    stability: number;
    difficulty: number;
    reps: number;
    lapses: number;
    last_attempt_at?: string | null;
    last_attempt_correct?: boolean | null;
  }[],
): Map<string, MasteryState> {
  const map = new Map<string, MasteryState>();
  for (const r of rows) {
    map.set(r.question_id, {
      status: r.status as MasteryState["status"],
      dueAt: new Date(r.due_at),
      stability: Number(r.stability),
      difficulty: Number(r.difficulty),
      reps: r.reps,
      lapses: r.lapses,
      lastAttemptAt: r.last_attempt_at ? new Date(r.last_attempt_at) : undefined,
      lastAttemptCorrect: r.last_attempt_correct ?? undefined,
    });
  }
  return map;
}

export function buildAttemptsMap(
  attempts: { question_id: string; is_correct: boolean; time_ms: number }[],
): Map<string, { isCorrect: boolean; timeMs: number }[]> {
  const map = new Map<string, { isCorrect: boolean; timeMs: number }[]>();
  for (const a of attempts) {
    const arr = map.get(a.question_id) ?? [];
    arr.push({ isCorrect: a.is_correct, timeMs: a.time_ms });
    map.set(a.question_id, arr);
  }
  return map;
}
