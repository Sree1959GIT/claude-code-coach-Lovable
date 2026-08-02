import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Brain, Clock, Dumbbell, LayoutGrid, Play } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { fetchDomains } from "@/lib/study";
import { startSession } from "@/lib/study.functions";
import { useSession } from "@/hooks/useSession";
import { logEvent } from "@/lib/analytics";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_authenticated/study/")({
  component: StudyHub,
  head: () => ({
    meta: [
      { title: "Study Hub · Claude Architect Prep" },
      { name: "description", content: "Adaptive practice, weak-area drills, and timed exams for the Claude Code Architect Foundation certification." },
    ],
  }),
});

const QUICK_COUNTS = [10, 20, 65];

function StudyHub() {
  const { user } = useSession();
  const navigate = useNavigate();
  const start = useServerFn(startSession);
  const domainsQ = useQuery({ queryKey: ["domains"], queryFn: fetchDomains });
  const [busy, setBusy] = useState(false);
  const [activeMode, setActiveMode] = useState<string | null>(null);

  async function launch(
    mode: "adaptive" | "weak" | "exam",
    count: number,
    domainId: string | null = null,
  ) {
    if (!user) return;
    setBusy(true);
    setActiveMode(`${mode}-${count}`);
    try {
      const result = await start({ data: { mode, targetCount: count, domainId } });
      logEvent("session_started", { mode, count, domain_id: domainId });
      navigate({ to: "/study/session", search: { sessionId: result.sessionId } });
    } catch (err) {
      console.error(err);
      alert("Could not start session. Try again.");
    } finally {
      setBusy(false);
      setActiveMode(null);
    }
  }

  const domains = domainsQ.data ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <header className="mb-8 animate-enter">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
            {"// Study Hub"}
          </div>
          <h1 className="mt-1 font-mono text-2xl font-bold uppercase tracking-tight">
            Choose your session
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Adaptive reviews reschedule hard cards sooner. Weak-area drills target your lowest accuracy. Exam mode simulates the 65-question / 90-minute test.
          </p>
        </header>

        {/* Mode cards */}
        <section className="mb-10 grid gap-4 md:grid-cols-3">
          <ModeCard
            icon={<Brain className="h-5 w-5" />}
            title="Adaptive Review"
            desc="FSRS-4.5 scheduler surfaces cards due now, then new items, then weak lapses."
            counts={QUICK_COUNTS}
            busy={busy}
            activeMode={activeMode}
            onLaunch={(count) => launch("adaptive", count)}
          />
          <ModeCard
            icon={<Dumbbell className="h-5 w-5" />}
            title="Weak-Area Drill"
            desc="Focus on your lowest accuracy, slowest average time, and most lapsed questions."
            counts={QUICK_COUNTS}
            busy={busy}
            activeMode={activeMode}
            onLaunch={(count) => launch("weak", count)}
          />
          <ModeCard
            icon={<Clock className="h-5 w-5" />}
            title="Timed Exam"
            desc="Stratified 65-question sample with a 90-minute timer. Domain-weighted distribution."
            counts={[65, 40, 20]}
            busy={busy}
            activeMode={activeMode}
            onLaunch={(count) => launch("exam", count)}
          />
        </section>

        {/* Domain practice */}
        <section className="animate-enter" style={{ animationDelay: "100ms" }}>
          <div className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
            <LayoutGrid className="h-4 w-4" /> Domain_Practice
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {domains.map((d) => (
              <Link
                key={d.id}
                to="/study/$slug"
                params={{ slug: d.slug }}
                className="group flex items-center justify-between border border-border bg-card p-4 transition-colors hover:border-primary"
              >
                <div>
                  <div className="font-mono text-sm font-bold uppercase tracking-wide">{d.title}</div>
                  <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{d.description}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {Number(d.weight) * 100}%
                  </span>
                  <Play className="h-4 w-4 text-primary opacity-60 transition-opacity group-hover:opacity-100" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function ModeCard(props: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  counts: number[];
  busy: boolean;
  activeMode: string | null;
  onLaunch: (count: number) => void;
}) {
  return (
    <div className="flex flex-col border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2 text-primary">{props.icon}</div>
      <h2 className="font-mono text-sm font-bold uppercase tracking-wide">{props.title}</h2>
      <p className="mt-1 mb-4 flex-1 text-xs leading-relaxed text-muted-foreground">{props.desc}</p>
      <div className="flex flex-wrap gap-2">
        {props.counts.map((count) => {
          const key = `${props.title.toLowerCase().split(" ")[0]}-${count}`;
          const isActive = props.activeMode === key;
          return (
            <button
              key={count}
              disabled={props.busy}
              onClick={() => props.onLaunch(count)}
              className={`flex items-center gap-2 border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors ${
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:border-primary"
              } disabled:opacity-50`}
            >
              {isActive ? (
                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-primary-foreground" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              {count} Q
            </button>
          );
        })}
      </div>
    </div>
  );
}
