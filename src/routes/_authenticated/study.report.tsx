import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock, Target, XCircle } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { getSessionReport } from "@/lib/study.functions";

export const Route = createFileRoute("/_authenticated/study/report")({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: typeof search.sessionId === "string" ? search.sessionId : "",
  }),
  errorComponent: ({ error }) => (
    <div className="p-8 font-mono text-sm text-destructive">
      Report error: {error.message}
    </div>
  ),
  component: ReportPage,
  head: () => ({
    meta: [
      { title: "Score Report · Claude Architect Prep" },
      {
        name: "description",
        content:
          "Blueprint-weighted score report for your practice or mock exam session, with per-domain accuracy and a targeted remediation plan.",
      },
      { property: "og:title", content: "Score Report · Claude Architect Prep" },
      {
        property: "og:description",
        content:
          "See your weighted score, domain breakdown and the exact items to review next.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

function ReportPage() {
  const { sessionId } = Route.useSearch();
  const fetchReport = useServerFn(getSessionReport);

  const reportQ = useQuery({
    queryKey: ["session_report", sessionId],
    queryFn: () => fetchReport({ data: { sessionId } }),
    enabled: !!sessionId,
  });

  const r = reportQ.data;
  const weakest = r
    ? [...r.domains].sort((a, b) => a.accuracy - b.accuracy).slice(0, 3)
    : [];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        {!sessionId && (
          <div className="border border-destructive/40 bg-destructive/10 p-6 font-mono text-xs">
            Missing session id.{" "}
            <Link to="/study" className="underline">
              Back to Study_Hub
            </Link>
          </div>
        )}

        {reportQ.isLoading && (
          <div className="font-mono text-xs text-muted-foreground">Scoring session…</div>
        )}

        {reportQ.isError && (
          <div className="border border-destructive/40 bg-destructive/10 p-6 font-mono text-xs">
            Could not build the report: {(reportQ.error as Error).message}
          </div>
        )}

        {r && (
          <>
            <header className="mb-8 animate-enter">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
                {"// Score Report"}
              </div>
              <h1 className="mt-1 font-mono text-2xl font-bold uppercase tracking-tight">
                {r.mode} session
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {new Date(r.startedAt).toLocaleString()} · {r.answered} of {r.planned}{" "}
                questions answered
              </p>
            </header>

            <section
              className={`mb-8 border p-6 ${
                r.passed
                  ? "border-success/50 bg-success/10"
                  : "border-destructive/50 bg-destructive/10"
              }`}
            >
              <div className="flex flex-wrap items-center gap-4">
                {r.passed ? (
                  <CheckCircle2 className="h-8 w-8 text-success" />
                ) : (
                  <XCircle className="h-8 w-8 text-destructive" />
                )}
                <div>
                  <div className="font-mono text-3xl font-bold">
                    {pct(r.weightedScore)}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Blueprint-weighted score · pass mark {pct(r.passMark)}
                  </div>
                </div>
                <div className="ml-auto font-mono text-[11px] uppercase tracking-widest">
                  {r.passed ? "Projected pass" : "Below pass mark"}
                </div>
              </div>
            </section>

            <section className="mb-8 grid gap-4 sm:grid-cols-3">
              <Tile
                icon={<Target className="h-4 w-4" />}
                label="Raw score"
                value={`${r.correct}/${r.answered}`}
                hint={pct(r.accuracy)}
              />
              <Tile
                icon={<Clock className="h-4 w-4" />}
                label="Time used"
                value={formatDuration(r.totalTimeMs)}
                hint={
                  r.answered
                    ? `${Math.round(r.totalTimeMs / r.answered / 1000)}s per question`
                    : "—"
                }
              />
              <Tile
                icon={<XCircle className="h-4 w-4" />}
                label="Missed"
                value={String(r.missed.length)}
                hint="items to review"
              />
            </section>

            <section className="mb-8 border border-border bg-card">
              <div className="border-b border-border px-4 py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
                Domain_Breakdown
              </div>
              <div className="divide-y divide-border">
                {r.domains.map((d) => (
                  <div key={d.domainId} className="flex items-center gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-xs font-bold uppercase tracking-wide">
                        {d.title}
                      </div>
                      <div className="mt-1 h-1.5 w-full bg-muted">
                        <div
                          className={`h-full ${
                            d.accuracy >= r.passMark ? "bg-success" : "bg-destructive"
                          }`}
                          style={{ width: `${Math.round(d.accuracy * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-16 text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      w {Math.round(d.weight * 100)}%
                    </div>
                    <div className="w-20 text-right font-mono text-xs">
                      {d.correct}/{d.total}
                    </div>
                    <div className="w-14 text-right font-mono text-xs font-bold">
                      {pct(d.accuracy)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="mb-8 border border-border bg-card">
              <div className="border-b border-border px-4 py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
                Remediation_Plan
              </div>
              <ul className="divide-y divide-border">
                {weakest.map((d) => (
                  <li
                    key={d.domainId}
                    className="flex flex-wrap items-center gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1 text-sm">
                      <span className="font-semibold">{d.title}</span>{" "}
                      <span className="text-muted-foreground">
                        — {pct(d.accuracy)} accuracy, {d.total - d.correct} to fix. Drill
                        this domain before your next mock.
                      </span>
                    </div>
                    <Link
                      to="/study/$slug"
                      params={{ slug: d.slug }}
                      className="border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
                    >
                      Drill →
                    </Link>
                  </li>
                ))}
                {weakest.length === 0 && (
                  <li className="px-4 py-6 text-sm text-muted-foreground">
                    No answered questions in this session.
                  </li>
                )}
              </ul>
            </section>

            {r.missed.length > 0 && (
              <section className="mb-8 border border-border bg-card">
                <div className="border-b border-border px-4 py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
                  Missed_Items
                </div>
                <ul className="divide-y divide-border">
                  {r.missed.map((m) => (
                    <li key={m.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                        <span className="text-primary">{m.domainTitle}</span>
                        <span>· {m.difficulty}</span>
                        <span className="ml-auto">
                          you: {m.selectedLabel ?? "—"} · correct: {m.correctLabel ?? "—"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed">{m.stem}</p>
                      {m.explanation && (
                        <p className="mt-1 border-l-2 border-primary/40 bg-secondary/30 px-3 py-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                          {m.explanation}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="flex flex-wrap gap-3">
              <Link
                to="/mock-exam"
                className="bg-primary px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground"
              >
                New_Mock_Exam
              </Link>
              <Link
                to="/analytics"
                className="border border-border px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
              >
                View_Analytics
              </Link>
              <Link
                to="/study"
                className="border border-border px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
              >
                Study_Hub
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Tile(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="border border-border bg-card p-4">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {props.icon}
        {props.label}
      </div>
      <div className="mt-2 font-mono text-2xl font-bold">{props.value}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {props.hint}
      </div>
    </div>
  );
}
