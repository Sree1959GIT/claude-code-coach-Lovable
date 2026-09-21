import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, Clock, Play, Target } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/SiteHeader";
import { fetchDomains } from "@/lib/study";
import { startSession } from "@/lib/study.functions";
import { useSession } from "@/hooks/useSession";
import { logEvent } from "@/lib/analytics";
import {
  MOCK_EXAM_COUNT,
  MOCK_EXAM_MINUTES,
  PASS_MARK,
  blueprintTotals,
  buildBlueprint,
  fetchQuestionCounts,
  formatMinutes,
} from "@/lib/mock-exam";
import {
  InlineError,
  PageSkeleton,
  SkeletonBar,
  routeErrorComponent,
} from "@/components/Resilience";
import { createSeo, DEFAULT_SHARE_IMAGE, SITE_NAME } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/mock-exam")({
  component: MockExamPage,
  pendingComponent: () => <PageSkeleton label="Loading mock exam" />,
  errorComponent: routeErrorComponent,
  head: () => createSeo({
    title: "Full Mock Exam · Claude Architect Prep",
    description: "Sit a 65-question, 90-minute blueprint-weighted mock exam with a 70% pass mark across every certification domain.",
    path: "/mock-exam",
    noIndex: true,
    image: DEFAULT_SHARE_IMAGE,
    schema: {
      "@context": "https://schema.org",
      "@type": "Quiz",
      name: "Claude Certified Architect Foundations Mock Exam",
      description: "A 65-question, 90-minute blueprint-weighted certification practice exam.",
      provider: { "@type": "Organization", name: SITE_NAME },
      educationalLevel: "Professional certification preparation",
      timeRequired: "PT90M",
    },
  }),
});

function MockExamPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const start = useServerFn(startSession);
  const [busy, setBusy] = useState(false);

  const domainsQ = useQuery({ queryKey: ["domains"], queryFn: fetchDomains });
  const countsQ = useQuery({
    queryKey: ["question_counts"],
    queryFn: fetchQuestionCounts,
  });

  const rows = useMemo(() => {
    if (!domainsQ.data || !countsQ.data) return [];
    return buildBlueprint(domainsQ.data, countsQ.data, MOCK_EXAM_COUNT);
  }, [domainsQ.data, countsQ.data]);

  const totals = useMemo(() => blueprintTotals(rows), [rows]);
  const shortfall = totals.planned - totals.deliverable;
  const effectiveCount = Math.min(MOCK_EXAM_COUNT, totals.available);
  const passNeeded = Math.ceil(effectiveCount * PASS_MARK);

  async function launch() {
    if (!user || effectiveCount === 0) return;
    setBusy(true);
    try {
      const result = await start({
        data: { mode: "exam", targetCount: MOCK_EXAM_COUNT, domainId: null },
      });
      logEvent("mock_exam_started", {
        requested: MOCK_EXAM_COUNT,
        delivered: result.targetCount,
      });
      navigate({ to: "/study/session", search: { sessionId: result.sessionId } });
    } catch (err) {
      console.error(err);
      alert("Could not start the mock exam. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const loading = domainsQ.isLoading || countsQ.isLoading;
  const failed = domainsQ.isError || countsQ.isError;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <header className="mb-8 animate-enter">
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
            {"// Exam Simulation"}
          </div>
          <h1 className="mt-1 font-mono text-2xl font-bold uppercase tracking-tight">
            Full mock exam
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            One sitting, blueprint-weighted sampling, live countdown. Answers are
            recorded to your mastery history exactly like the real thing.
          </p>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-3">
          <StatTile
            icon={<Target className="h-4 w-4" />}
            label="Questions"
            value={loading ? "—" : String(effectiveCount)}
            hint={`blueprint target ${MOCK_EXAM_COUNT}`}
          />
          <StatTile
            icon={<Clock className="h-4 w-4" />}
            label="Time limit"
            value={formatMinutes(MOCK_EXAM_MINUTES)}
            hint={`${Math.round((MOCK_EXAM_MINUTES * 60) / Math.max(1, effectiveCount))}s per question`}
          />
          <StatTile
            icon={<Play className="h-4 w-4" />}
            label="Pass mark"
            value={`${Math.round(PASS_MARK * 100)}%`}
            hint={loading ? "—" : `${passNeeded} correct to pass`}
          />
        </section>

        <section className="mb-8 border border-border bg-card">
          <div className="border-b border-border px-4 py-3 font-mono text-xs uppercase tracking-[0.3em] text-primary">
            Blueprint allocation
          </div>
          <div className="divide-y divide-border">
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <div key={`sk-${i}`} className="flex items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <SkeletonBar className="h-3 w-2/5" />
                    <SkeletonBar className="mt-2 h-1.5 w-full" />
                  </div>
                  <SkeletonBar className="h-3 w-12" />
                </div>
              ))}
            {!loading && failed && (
              <div className="px-4 py-6">
                <InlineError
                  title="Couldn't load the question bank"
                  error={domainsQ.error ?? countsQ.error}
                  onRetry={() => {
                    void domainsQ.refetch();
                    void countsQ.refetch();
                  }}
                  retrying={domainsQ.isFetching || countsQ.isFetching}
                />
              </div>
            )}
            {rows.map((r) => {
              const short = r.deliverable < r.planned;
              return (
                <div key={r.domainId} className="flex items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs font-bold uppercase tracking-wide">
                      {r.title}
                    </div>
                    <div className="mt-1 h-1.5 w-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${Math.round(r.weight * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-14 text-right font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    {Math.round(r.weight * 100)}%
                  </div>
                  <div
                    className={`w-24 text-right font-mono text-xs ${
                      short ? "text-destructive" : "text-foreground"
                    }`}
                  >
                    {r.deliverable}/{r.planned} Q
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {!loading && shortfall > 0 && (
          <div className="mb-6 flex items-start gap-3 border border-destructive/40 bg-destructive/10 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              The bank is {shortfall} question{shortfall === 1 ? "" : "s"} short of a
              perfect blueprint spread. The sampler will backfill from other domains,
              so this run is slightly off-weight. Add more items in the admin console
              for a fully faithful simulation.
            </p>
          </div>
        )}

        <button
          onClick={launch}
          disabled={busy || loading || effectiveCount === 0}
          className="flex w-full items-center justify-center gap-3 border border-primary bg-primary px-6 py-4 font-mono text-xs font-bold uppercase tracking-[0.3em] text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? (
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-primary-foreground" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {busy ? "Building exam…" : `Start ${effectiveCount || MOCK_EXAM_COUNT}-question mock`}
        </button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          The timer starts immediately and auto-submits when it hits zero.
        </p>
      </main>
    </div>
  );
}

function StatTile(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-primary">{props.icon}</div>
      <div className="mt-2 font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
        {props.label}
      </div>
      <div className="mt-1 font-mono text-2xl font-bold">{props.value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{props.hint}</div>
    </div>
  );
}
