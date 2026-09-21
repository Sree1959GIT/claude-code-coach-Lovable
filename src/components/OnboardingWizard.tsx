/**
 * Phase H5 — first-run onboarding wizard.
 * Collects target exam date, target score band, weekly study hours and
 * self-assessed domain confidence, then initializes the baseline study plan
 * and readiness forecast for a fresh candidate.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Gauge, Rocket, Target, Timer } from "lucide-react";
import { toast } from "sonner";
import { getOnboarding, saveOnboarding } from "@/lib/onboarding.functions";
import { setDomainConfidence } from "@/lib/confidence.functions";
import { buildStudyPlan } from "@/lib/study-plan";
import { READINESS_BAND_LABEL, type ReadinessReport } from "@/lib/readiness";
import { logEvent } from "@/lib/analytics";

const EXAM_DATE_KEY = "ccaf.exam_date";
const GOAL_KEY = "ccaf.daily_goal";
const SCORE_BANDS = [70, 80, 90];
const HOUR_OPTIONS = [3, 6, 10, 15, 20];
const SCALE = [1, 2, 3, 4, 5];
const SCALE_LABEL: Record<number, string> = {
  1: "Lost",
  2: "Shaky",
  3: "OK",
  4: "Solid",
  5: "Confident",
};

function defaultExamDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 42);
  return d.toISOString().slice(0, 10);
}

/** Questions/day implied by a weekly hour commitment at ~75s per question. */
export function dailyQuestionsFromHours(weeklyHours: number): number {
  return Math.max(3, Math.round((weeklyHours * 3600) / 7 / 75));
}

export function OnboardingWizard({ readiness }: { readiness?: ReadinessReport }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getOnboarding);
  const saveFn = useServerFn(saveOnboarding);
  const confFn = useServerFn(setDomainConfidence);

  const prefsQ = useQuery({ queryKey: ["onboarding"], queryFn: () => getFn() });

  const [step, setStep] = useState(0);
  const [examDate, setExamDate] = useState(defaultExamDate);
  const [targetScore, setTargetScore] = useState(80);
  const [weeklyHours, setWeeklyHours] = useState(6);
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [dismissed, setDismissed] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const open =
    !dismissed && prefsQ.isSuccess && !prefsQ.data.onboardedAt;

  useEffect(() => {
    if (open) {
      logEvent("onboarding_started");
      headingRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const dailyQuestions = dailyQuestionsFromHours(weeklyHours);
  const forecast = useMemo(
    () => (readiness ? buildStudyPlan(readiness, examDate) : null),
    [readiness, examDate],
  );

  const finish = useMutation({
    mutationFn: async () => {
      await saveFn({ data: { examDate, targetScore, weeklyHours, complete: true } });
      const entries = Object.entries(confidence);
      for (const [domainId, rating] of entries) {
        await confFn({ data: { domainId, rating } });
      }
    },
    onSuccess: async () => {
      localStorage.setItem(EXAM_DATE_KEY, examDate);
      localStorage.setItem(GOAL_KEY, String(dailyQuestions));
      await logEvent("onboarding_completed", { targetScore, weeklyHours });
      toast.success("Your study plan is ready");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["onboarding"] }),
        qc.invalidateQueries({ queryKey: ["readiness"] }),
        qc.invalidateQueries({ queryKey: ["domain-confidence"] }),
        qc.invalidateQueries({ queryKey: ["mastery"] }),
      ]);
      setDismissed(true);
    },
    onError: () => toast.error("Could not save your setup. Please try again."),
  });

  if (!open) return null;

  const steps = ["Exam date", "Target score", "Weekly hours", "Confidence", "Plan"];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="w-full max-w-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-1 font-mono text-xs uppercase tracking-[0.3em] text-primary">
          {"> Candidate setup"} · Step {step + 1}/{steps.length}
        </div>
        <h2
          id="onboarding-title"
          ref={headingRef}
          tabIndex={-1}
          className="font-mono text-2xl font-bold uppercase tracking-tight outline-none"
        >
          {steps[step]}
        </h2>

        <div className="mt-4 flex gap-1" aria-hidden>
          {steps.map((s, i) => (
            <span
              key={s}
              className={`h-1 flex-1 ${i <= step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>

        <div className="mt-6 min-h-[200px]">
          {step === 0 && (
            <div>
              <Legend icon={<CalendarClock className="h-4 w-4" />}>
                When do you plan to sit the exam?
              </Legend>
              <input
                type="date"
                value={examDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-primary"
                aria-label="Target exam date"
              />
              <p className="mt-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                You can change this any time from your dashboard.
              </p>
            </div>
          )}

          {step === 1 && (
            <div>
              <Legend icon={<Target className="h-4 w-4" />}>
                What score band are you aiming for?
              </Legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {SCORE_BANDS.map((s) => (
                  <Choice
                    key={s}
                    active={targetScore === s}
                    onClick={() => setTargetScore(s)}
                    label={`${s}%+`}
                    hint={s === 70 ? "Pass safely" : s === 80 ? "Comfortable" : "Top band"}
                  />
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <Legend icon={<Timer className="h-4 w-4" />}>
                How many hours a week can you study?
              </Legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {HOUR_OPTIONS.map((h) => (
                  <Choice
                    key={h}
                    active={weeklyHours === h}
                    onClick={() => setWeeklyHours(h)}
                    label={`${h}h`}
                    hint={`${dailyQuestionsFromHours(h)}/day`}
                  />
                ))}
              </div>
              <p className="mt-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Daily target: {dailyQuestions} questions
              </p>
            </div>
          )}

          {step === 3 && (
            <div>
              <Legend icon={<Gauge className="h-4 w-4" />}>
                Rate how confident you feel in each area.
              </Legend>
              {!readiness ? (
                <p className="font-mono text-xs text-muted-foreground">Loading domains…</p>
              ) : (
                <div className="space-y-3">
                  {readiness.domains.map((d) => (
                    <div
                      key={d.domainId}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="min-w-0 text-sm">{d.title}</div>
                      <div
                        className="flex items-center gap-1"
                        role="group"
                        aria-label={`Confidence for ${d.title}`}
                      >
                        {SCALE.map((n) => (
                          <button
                            key={n}
                            type="button"
                            aria-label={`${d.title}: ${SCALE_LABEL[n]}`}
                            aria-pressed={confidence[d.domainId] === n}
                            onClick={() =>
                              setConfidence((c) => ({ ...c, [d.domainId]: n }))
                            }
                            className={`h-8 w-8 border font-mono text-xs transition-colors ${
                              confidence[d.domainId] === n
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div>
              <Legend icon={<Rocket className="h-4 w-4" />}>Your starting plan</Legend>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Fact label="Exam date" value={examDate} />
                <Fact label="Target score" value={`${targetScore}%`} />
                <Fact label="Weekly commitment" value={`${weeklyHours} hours`} />
                <Fact label="Daily target" value={`${dailyQuestions} questions`} />
                {forecast ? (
                  <>
                    <Fact label="Days left" value={String(forecast.daysLeft)} />
                    <Fact label="Pace" value={forecast.pace} />
                  </>
                ) : null}
                {readiness ? (
                  <Fact
                    label="Readiness now"
                    value={`${readiness.score} · ${READINESS_BAND_LABEL[readiness.band]}`}
                  />
                ) : null}
              </dl>
              {forecast ? (
                <p className="mt-4 text-sm text-muted-foreground">{forecast.headline}</p>
              ) : null}
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => (step === 0 ? setDismissed(true) : setStep(step - 1))}
            className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            {step === 0 ? "Skip for now" : "← Back"}
          </button>
          {step < steps.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="bg-primary px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-primary-foreground"
            >
              Continue →
            </button>
          ) : (
            <button
              type="button"
              disabled={finish.isPending}
              onClick={() => finish.mutate()}
              className="bg-primary px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-60"
            >
              {finish.isPending ? "Saving..." : "Start studying"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Legend({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-primary">
      {icon} {children}
    </div>
  );
}

function Choice(props: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
      className={`border p-4 text-left transition-colors ${
        props.active
          ? "border-primary bg-primary/10"
          : "border-border hover:border-primary"
      }`}
    >
      <div className="font-mono text-lg font-bold">{props.label}</div>
      <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {props.hint}
      </div>
    </button>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border p-3">
      <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-sm">{value}</dd>
    </div>
  );
}
