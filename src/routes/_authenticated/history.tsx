import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History as HistoryIcon } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { getSessionHistory } from "@/lib/history.functions";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
  head: () => ({
    meta: [
      { title: "Session History · Claude Architect Prep" },
      {
        name: "description",
        content:
          "Every past practice and mock exam session with score, mode, duration and a link to the full score report.",
      },
      { property: "og:title", content: "Session History · Claude Architect Prep" },
      {
        property: "og:description",
        content: "Review your past study and mock exam sessions and open any score report.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const MODES = ["all", "adaptive", "weak", "exam", "mock", "retest"] as const;

function fmtDuration(ms: number | null) {
  if (!ms || ms < 1000) return "—";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

function HistoryPage() {
  const fn = useServerFn(getSessionHistory);
  const q = useQuery({ queryKey: ["session-history"], queryFn: () => fn() });
  const [mode, setMode] = useState<string>("all");

  const rows = useMemo(
    () => (q.data ?? []).filter((r) => mode === "all" || r.mode === mode),
    [q.data, mode],
  );

  const totals = useMemo(() => {
    const answered = rows.reduce((s, r) => s + r.answered, 0);
    const correct = rows.reduce((s, r) => s + r.correct, 0);
    return { sessions: rows.length, answered, accuracy: answered ? correct / answered : 0 };
  }, [rows]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <header className="mb-6">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
            <HistoryIcon className="h-4 w-4" /> Session_History
          </div>
          <h1 className="mt-1 font-mono text-2xl font-bold uppercase tracking-tight">
            Past sessions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {totals.sessions} sessions · {totals.answered} answers ·{" "}
            {Math.round(totals.accuracy * 100)}% accuracy
          </p>
        </header>

        <div className="mb-4 flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors ${
                mode === m
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:border-primary"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {q.isLoading ? (
          <div className="font-mono text-xs text-muted-foreground">Loading history…</div>
        ) : rows.length === 0 ? (
          <div className="border border-border bg-card p-8 text-center">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              No sessions yet
            </p>
            <Link
              to="/study"
              className="mt-4 inline-block border border-primary px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground"
            >
              Start studying →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto border border-border bg-card">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Focus</th>
                  <th className="px-4 py-3 text-right">Answered</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3 text-right">Duration</th>
                  <th className="px-4 py-3 text-right">Report</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">
                      {new Date(r.startedAt).toLocaleString()}
                      {!r.completed ? (
                        <span className="ml-2 border border-border px-1 text-[9px] uppercase tracking-widest text-muted-foreground">
                          open
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs uppercase text-primary">{r.mode}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {r.domainTitle ?? "All domains"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                      {r.answered}/{r.planned}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                      {r.answered ? `${Math.round(r.accuracy * 100)}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                      {fmtDuration(r.durationMs)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.answered ? (
                        <Link
                          to="/study/report"
                          search={{ sessionId: r.id }}
                          className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
                        >
                          Open →
                        </Link>
                      ) : (
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
