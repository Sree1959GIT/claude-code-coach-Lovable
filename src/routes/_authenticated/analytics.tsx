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
} from "recharts";
import { SiteHeader } from "@/components/SiteHeader";
import { logEvent } from "@/lib/analytics";
import {
  fetchDomains,
  fetchMyAttempts,
  fetchMyDomainProgress,
} from "@/lib/study";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: AnalyticsPage,
  head: () => ({
    meta: [
      { title: "Analytics · Claude Architect Prep" },
      { name: "description", content: "Your per-domain accuracy, response times, and study cadence." },
      { property: "og:title", content: "Analytics · Claude Architect Prep" },
      { property: "og:description", content: "Per-domain accuracy and study cadence." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function AnalyticsPage() {
  useEffect(() => { logEvent("page_view", { page: "analytics" }); }, []);

  const domainsQ = useQuery({ queryKey: ["domains"], queryFn: fetchDomains });
  const attemptsQ = useQuery({ queryKey: ["my_attempts"], queryFn: fetchMyAttempts });
  const progressQ = useQuery({ queryKey: ["my_progress"], queryFn: fetchMyDomainProgress });

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
    // last 14 days baseline
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

        <div className="mb-8 grid gap-px bg-border sm:grid-cols-4">
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
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Attempts_Last_14_Days">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={byDay}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    fontSize: 11,
                  }}
                />
                <Line type="monotone" dataKey="attempts" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="correct" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title="Accuracy_By_Domain">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byDomain}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    fontSize: 11,
                  }}
                  formatter={(v: number) => `${v}%`}
                />
                <Bar dataKey="accuracy" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
