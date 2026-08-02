/**
 * Minimal FSRS-4.5-like scheduler.
 * We intentionally use a simplified, stable subset so we don't need a heavy
 * dependency or complex tuning in the worker runtime.
 *
 * Core idea:
 * - stability = expected interval (in days) at which retrievability is 90%.
 * - retrievability R = exp(-elapsedDays / stability).
 * - Correct answer: increase stability and difficulty.
 * - Incorrect answer: decrease stability and increase difficulty.
 */

export type MasteryStatus =
  | "new"
  | "learning"
  | "review"
  | "mastered"
  | "lapsed";

export type MasteryState = {
  status: MasteryStatus;
  dueAt: Date;
  stability: number; // days
  difficulty: number; // 0..10
  reps: number;
  lapses: number;
  lastAttemptAt?: Date;
  lastAttemptCorrect?: boolean;
};

// Default parameters tuned for a certification-prep cadence.
const DEFAULT_DIFFICULTY = 5.0;
const MIN_STABILITY = 0.05; // ~1 hour minimum review
const MAX_STABILITY = 365 * 2; // cap at 2 years

// FSRS-4.5 approximate weights for a single grade.
const W = {
  initialStability: 0.4,
  initialStabilityEase: 0.9,
  difficultyFactor: 0.2,
  retentionTarget: 0.9,
  hardPenalty: 0.8,
  easyBonus: 1.3,
};

export function initialState(): MasteryState {
  return {
    status: "new",
    dueAt: new Date(),
    stability: 0,
    difficulty: DEFAULT_DIFFICULTY,
    reps: 0,
    lapses: 0,
  };
}

export function scheduleNext(
  previous: MasteryState,
  correct: boolean,
): MasteryState {
  const now = new Date();
  const elapsedDays = previous.lastAttemptAt
    ? Math.max(0, (now.getTime() - previous.lastAttemptAt.getTime()) / 86400000)
    : 0;

  const retrievability = previous.stability > 0
    ? Math.exp(-elapsedDays / previous.stability)
    : 0;

  let nextStability: number;
  let nextDifficulty: number;
  let nextLapses = previous.lapses;
  let nextReps = previous.reps + 1;
  let nextStatus: MasteryStatus;

  if (correct) {
    // FSRS stability update after successful recall
    const hardFactor = retrievability < 0.8 ? W.hardPenalty : 1;
    const quality = retrievability < 0.8 ? 3 : 5; // 3=hard, 5=easy
    const gradeFactor = quality === 5 ? W.easyBonus : 1;
    nextStability =
      previous.stability > 0
        ? previous.stability *
          (1 + W.difficultyFactor * (11 - previous.difficulty) / 10) *
          gradeFactor *
          hardFactor
        : W.initialStability + W.initialStabilityEase;
    nextDifficulty = Math.max(0, Math.min(10, previous.difficulty - 0.3));
    nextStatus = nextStability > 21 ? "mastered" : "review";
  } else {
    // Forgetting: collapse stability, bump difficulty, increment lapses.
    nextStability = Math.max(
      MIN_STABILITY,
      previous.stability * Math.max(0.1, retrievability) * 0.5,
    );
    nextDifficulty = Math.min(10, previous.difficulty + 0.8);
    nextLapses += 1;
    nextStatus = "lapsed";
  }

  nextStability = Math.min(MAX_STABILITY, Math.max(MIN_STABILITY, nextStability));

  // Target 90% retention: interval = -ln(0.9) * stability.
  const intervalDays = -Math.log(1 - W.retentionTarget) * nextStability;
  const dueAt = new Date(now.getTime() + intervalDays * 86400000);

  return {
    status: nextStatus,
    dueAt,
    stability: nextStability,
    difficulty: nextDifficulty,
    reps: nextReps,
    lapses: nextLapses,
    lastAttemptAt: now,
    lastAttemptCorrect: correct,
  };
}

export function isDue(state: MasteryState): boolean {
  return new Date() >= state.dueAt;
}
