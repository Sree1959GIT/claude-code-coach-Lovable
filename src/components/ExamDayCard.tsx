/**
 * Stage 7 sub-task 11 — Exam-day checklist card.
 * Countdown to the stored exam date, a readiness gate, and a persisted
 * pre-exam environment/ID checklist.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarCheck, CheckSquare, ExternalLink, Square } from "lucide-react";
import type { ReadinessReport } from "@/lib/readiness";
import { READY_TARGET } from "@/lib/study-plan";

const EXAM_DATE_KEY = "ccaf.exam_date";
const CHECKLIST_KEY = "ccaf.exam_checklist";
const BOOKING_URL = "https://www.anthropic.com/certification";

type ChecklistItem = { id: string; label: string; hint: string };

const CHECKLIST: ChecklistItem[] = [
  { id: "booked", label: "Exam booked & confirmation email saved", hint: "Check the date, time zone and delivery mode." },
  { id: "id", label: "Government photo ID ready", hint: "Name must match the registration exactly." },
  { id: "room", label: "Quiet room, desk cleared", hint: "No notes, phones, second monitors or smart devices." },
  { id: "tech", label: "Tech check done", hint: "Webcam, mic, stable connection, browser/proctor app updated." },
  { id: "power", label: "Power & battery secured", hint: "Plug in the laptop; disable sleep and OS updates." },
  { id: "warmup", label: "Warm-up session completed", hint: "A short adaptive review the morning of the exam." },
  { id: "blueprint", label: "Blueprint skimmed one last time", hint: "Domain weights and key concepts, not new material." },
  { id: "logistics", label: "Arrival / login time planned", hint: "Be ready 20–30 minutes early." },
];

function daysBetween(target: string): number | null {
  if (!target) return null;
  const t = new Date(`${target}T00:00:00`);
  if (Number.isNaN(t.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((t.getTime() - today.getTime()) / 86_400_000);
}

export function ExamDayCard({ readiness }: { readiness: ReadinessReport | undefined }) {
  const [examDate, setExamDate] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    setExamDate(localStorage.getItem(EXAM_DATE_KEY) ?? "");
    try {
      setChecked(JSON.parse(localStorage.getItem(CHECKLIST_KEY) ?? "{}"));
    } catch {
      setChecked({});
    }
  }, []);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(CHECKLIST_KEY, JSON.stringify(next));
      return next;
    });
  };

  const daysLeft = useMemo(() => daysBetween(examDate), [examDate]);
  const doneCount = CHECKLIST.filter((c) => checked[c.id]).length;
  const pct = Math.round((doneCount / CHECKLIST.length) * 100);

  const score = readiness?.score ?? 0;
  const gateOk = score >= READY_TARGET;
  const gateLabel = !readiness
    ? "No readiness signal yet — run a session."
    : gateOk
      ? `Readiness ${score} — cleared for exam day.`
      : `Readiness ${score} — ${READY_TARGET - score} points below the recommended ${READY_TARGET}.`;

  return (
    <section className="mb-8 border border-border bg-card p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
          <CalendarCheck className="h-4 w-4" /> Exam_Day
        </div>
        <a
          href={BOOKING_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="ml-auto inline-flex items-center gap-1 border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          Booking_Page <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <div>
          <div className="font-mono text-5xl font-bold tabular-nums">
            {daysLeft === null ? "—" : daysLeft < 0 ? "past" : daysLeft}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-primary">
            {daysLeft === null
              ? "Set an exam date"
              : daysLeft < 0
                ? "Exam date passed"
                : daysLeft === 0
                  ? "Exam is today"
                  : "Days remaining"}
          </div>
          <div
            className={`mt-4 border px-3 py-2 font-mono text-[10px] uppercase tracking-widest ${
              gateOk ? "border-primary text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {gateLabel}
          </div>
          {!gateOk && readiness ? (
            <Link
              to="/study"
              className="mt-3 inline-block border border-primary px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              Close the gap →
            </Link>
          ) : null}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>Pre-exam checklist</span>
            <span className="tabular-nums">
              {doneCount}/{CHECKLIST.length}
            </span>
          </div>
          <div className="mb-4 h-2 w-full bg-muted">
            <div className="h-2 bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {CHECKLIST.map((item) => {
              const on = !!checked[item.id];
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggle(item.id)}
                    aria-pressed={on}
                    className={`flex w-full items-start gap-2 border p-3 text-left transition-colors ${
                      on ? "border-primary/60 bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                  >
                    {on ? (
                      <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <Square className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span>
                      <span
                        className={`block font-mono text-xs uppercase tracking-wide ${
                          on ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {item.label}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">{item.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
