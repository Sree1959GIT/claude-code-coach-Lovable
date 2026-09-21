import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, Clock, Dumbbell, LayoutGrid, Target, TrendingUp } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useSession } from "@/hooks/useSession";
import { logEvent } from "@/lib/analytics";
import { useServerFn } from "@tanstack/react-start";
import { getMasteryOverview } from "@/lib/study.functions";
import { getReadiness } from "@/lib/readiness.functions";
import { READINESS_BAND_LABEL } from "@/lib/readiness";
import { StudyPlanCard } from "@/components/StudyPlanCard";
import { DailyGoalCard } from "@/components/DailyGoalCard";
import { ExamDayCard } from "@/components/ExamDayCard";
import { ConfidenceCard } from "@/components/ConfidenceCard";
import { buildStudyPlan } from "@/lib/study-plan";
import { createSeo, DEFAULT_SHARE_IMAGE } from "@/lib/seo";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import {
  InlineError,
  PageSkeleton,
  SkeletonBar,
  SkeletonCards,
  SkeletonLines,
  routeErrorComponent,
} from "@/components/Resilience";


export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  pendingComponent: () => <PageSkeleton label="Loading dashboard" />,
  errorComponent: routeErrorComponent,
  head: () => createSeo({
    title: "Dashboard · Claude Architect Prep",
    description: "Track readiness, mastery, daily goals, weak domains, and your Claude Certified Architect Foundations study plan.",
    path: "/dashboard",
    noIndex: true,
    image: DEFAULT_SHARE_IMAGE,
  }),
});

function Dashboard() {
  const { user } = useSession();
  useEffect(() => {
    logEvent("page_view", { page: "dashboard" });
  }, []);

  const getMasteryFn = useServerFn(getMasteryOverview);
  const masteryQ = useQuery({
    queryKey: ["mastery"],
    queryFn: () => getMasteryFn(),
  });

  const name = user?.user_metadata?.full_name ?? user?.email ?? "Architect";
  const mastery = masteryQ.data ?? [];
  const due = mastery.filter((m) => m.due_at && new Date(m.due_at) <= new Date()).length;
  const mastered = mastery.filter((m) => m.status === "mastered").length;
  const lapsed = mastery.filter((m) => m.status === "lapsed").length;
  const total = mastery.length;

  const getReadinessFn = useServerFn(getReadiness);
  const readinessQ = useQuery({ queryKey: ["readiness"], queryFn: () => getReadinessFn() });
  const readiness = readinessQ.data;

  const [examDate, setExamDate] = useState<string>("");
  useEffect(() => {
    const sync = () => setExamDate(localStorage.getItem("ccaf.exam_date") ?? "");
    sync();
    const id = window.setInterval(sync, 1000);
    return () => window.clearInterval(id);
  }, []);
  const suggestedGoal = useMemo(
    () => (readiness && examDate ? buildStudyPlan(readiness, examDate).dailyQuestions : 10),
    [readiness, examDate],
  );


  // S7 — one clear next action, and a real first task for a brand-new learner.
  const firstGap = readiness?.gaps?.[0];
  const todayTask =
    due > 0
      ? {
          title: `${due} review${due === 1 ? "" : "s"} due today`,
          detail: "Clear what is due before it lapses — this is what keeps your recall steady.",
          cta: "Start today's session",
          to: "/study" as const,
          params: undefined,
        }
      : total === 0
        ? {
            title: "Start with a short warm-up",
            detail:
              "Answer your first ten questions. That is all it takes to produce a readiness score and a study plan built around your weak spots.",
            cta: "Answer your first questions",
            to: "/study" as const,
            params: undefined,
          }
        : firstGap
          ? {
              title: `Drill ${firstGap.title}`,
              detail: "Your weakest domain right now. A focused set here moves your readiness the most.",
              cta: `Practise ${firstGap.title}`,
              to: "/study/$slug" as const,
              params: { slug: firstGap.slug },
            }
          : {
              title: "Nothing is due — take a timed run",
              detail: "Reviews are clear. A full mock exam is the best use of today.",
              cta: "Start a mock exam",
              to: "/mock-exam" as const,
              params: undefined,
            };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <OnboardingWizard readiness={readiness} />
      <main className="mx-auto max-w-7xl px-6 py-24">
        {/* S7 — the day's task leads, with exactly one primary action. */}
        <section className="mb-8 rounded-md border border-border bg-card p-6">
          <div className="text-sm text-muted-foreground">Welcome back, {name}</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{todayTask.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{todayTask.detail}</p>
          <Link
            to={todayTask.to}
            params={todayTask.params as never}
            className="mt-5 inline-flex touch-target items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {todayTask.cta}
          </Link>
        </section>

        {/* Quick stats */}
        {masteryQ.isLoading ? (
          <SkeletonCards className="mb-8 grid-cols-2 md:grid-cols-4" />
        ) : masteryQ.isError ? (
          <InlineError
            title="Couldn't load your progress"
            error={masteryQ.error}
            onRetry={() => void masteryQ.refetch()}
            retrying={masteryQ.isFetching}
          />
        ) : (
          <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatBox label="Due Now" value={due} icon={<Clock className="h-4 w-4" />} />
            <StatBox label="Mastered" value={mastered} icon={<TrendingUp className="h-4 w-4" />} />
            <StatBox label="Lapsed" value={lapsed} icon={<Dumbbell className="h-4 w-4" />} />
            <StatBox label="Total Cards" value={total} icon={<LayoutGrid className="h-4 w-4" />} />
          </div>
        )}

        {/* Exam readiness */}
        <section className="mb-8 border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.3em] text-primary">
            <Target className="h-4 w-4" /> Exam readiness
          </div>
          {readinessQ.isLoading ? (
            <div className="grid gap-6 md:grid-cols-[220px_1fr]">
              <div>
                <SkeletonBar className="h-10 w-28" />
                <SkeletonBar className="mt-3 h-2 w-40" />
                <SkeletonBar className="mt-4 h-2 w-full" />
              </div>
              <SkeletonLines lines={4} />
            </div>
          ) : readinessQ.isError ? (
            <InlineError
              title="Readiness unavailable"
              error={readinessQ.error}
              onRetry={() => void readinessQ.refetch()}
              retrying={readinessQ.isFetching}
            />
          ) : !readiness ? (
            <div className="text-sm text-muted-foreground">
              No readiness score yet. Answer your first questions and this fills in straight away.
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-[220px_1fr]">
              <div>
                <div className="font-mono text-5xl font-bold tabular-nums">{readiness.score}</div>
                <div className="mt-1 font-mono text-xs uppercase tracking-widest text-primary">
                  {READINESS_BAND_LABEL[readiness.band]}
                </div>
                <div className="mt-4 h-2 w-full bg-muted">
                  <div
                    className="h-2 bg-primary transition-all"
                    style={{ width: `${readiness.score}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  <div>
                    Mastery
                    <div className="text-sm text-foreground">{readiness.mastery}</div>
                  </div>
                  <div>
                    Coverage
                    <div className="text-sm text-foreground">{readiness.coverage}</div>
                  </div>
                  <div>
                    Recency
                    <div className="text-sm text-foreground">{readiness.recency}</div>
                  </div>
                </div>
              </div>
              <div>
                <div className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  Weakest domains ({readiness.attemptedQuestions}/{readiness.totalQuestions} items
                  touched)
                </div>
                <ul className="space-y-2">
                  {readiness.gaps.slice(0, 4).map((g) => (
                    <li key={g.domainId} className="flex items-center gap-3">
                      <span className="w-40 truncate font-mono text-xs uppercase tracking-wide">
                        {g.title}
                      </span>
                      <span className="h-1.5 flex-1 bg-muted">
                        <span
                          className="block h-1.5 bg-primary"
                          style={{ width: `${g.score}%` }}
                        />
                      </span>
                      <span className="w-10 text-right font-mono text-xs tabular-nums">
                        {g.score}
                      </span>
                    </li>
                  ))}
                </ul>
                {readiness.gaps[0] ? (
                  <Link
                    to="/study/$slug"
                    params={{ slug: readiness.gaps[0].slug }}
                    className="mt-4 inline-block border border-primary px-3 py-2 font-mono text-xs font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    Drill {readiness.gaps[0].title} →
                  </Link>
                ) : null}
              </div>
            </div>
          )}
        </section>

        <StudyPlanCard readiness={readiness} />

        <DailyGoalCard suggestedGoal={suggestedGoal} />

        <ExamDayCard readiness={readiness} />

        <ConfidenceCard readiness={readiness} />


        <div className="grid gap-4 md:grid-cols-3">
          <Link
            to="/study"
            className="group flex flex-col justify-between border border-border bg-card p-8 transition-colors hover:border-primary"
          >
            <div>
              <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-primary">
                <Brain className="h-4 w-4" /> Study hub
              </div>
              <h2 className="mb-3 font-mono text-xl font-bold uppercase tracking-tight">
                Adaptive Practice
              </h2>
              <p className="text-sm text-muted-foreground">
                Adaptive reviews, weak-area drills, and timed exams.
              </p>
            </div>
            <div className="mt-6 font-mono text-xs uppercase tracking-widest text-primary group-hover:underline">
              Open →
            </div>
          </Link>
          <Link
            to="/study"
            className="group flex flex-col justify-between border border-border bg-card p-8 transition-colors hover:border-primary"
          >
            <div>
              <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-primary">
                <Clock className="h-4 w-4" /> Timed exam
              </div>
              <h2 className="mb-3 font-mono text-xl font-bold uppercase tracking-tight">
                Exam Simulation
              </h2>
              <p className="text-sm text-muted-foreground">
                65 questions, 90 minutes, domain-weighted distribution.
              </p>
            </div>
            <div className="mt-6 font-mono text-xs uppercase tracking-widest text-primary group-hover:underline">
              Open →
            </div>
          </Link>
          <Link
            to="/analytics"
            className="group flex flex-col justify-between border border-border bg-card p-8 transition-colors hover:border-primary"
          >
            <div>
              <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-primary">
                <TrendingUp className="h-4 w-4" /> Analytics
              </div>
              <h2 className="mb-3 font-mono text-xl font-bold uppercase tracking-tight">
                Progress signals
              </h2>
              <p className="text-sm text-muted-foreground">
                Per-domain accuracy, response times, and mastery curves.
              </p>
            </div>
            <div className="mt-6 font-mono text-xs uppercase tracking-widest text-primary group-hover:underline">
              Open →
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}

function StatBox(props: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-primary">{props.icon}</div>
      <div className="font-mono text-2xl font-bold">{props.value}</div>
      <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {props.label}
      </div>
    </div>
  );
}
