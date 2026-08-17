import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { SiteHeader } from "@/components/SiteHeader";
import { logEvent } from "@/lib/analytics";
import {
  fetchDomains,
  fetchMyAttempts,
  fetchMyDomainProgress,
} from "@/lib/study";
import { useServerFn } from "@tanstack/react-start";
import { getMasteryOverview } from "@/lib/study.functions";
import { getReadiness } from "@/lib/readiness.functions";
import { computePassEstimate, PASS_MARK, READINESS_BAND_LABEL } from "@/lib/readiness";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: AnalyticsPage,
  head: () => ({
    meta: [
      { title: "Analytics · Claude Architect Prep" },
      { name: "description", content: "Your per-domain accuracy, response times, study cadence, and mastery state." },
      { property: "og:title", content: "Analytics · Claude Architect Prep" },
      { property: "og:description", content: "Per-domain accuracy and study cadence." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function AnalyticsPage() {
  useEffect(() => { logEvent("page_view", { page: "analytics" }); }, []);

  const getMasteryFn = useServerFn(getMasteryOverview);
  const domainsQ = useQuery({ queryKey: ["domains"], queryFn: fetchDomains });
  const attemptsQ = useQuery({ queryKey: ["my_attempts"], queryFn: fetchMyAttempts });
  const progressQ = useQuery({ queryKey: ["my_progress"], queryFn: fetchMyDomainProgress });
  const masteryQ = useQuery({ queryKey: ["mastery"], queryFn: () => getMasteryFn() });
  const getReadinessFn = useServerFn(getReadiness);
  const readinessQ = useQuery({ queryKey: ["readiness"], queryFn: () => getReadinessFn() });

  const passEstimate = useMemo(() => {
    const report = readinessQ.data;
    if (!report) return null;
    const attempts = (attemptsQ.data ?? []).map((a) => ({
      question_id: a.question_id,
      is_correct: a.is_correct,
    }));
    return computePassEstimate(report, attempts);
  }, [readinessQ.data, attemptsQ.data]);

  const totals = useMemo(() => {
    const attempts = attemptsQ.data ?? [];
    const correct = attempts.filter((a) => a.is_correct).length;
    const avgMs = attempts.length
      ? Math.round(attempts.reduce((s, a) => s + a.time_ms, 0) / attempts.length)
      : 0;
    return { total: attempts.length, correct, avgMs };
  }, [attemptsQ.data]);

  const byDay = useMemo(() => {
    const attempts = attemptsQ.data ?? [];
    const map = new Map<string, { day: string; attempts: number; correct: number }>();
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      map.set(key, { day: key.slice(5), attempts: 0, correct: 0 });
    }
    attempts.forEach((a) => {
      const key = a.created_at.slice(0, 10);
      const row = map.get(key);
      if (row) {
        row.attempts += 1;
        if (a.is_correct) row.correct += 1;
      }
    });
    return Array.from(map.values());
  }, [attemptsQ.data]);

  const byDomain = useMemo(() => {
    const domains = domainsQ.data ?? [];
    const progress = progressQ.data ?? {};
    return domains.map((d) => {
      const p = progress[d.id] ?? { attempted: 0, correct: 0, total: 0 };
      const accuracy = p.attempted ? Math.round((p.correct / p.attempted) * 100) : 0;
      return { name: d.title.split(" ")[0], accuracy, attempted: p.attempted };
    });
  }, [domainsQ.data, progressQ.data]);

  const masteryDistribution = useMemo(() => {
    const mastery = masteryQ.data ?? [];
    const counts: Record<string, number> = {};
    for (const m of mastery) {
      counts[m.status] = (counts[m.status] ?? 0) + 1;
    }
    const labels: Record<string, string> = {
      new: "New",
      learning: "Learning",
      review: "Review",
      mastered: "Mastered",
      lapsed: "Lapsed",
    };
    const colors: Record<string, string> = {
      new: "var(--color-muted-foreground)",
      learning: "var(--color-primary)",
      review: "var(--color-accent)",
      mastered: "var(--color-success)",
      lapsed: "var(--color-destructive)",
    };
    return Object.entries(counts).map(([status, value]) => ({
      name: labels[status] ?? status,
      value,
      fill: colors[status] ?? "var(--color-primary)",
    }));
  }, [masteryQ.data]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-16">
        <header className="mb-12">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
            {"> Analytics"}
          </div>
          <h1 className="font-mono text-4xl font-bold uppercase tracking-tight">
            Progress_Signals
          </h1>
        </header>

        <div className="mb-8 grid gap-px bg-border sm:grid-cols-5">
          <Stat k="Total_Attempts" v={String(totals.total)} />
          <Stat
            k="Accuracy"
            v={
              totals.total
                ? `${Math.round((totals.correct / totals.total) * 100)}%`
                : "—"
            }
          />
          <Stat k="Correct" v={String(totals.correct)} />
          <Stat k="Avg_Time" v={totals.avgMs ? `${(totals.avgMs / 1000).toFixed(1)}s` : "—"} />
          <Stat k="Cards" v={String(masteryQ.data?.length ?? 0)} />
        </div>

        {/* Predicted pass */}
        <section className="mb-8 border border-border bg-card p-6">
          <div className="mb-4 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
            Predicted_Pass
          </div>
          {readinessQ.isLoading || !passEstimate || !readinessQ.data ? (
            <div className="font-mono text-xs text-muted-foreground">
              {readinessQ.isLoading ? "Modelling your score…" : "Not enough signal yet."}
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-[240px_1fr]">
              <div>
                <div className="font-mono text-5xl font-bold tabular-nums">
                  {passEstimate.passProbability}%
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-primary">
                  {passEstimate.label} to pass
                </div>
                <div className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Readiness band: {READINESS_BAND_LABEL[readinessQ.data.band]} ·{" "}
                  {readinessQ.data.score}
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Confidence {passEstimate.confidence}% · {passEstimate.sampleSize} attempts
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>
                    Projected score {passEstimate.predicted} ({passEstimate.low}–
                    {passEstimate.high})
                  </span>
                  <span>Pass mark {PASS_MARK}</span>
                </div>
                {/* Confidence band on a 0-100 scale */}
                <div className="relative h-6 w-full bg-muted">
                  <div
                    className="absolute top-0 h-6 bg-primary/25"
                    style={{
                      left: `${passEstimate.low}%`,
                      width: `${Math.max(1, passEstimate.high - passEstimate.low)}%`,
                    }}
                  />
                  <div
                    className="absolute top-0 h-6 w-0.5 bg-primary"
                    style={{ left: `${passEstimate.predicted}%` }}
                  />
                  <div
                    className="absolute top-0 h-6 w-px bg-foreground/60"
                    style={{ left: `${PASS_MARK}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
                  <span>0</span>
                  <span>50</span>
                  <span>100</span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Blends blueprint-weighted accuracy with your readiness score. The band narrows as
                  you attempt more questions and cover more of the item bank.
                </p>
              </div>
            </div>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Attempts_Last_14_Days">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={byDay}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={10} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={10} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    fontSize: 11,
                  }}
                />
                <Line type="monotone" dataKey="attempts" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="correct" stroke="var(--color-muted-foreground)" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title="Accuracy_By_Domain">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byDomain}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={10} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={10} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    fontSize: 11,
                  }}
                  formatter={(v: number) => `${v}%`}
                />
                <Bar dataKey="accuracy" fill="var(--color-primary)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title="Mastery_Distribution">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={masteryDistribution}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {masteryDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    fontSize: 11,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title="Mastery_Heatmap">
            <div className="grid grid-cols-2 gap-3">
              <HeatStat label="New" value={masteryDistribution.find((d) => d.name === "New")?.value ?? 0} />
              <HeatStat label="Learning" value={masteryDistribution.find((d) => d.name === "Learning")?.value ?? 0} />
              <HeatStat label="Review" value={masteryDistribution.find((d) => d.name === "Review")?.value ?? 0} />
              <HeatStat label="Mastered" value={masteryDistribution.find((d) => d.name === "Mastered")?.value ?? 0} />
              <HeatStat label="Lapsed" value={masteryDistribution.find((d) => d.name === "Lapsed")?.value ?? 0} />
              <HeatStat label="Due Now" value={masteryQ.data?.filter((m) => m.due_at && new Date(m.due_at) <= new Date()).length ?? 0} />
            </div>
          </Panel>
        </div>

        {totals.total === 0 && (
          <div className="mt-8 border border-dashed border-border p-6 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            No attempts yet — head to the Study_Hub to begin capturing signal.
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-card p-4">
      <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {k}
      </div>
      <div className="font-mono text-2xl font-bold">{v}</div>
    </div>
  );
}

function HeatStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border bg-card p-3">
      <div className="font-mono text-lg font-bold">{value}</div>
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border bg-card p-6">
      <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-primary">
        {title}
      </div>
      {children}
    </section>
  );
}
