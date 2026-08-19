/**
 * Stage 7 sub-task 7 — Daily goals & streaks.
 *
 * Pure helpers: turn raw attempt timestamps into per-day counts, a current /
 * longest streak against a daily question goal, and a short activity history.
 */

export type DayActivity = {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  count: number;
  goalMet: boolean;
};

export type StreakSummary = {
  goal: number;
  todayCount: number;
  goalMet: boolean;
  /** Questions still needed today to hit the goal. */
  remaining: number;
  /** Consecutive days (ending today or yesterday) where the goal was met. */
  currentStreak: number;
  longestStreak: number;
  /** Total answered in the trailing 7 days (including today). */
  weekTotal: number;
  /** Most recent days, oldest → newest. */
  history: DayActivity[];
};

export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

export function computeStreaks(
  timestamps: string[],
  goal: number,
  days = 28,
  now = new Date(),
): StreakSummary {
  const safeGoal = Math.max(1, Math.round(goal || 1));
  const counts = new Map<string, number>();
  for (const ts of timestamps) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) continue;
    const key = localDateKey(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const history: DayActivity[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = localDateKey(addDays(today, -i));
    const count = counts.get(key) ?? 0;
    history.push({ date: key, count, goalMet: count >= safeGoal });
  }

  const todayCount = counts.get(localDateKey(today)) ?? 0;

  // Current streak: walk back from today; today not yet met doesn't break it.
  let currentStreak = 0;
  for (let i = todayCount >= safeGoal ? 0 : 1; i < 400; i++) {
    const count = counts.get(localDateKey(addDays(today, -i))) ?? 0;
    if (count >= safeGoal) currentStreak++;
    else break;
  }

  // Longest streak across all recorded days.
  const metDays = [...counts.entries()]
    .filter(([, c]) => c >= safeGoal)
    .map(([k]) => k)
    .sort();
  let longestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of metDays) {
    if (prev && localDateKey(addDays(new Date(`${prev}T00:00:00`), 1)) === key) run++;
    else run = 1;
    longestStreak = Math.max(longestStreak, run);
    prev = key;
  }
  longestStreak = Math.max(longestStreak, currentStreak);

  const weekTotal = history.slice(-7).reduce((a, d) => a + d.count, 0);

  return {
    goal: safeGoal,
    todayCount,
    goalMet: todayCount >= safeGoal,
    remaining: Math.max(0, safeGoal - todayCount),
    currentStreak,
    longestStreak,
    weekTotal,
    history,
  };
}
