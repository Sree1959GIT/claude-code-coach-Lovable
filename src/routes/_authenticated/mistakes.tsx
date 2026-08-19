import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { getMistakeBank } from "@/lib/mistakes.functions";

export const Route = createFileRoute("/_authenticated/mistakes")({
  component: MistakesPage,
  errorComponent: ({ error }) => (
    <div className="p-8 font-mono text-sm text-destructive">
      Mistake bank error: {error.message}
    </div>
  ),
  head: () => ({
    meta: [
      { title: "Mistake Bank · Claude Architect Prep" },
      {
        name: "description",
        content:
          "Every question you have missed, grouped by domain with your wrong answer, the correct option and a one-click drill to fix it.",
      },
      { property: "og:title", content: "Mistake Bank · Claude Architect Prep" },
      {
        property: "og:description",
        content:
          "Review every missed question, see why the correct option wins and drill the weak domain.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Filter = "open" | "recovered" | "all";

function MistakesPage() {
  const fetchBank = useServerFn(getMistakeBank);
  const bankQ = useQuery({
    queryKey: ["mistake_bank"],
    queryFn: () => fetchBank(),
  });

  const [filter, setFilter] = useState<Filter>("open");
  const [domain, setDomain] = useState<string>("all");

  const bank = bankQ.data;
  const domains = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of bank?.items ?? []) map.set(i.domainSlug, i.domainTitle);
    return Array.from(map, ([slug, title]) => ({ slug, title }));
  }, [bank]);

  const items = (bank?.items ?? []).filter((i) => {
    if (filter === "open" && i.lastAttemptCorrect) return false;
    if (filter === "recovered" && !i.lastAttemptCorrect) return false;
    if (domain !== "all" && i.domainSlug !== domain) return false;
    return true;
  });

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <header className="mb-8 animate-enter">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
            {"// Mistake Bank"}
          </div>
          <h1 className="mt-1 font-mono text-2xl font-bold uppercase tracking-tight">
            Every question you have missed
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Items stay <span className="text-destructive">open</span> until your latest
            attempt on them is correct.
          </p>
        </header>

        {bankQ.isLoading && (
          <div className="font-mono text-xs text-muted-foreground">
            Loading mistake bank…
          </div>
        )}

        {bank && (
          <>
            <section className="mb-6 grid gap-4 sm:grid-cols-3">
              <Tile
                icon={<XCircle className="h-4 w-4 text-destructive" />}
                label="Open items"
                value={String(bank.openCount)}
              />
              <Tile
                icon={<CheckCircle2 className="h-4 w-4 text-success" />}
                label="Recovered"
                value={String(bank.recoveredCount)}
              />
              <Tile
                icon={<RotateCcw className="h-4 w-4 text-primary" />}
                label="Total misses"
                value={String(bank.totalMisses)}
              />
            </section>

            <div className="mb-4 flex flex-wrap items-center gap-2">
              {(["open", "recovered", "all"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest ${
                    filter === f
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-secondary"
                  }`}
                >
                  {f}
                </button>
              ))}
              {domains.length > 0 && (
                <select
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="ml-auto border border-border bg-background px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest"
                >
                  <option value="all">All domains</option>
                  {domains.map((d) => (
                    <option key={d.slug} value={d.slug}>
                      {d.title}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <section className="border border-border bg-card">
              <ul className="divide-y divide-border">
                {items.map((m) => (
                  <li key={m.questionId} className="px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      <span className="text-primary">{m.domainTitle}</span>
                      <span>· {m.difficulty}</span>
                      <span>· missed {m.misses}×</span>
                      <span
                        className={
                          m.lastAttemptCorrect ? "text-success" : "text-destructive"
                        }
                      >
                        · {m.lastAttemptCorrect ? "recovered" : "open"}
                      </span>
                      <span className="ml-auto">
                        you: {m.selectedLabel ?? "—"} · correct:{" "}
                        <span className="text-success">{m.correctLabel ?? "—"}</span>
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed">{m.stem}</p>
                    {m.explanation && (
                      <p className="mt-2 border-l-2 border-primary/40 bg-secondary/30 px-3 py-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                        {m.explanation}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-3">
                      <Link
                        to="/study/$slug"
                        params={{ slug: m.domainSlug }}
                        className="border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
                      >
                        Drill_Domain →
                      </Link>
                      <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                        last miss {new Date(m.lastMissedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </li>
                ))}
                {items.length === 0 && (
                  <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nothing here — no missed questions match this filter.
                  </li>
                )}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="border border-border bg-card p-4">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl font-bold">{value}</div>
    </div>
  );
}
