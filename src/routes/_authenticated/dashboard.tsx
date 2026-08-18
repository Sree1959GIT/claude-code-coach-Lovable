import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
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

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Dashboard · Claude Architect Prep" },
      { name: "description", content: "Your Claude Certified Architect Foundations prep dashboard." },
      { property: "og:title", content: "Dashboard · Claude Architect Prep" },
      { property: "og:description", content: "Your prep dashboard." },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "/dashboard" }],
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-8">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
            {"> Session_Active"}
          </div>
          <h1 className="font-mono text-4xl font-bold uppercase tracking-tight">
            Welcome, {name}
          </h1>
        </div>

        {/* Quick stats */}
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatBox label="Due Now" value={due} icon={<Clock className="h-4 w-4" />} />
          <StatBox label="Mastered" value={mastered} icon={<TrendingUp className="h-4 w-4" />} />
          <StatBox label="Lapsed" value={lapsed} icon={<Dumbbell className="h-4 w-4" />} />
          <StatBox label="Total Cards" value={total} icon={<LayoutGrid className="h-4 w-4" />} />
        </div>

        {/* Exam readiness */}
        <section className="mb-8 border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
            <Target className="h-4 w-4" /> Exam_Readiness
          </div>
          {readinessQ.isLoading ? (
            <div className="font-mono text-xs text-muted-foreground">Computing readiness…</div>
          ) : !readiness ? (
            <div className="font-mono text-xs text-muted-foreground">
              Readiness unavailable. Practice a session to generate signals.
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-[220px_1fr]">
              <div>
                <div className="font-mono text-5xl font-bold tabular-nums">{readiness.score}</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-primary">
                  {READINESS_BAND_LABEL[readiness.band]}
                </div>
                <div className="mt-4 h-2 w-full bg-muted">
                  <div
                    className="h-2 bg-primary transition-all"
                    style={{ width: `${readiness.score}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
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
                <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
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
                    className="mt-4 inline-block border border-primary px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    Drill {readiness.gaps[0].title} →
                  </Link>
                ) : null}
              </div>
            </div>
          )}
        </section>

        <StudyPlanCard readiness={readiness} />

        <div className="grid gap-4 md:grid-cols-3">
          <Link
            to="/study"
            className="group flex flex-col justify-between border border-border bg-card p-8 transition-colors hover:border-primary"
          >
            <div>
              <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-primary">
                <Brain className="h-4 w-4" /> Study_Hub
              </div>
              <h2 className="mb-3 font-mono text-xl font-bold uppercase tracking-tight">
                Adaptive Practice
              </h2>
              <p className="text-sm text-muted-foreground">
                Adaptive reviews, weak-area drills, and timed exams.
              </p>
            </div>
            <div className="mt-6 font-mono text-[10px] uppercase tracking-widest text-primary group-hover:underline">
              Open →
            </div>
          </Link>
          <Link
            to="/study"
            className="group flex flex-col justify-between border border-border bg-card p-8 transition-colors hover:border-primary"
          >
            <div>
              <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-primary">
                <Clock className="h-4 w-4" /> Timed_Exam
              </div>
              <h2 className="mb-3 font-mono text-xl font-bold uppercase tracking-tight">
                Exam Simulation
              </h2>
              <p className="text-sm text-muted-foreground">
                65 questions, 90 minutes, domain-weighted distribution.
              </p>
            </div>
            <div className="mt-6 font-mono text-[10px] uppercase tracking-widest text-primary group-hover:underline">
              Open →
            </div>
          </Link>
          <Link
            to="/analytics"
            className="group flex flex-col justify-between border border-border bg-card p-8 transition-colors hover:border-primary"
          >
            <div>
              <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-primary">
                <TrendingUp className="h-4 w-4" /> Analytics
              </div>
              <h2 className="mb-3 font-mono text-xl font-bold uppercase tracking-tight">
                Progress_Signals
              </h2>
              <p className="text-sm text-muted-foreground">
                Per-domain accuracy, response times, and mastery curves.
              </p>
            </div>
            <div className="mt-6 font-mono text-[10px] uppercase tracking-widest text-primary group-hover:underline">
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
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {props.label}
      </div>
    </div>
  );
}
