/**
 * Phase E9 — active question context profile + FSRS metrics for the Study
 * Canvas. Ties a cached code example to the question the learner is on and to
 * their spaced-repetition state for that question.
 */

import { supabase } from "@/integrations/supabase/client";

export type CanvasQuestionContext = {
  questionId: string;
  domain: string | null;
  keyConcept: string | null;
  conceptTag: string | null;
  difficulty: string | null;
  index: number;
  total: number;
  selectedOption: string | null;
  revealed: boolean;
};

export type CanvasFsrs = {
  status: string;
  dueAt: Date | null;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastAttemptCorrect: boolean | null;
};

/** Retrievability R = exp(-elapsedDays / stability), 0..1. */
export function retrievability(fsrs: CanvasFsrs, now = Date.now()): number | null {
  if (fsrs.stability <= 0 || !fsrs.dueAt) return null;
  // Derive last review from due date and the 90%-retention interval.
  const intervalMs = -Math.log(0.1) * fsrs.stability * 86400000;
  const lastReview = fsrs.dueAt.getTime() - intervalMs;
  const elapsedDays = Math.max(0, (now - lastReview) / 86400000);
  return Math.exp(-elapsedDays / fsrs.stability);
}

export function formatDue(dueAt: Date | null): string {
  if (!dueAt) return "—";
  const diffMs = dueAt.getTime() - Date.now();
  const days = Math.round(Math.abs(diffMs) / 86400000);
  if (diffMs <= 0) return "Due_Now";
  if (days < 1) return "Today";
  return `${days}d`;
}

/** Owner-scoped read of the learner's FSRS state for one question. */
export async function fetchQuestionMastery(
  questionId: string,
): Promise<CanvasFsrs | null> {
  const { data, error } = await supabase
    .from("user_mastery")
    .select(
      "status, due_at, stability, difficulty, reps, lapses, last_attempt_correct",
    )
    .eq("question_id", questionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    status: data.status,
    dueAt: data.due_at ? new Date(data.due_at) : null,
    stability: Number(data.stability),
    difficulty: Number(data.difficulty),
    reps: data.reps,
    lapses: data.lapses,
    lastAttemptCorrect: data.last_attempt_correct ?? null,
  };
}
