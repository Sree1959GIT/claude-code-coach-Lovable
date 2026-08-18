/**
 * Stage 7 sub-task 6 — Personalized study plan.
 *
 * Pure functions: turn a readiness report plus a target exam date into a
 * day-by-day workload (questions/day) and a prioritized domain focus order.
 */

import type { DomainReadiness, ReadinessReport } from "./readiness";

export type PlanTask = {
  domainId: string;
  slug: string;
  title: string;
  /** Questions to attempt in this domain per study day. */
  questionsPerDay: number;
  /** Why this domain is prioritized. */
  reason: string;
  score: number;
  weight: number;
};

export type StudyPlan = {
  daysLeft: number;
  /** Readiness points still needed to reach the exam-ready band (80). */
  gapToTarget: number;
  /** Recommended total questions per day across all domains. */
  dailyQuestions: number;
  /** Estimated minutes per day at ~75s per question. */
  dailyMinutes: number;
  /** Whether the remaining time is enough for the recommended load. */
  feasible: boolean;
  pace: "relaxed" | "steady" | "intense" | "cram";
  tasks: PlanTask[];
  /** One-line coaching summary. */
  headline: string;
};

export const READY_TARGET = 80;
const SECONDS_PER_QUESTION = 75;
const MAX_DAILY_QUESTIONS = 60;
const MIN_DAILY_QUESTIONS = 5;

export function daysUntil(examDate: string, now = new Date()): number {
  const target = new Date(`${examDate}T00:00:00`).getTime();
  if (Number.isNaN(target)) return 0;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((target - start.getTime()) / 86_400_000));
}

function paceFor(dailyQuestions: number): StudyPlan["pace"] {
  if (dailyQuestions <= 10) return "relaxed";
  if (dailyQuestions <= 25) return "steady";
  if (dailyQuestions <= 45) return "intense";
  return "cram";
}

function reasonFor(d: DomainReadiness): string {
  if (d.coverage < 40) return `Only ${d.coverage}% of this bank has been touched`;
  if (d.recency < 40) return "Practice here has gone stale";
  if (d.accuracy !== null && d.accuracy < 60) return `Accuracy sitting at ${d.accuracy}%`;
  return "Reinforce to lock in retention";
}

export function buildStudyPlan(
  readiness: ReadinessReport,
  examDate: string,
  now = new Date(),
): StudyPlan {
  const daysLeft = daysUntil(examDate, now);
  const effectiveDays = Math.max(1, daysLeft);
  const gapToTarget = Math.max(0, READY_TARGET - readiness.score);

  // Untouched items are the main driver of remaining work; add a review pass
  // over weak items so the load reflects re-practice, not just first exposure.
  const untouched = Math.max(0, readiness.totalQuestions - readiness.attemptedQuestions);
  const reviewLoad = Math.round((readiness.attemptedQuestions * gapToTarget) / 100);
  const totalWork = untouched + reviewLoad;

  const raw = Math.ceil(totalWork / effectiveDays);
  const dailyQuestions = Math.min(
    MAX_DAILY_QUESTIONS,
    Math.max(gapToTarget === 0 && untouched === 0 ? 0 : MIN_DAILY_QUESTIONS, raw),
  );
  const dailyMinutes = Math.round((dailyQuestions * SECONDS_PER_QUESTION) / 60);
  const feasible = dailyQuestions < MAX_DAILY_QUESTIONS || totalWork <= MAX_DAILY_QUESTIONS * effectiveDays;

  // Allocate the daily load across the weakest, most heavily weighted domains.
  const focus = [...readiness.gaps]
    .filter((d) => d.questionCount > 0)
    .slice(0, 4);
  const priorities = focus.map((d) => (100 - d.score) * (0.5 + d.weight));
  const totalPriority = priorities.reduce((a, b) => a + b, 0) || 1;

  const tasks: PlanTask[] = focus.map((d, i) => ({
    domainId: d.domainId,
    slug: d.slug,
    title: d.title,
    questionsPerDay: Math.max(
      1,
      Math.round((dailyQuestions * (priorities[i] ?? 0)) / totalPriority),
    ),
    reason: reasonFor(d),
    score: d.score,
    weight: d.weight,
  }));

  const headline =
    daysLeft === 0
      ? "Exam day — do a light review pass and rest."
      : gapToTarget === 0
        ? `You're exam-ready. Hold the line with ${dailyQuestions} questions/day for ${daysLeft} days.`
        : feasible
          ? `Close a ${gapToTarget}-point gap in ${daysLeft} days: ${dailyQuestions} questions/day (~${dailyMinutes} min).`
          : `${daysLeft} days is tight for the remaining work — prioritize the top domains below or push the exam date.`;

  return {
    daysLeft,
    gapToTarget,
    dailyQuestions,
    dailyMinutes,
    feasible,
    pace: paceFor(dailyQuestions),
    tasks,
    headline,
  };
}
