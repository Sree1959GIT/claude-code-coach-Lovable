/**
 * Stage 7 sub-task 7 — Daily goal + streak card.
 * Goal defaults to the study plan's questions/day and can be overridden locally.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Flame } from "lucide-react";
import { getActivityTimestamps } from "@/lib/streaks.functions";
import { computeStreaks } from "@/lib/streaks";

const GOAL_KEY = "ccaf.daily_goal";

export function DailyGoalCard({ suggestedGoal }: { suggestedGoal: number }) {
  const [goal, setGoal] = useState<number | null>(null);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(GOAL_KEY) : null;
    setGoal(stored ? Number(stored) : null);
  }, []);

  const effectiveGoal = goal ?? Math.max(5, suggestedGoal || 10);

  const fetchActivity = useServerFn(getActivityTimestamps);
  const activityQ = useQuery({ queryKey: ["activity"], queryFn: () => fetchActivity() });

  const summary = useMemo(
    () => computeStreaks(activityQ.data ?? [], effectiveGoal),
    [activityQ.data, effectiveGoal],
  );

  const pct = Math.min(100, Math.round((summary.todayCount / summary.goal) * 100));

  return (
    <section className="mb-8 border border-border bg-card p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
          <Flame className="h-4 w-4" /> Daily_Goal
        </div>
        <label className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Goal / day
          <input
            type="number"
            min={1}
            max={200}
            value={effectiveGoal}
            onChange={(e) => {
              const v = Math.max(1, Math.min(200, Number(e.target.value) || 1));
              setGoal(v);
              localStorage.setItem(GOAL_KEY, String(v));
            }}
            className="w-16 border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Today" value={`${summary.todayCount}/${summary.goal}`} />
        <Metric label="Current streak" value={`${summary.currentStreak}d`} />
        <Metric label="Longest streak" value={`${summary.longestStreak}d`} />
        <Metric label="Last 7 days" value={String(summary.weekTotal)} />
      </div>

      <div className="mt-4 h-2 w-full bg-muted">
        <div className="h-2 bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {activityQ.isLoading
          ? "Loading your activity…"
          : summary.goalMet
            ? `Goal hit for today — streak at ${summary.currentStreak} day${summary.currentStreak === 1 ? "" : "s"}.`
            : `${summary.remaining} more question${summary.remaining === 1 ? "" : "s"} to keep the streak alive.`}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          to="/study"
          className="border border-primary px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          Practice now →
        </Link>
        <div className="flex flex-wrap gap-1">
          {summary.history.slice(-21).map((d) => (
            <span
              key={d.date}
              title={`${d.date}: ${d.count} answered`}
              className={`h-3.5 w-3.5 border border-border ${
                d.goalMet ? "bg-primary" : d.count > 0 ? "bg-primary/40" : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="border border-border p-3">
      <div className="font-mono text-2xl font-bold tabular-nums">{props.value}</div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {props.label}
      </div>
    </div>
  );
}
