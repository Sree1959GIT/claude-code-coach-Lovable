import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { logEvent } from "@/lib/analytics";
import {
  COMPLEXITY,
  STAGES,
  defaultSelection,
  stageEstimate,
  type Complexity,
} from "@/lib/credit-estimates";

export const Route = createFileRoute("/_authenticated/estimator")({
  component: EstimatorPage,
  head: () => ({
    meta: [
      { title: "Credit Estimator · Claude Architect Prep" },
      {
        name: "description",
        content:
          "Estimate build credits per roadmap stage before you start, based on the options you select.",
      },
      { property: "og:title", content: "Credit Estimator · Claude Architect Prep" },
      { property: "og:description", content: "Per-stage build credit estimates driven by your selected options." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

// v2 — reset saved selections so the refreshed "already shipped" defaults apply.
const STORAGE_KEY = "cca.estimator.v2";

const STATUS_LABEL: Record<string, string> = {
  done: "Shipped",
  next: "Next up",
  planned: "Planned",
};

function EstimatorPage() {
  const [selected, setSelected] = useState<Set<string>>(() => defaultSelection());
  const [complexity, setComplexity] = useState<Complexity>("standard");
  const [iterations, setIterations] = useState(2);
  const [includeDone, setIncludeDone] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    logEvent("page_view", { page: "estimator" });
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          selected?: string[];
          complexity?: Complexity;
          iterations?: number;
          includeDone?: boolean;
        };
        if (parsed.selected) setSelected(new Set(parsed.selected));
        if (parsed.complexity) setComplexity(parsed.complexity);
        if (typeof parsed.iterations === "number") setIterations(parsed.iterations);
        if (typeof parsed.includeDone === "boolean") setIncludeDone(parsed.includeDone);
      }
    } catch {
      /* ignore malformed local state */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        selected: [...selected],
        complexity,
        iterations,
        includeDone,
      }),
    );
  }, [hydrated, selected, complexity, iterations, includeDone]);

  const perStage = useMemo(
    () =>
      STAGES.map((stage) => ({
        stage,
        est: stageEstimate(stage, selected, complexity, iterations),
      })),
    [selected, complexity, iterations],
  );

  const split = useMemo(() => {
    const sum = (pred: (s: (typeof perStage)[number]) => boolean) =>
      perStage.filter(pred).reduce(
        (acc, { est }) => ({ low: acc.low + est.low, high: acc.high + est.high }),
        { low: 0, high: 0 },
      );
    return {
      shipped: sum(({ stage }) => stage.status === "done"),
      remaining: sum(({ stage }) => stage.status !== "done"),
    };
  }, [perStage]);

  const total = includeDone
    ? {
        low: split.shipped.low + split.remaining.low,
        high: split.shipped.high + split.remaining.high,
      }
    : split.remaining;


  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-10">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Planning
          </p>
          <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight">
            Credit_Estimator
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Pick the options you want in each stage to see the expected build-credit
            range before you start. Ranges are estimates — actual usage-based cost
            depends on scope and how many iterations a stage needs. Plan-mode
            messages cost 1 credit each and are not included below.
          </p>
        </header>

        {/* Global assumptions */}
        <section className="mb-8 border border-border">
          <div className="border-b border-border bg-muted/40 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Assumptions
          </div>
          <div className="grid gap-6 p-4 sm:grid-cols-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Build depth
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(Object.keys(COMPLEXITY) as Complexity[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setComplexity(key)}
                    title={COMPLEXITY[key].hint}
                    className={`border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                      complexity === key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {COMPLEXITY[key].label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {COMPLEXITY[complexity].hint}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Iteration rounds per stage: {iterations}
              </p>
              <input
                type="range"
                min={1}
                max={6}
                step={1}
                value={iterations}
                onChange={(e) => setIterations(Number(e.target.value))}
                className="mt-3 w-full accent-[hsl(var(--primary))]"
                aria-label="Iteration rounds per stage"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Each extra round of feedback and rework adds roughly 11% to a stage.
              </p>
            </div>
          </div>
        </section>

        {/* Total */}
        <section className="mb-8 border border-primary/40 bg-primary/5 p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {includeDone ? "All stages" : "Remaining stages"}
              </p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-tight">
                {total.low}–{total.high}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  credits
                </span>
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <input
                type="checkbox"
                checked={includeDone}
                onChange={(e) => setIncludeDone(e.target.checked)}
                className="accent-[hsl(var(--primary))]"
              />
              Include shipped stages
            </label>
          </div>
        </section>

        {/* Stages */}
        <div className="space-y-4">
          {perStage.map(({ stage, est }) => (
            <section key={stage.id} className="border border-border">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-4 py-3">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {stage.code}
                    </span>
                    <h2 className="font-mono text-sm font-bold tracking-tight">
                      {stage.name}
                    </h2>
                    <span
                      className={`border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest ${
                        stage.status === "done"
                          ? "border-[hsl(var(--success))]/40 text-[hsl(var(--success))]"
                          : stage.status === "next"
                            ? "border-primary/50 text-primary"
                            : "border-border text-muted-foreground"
                      }`}
                    >
                      {STATUS_LABEL[stage.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{stage.summary}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Estimate
                  </p>
                  <p className="font-mono text-lg font-bold">
                    {est.low}–{est.high}
                  </p>
                </div>
              </div>
              <ul className="divide-y divide-border">
                {stage.options.map((opt) => {
                  const on = selected.has(opt.id);
                  return (
                    <li key={opt.id}>
                      <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-muted/30">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(opt.id)}
                          className="mt-1 accent-[hsl(var(--primary))]"
                        />
                        <span className="flex-1">
                          <span className="block text-sm">{opt.label}</span>
                          <span className="block text-xs text-muted-foreground">
                            {opt.hint}
                          </span>
                        </span>
                        <span
                          className={`font-mono text-xs ${on ? "text-foreground" : "text-muted-foreground"}`}
                        >
                          +{opt.low}–{opt.high}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Estimates cover build-mode work only. Backend usage (database, functions,
          AI gateway) is billed separately from the same credit balance based on
          actual activity.
        </p>
      </main>
    </div>
  );
}
