/**
 * Stage 7 sub-task 6 — Personalized study plan card.
 * Takes a target exam date (persisted locally) and turns the readiness report
 * into a daily workload with a prioritized domain focus list.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { buildStudyPlan } from "@/lib/study-plan";
import type { ReadinessReport } from "@/lib/readiness";

const STORAGE_KEY = "ccaf.exam_date";

function defaultDate() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

const PACE_LABEL: Record<string, string> = {
  relaxed: "Relaxed pace",
  steady: "Steady pace",
  intense: "Intense pace",
  cram: "Cram mode",
};

export function StudyPlanCard({ readiness }: { readiness: ReadinessReport | undefined }) {
  const [examDate, setExamDate] = useState<string>("");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    setExamDate(stored ?? defaultDate());
  }, []);

  useEffect(() => {
    if (examDate) localStorage.setItem(STORAGE_KEY, examDate);
  }, [examDate]);

  const plan = useMemo(
    () => (readiness && examDate ? buildStudyPlan(readiness, examDate) : null),
    [readiness, examDate],
  );

  return (
    <section className="mb-8 border border-border bg-card p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
          <CalendarClock className="h-4 w-4" /> Study_Plan
        </div>
        <label className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Exam date
          <input
            type="date"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            className="border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
          />
        </label>
      </div>

      {!plan ? (
        <div className="font-mono text-xs text-muted-foreground">
          Set an exam date and practice a session to generate your plan.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Days left" value={String(plan.daysLeft)} />
            <Metric label="Questions / day" value={String(plan.dailyQuestions)} />
            <Metric label="Minutes / day" value={`${plan.dailyMinutes}`} />
            <Metric label="Gap to ready" value={`${plan.gapToTarget} pts`} />
          </div>

          <p
            className={`mt-4 border-l-2 px-3 py-2 text-sm ${
              plan.feasible
                ? "border-primary/50 bg-secondary/30 text-muted-foreground"
                : "border-destructive/60 bg-destructive/10 text-foreground"
            }`}
          >
            {plan.headline}{" "}
            <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
              · {PACE_LABEL[plan.pace]}
            </span>
          </p>

          {plan.tasks.length > 0 && (
            <ul className="mt-4 divide-y divide-border border border-border">
              {plan.tasks.map((t) => (
                <li key={t.domainId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs font-bold uppercase tracking-wide">
                      {t.title}
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {t.reason} · readiness {t.score}
                    </div>
                  </div>
                  <div className="font-mono text-xs tabular-nums">{t.questionsPerDay}/day</div>
                  <Link
                    to="/study/$slug"
                    params={{ slug: t.slug }}
                    className="border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
                  >
                    Drill →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
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
