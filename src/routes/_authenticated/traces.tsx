import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { logEvent } from "@/lib/analytics";
import { fetchAgentRuns, fetchAgentSteps, type AgentRun, type AgentStep } from "@/lib/traces";

export const Route = createFileRoute("/_authenticated/traces")({
  component: TracesPage,
  head: () => ({
    meta: [
      { title: "Agent Traces · Claude Architect Prep" },
      { name: "description", content: "Inspect every mentor turn: intent routing, retrieval hits, agent steps, latency and token usage." },
      { property: "og:title", content: "Agent Traces · Claude Architect Prep" },
      { property: "og:description", content: "Inspect mentor routing, agent steps, latency and token usage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function ms(v: number | null) {
  if (v == null) return "—";
  return v < 1000 ? `${v}ms` : `${(v / 1000).toFixed(2)}s`;
}

function statusClass(status: string) {
  if (status === "error") return "text-destructive";
  if (status === "running") return "text-muted-foreground";
  return "text-primary";
}

function Json({ value }: { value: unknown }) {
  if (value == null) return <span className="text-muted-foreground">null</span>;
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function StepRow({ step }: { step: AgentStep }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 px-4 py-2 text-left hover:bg-muted/40"
      >
        <span className="w-6 font-mono text-[10px] text-muted-foreground">{step.step_index}</span>
        <span className="w-28 font-mono text-[11px] font-bold uppercase tracking-widest">{step.agent}</span>
        <span className="flex-1 truncate font-mono text-[11px] text-muted-foreground">
          {step.role ?? ""} {step.model ? `· ${step.model}` : ""}
        </span>
        <span className={`w-16 font-mono text-[10px] uppercase ${statusClass(step.status)}`}>{step.status}</span>
        <span className="w-16 text-right font-mono text-[10px] text-muted-foreground">{ms(step.duration_ms)}</span>
        <span className="w-24 text-right font-mono text-[10px] text-muted-foreground">
          {step.prompt_tokens}/{step.completion_tokens} tok
        </span>
      </button>
      {open ? (
        <div className="grid gap-3 px-4 pb-4 md:grid-cols-2">
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Input</p>
            <Json value={step.input} />
          </div>
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Output</p>
            <Json value={step.output} />
          </div>
          {step.error ? (
            <p className="md:col-span-2 font-mono text-[11px] text-destructive">{step.error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type CriticMeta = {
  score?: number;
  issues?: { code: string; severity: "warn" | "error"; detail: string }[];
};

export function readCritic(run: AgentRun): CriticMeta | null {
  const meta = (run.metadata as { critic?: CriticMeta } | null) ?? null;
  return meta?.critic ?? null;
}

function scoreClass(score: number) {
  if (score >= 90) return "text-primary";
  if (score >= 70) return "text-muted-foreground";
  return "text-destructive";
}

function RunCard({ run, expanded, onToggle }: { run: AgentRun; expanded: boolean; onToggle: () => void }) {
  const stepsQ = useQuery({
    queryKey: ["agent_steps", run.id],
    queryFn: () => fetchAgentSteps(run.id),
    enabled: expanded,
  });

  const route = (run.metadata as { intent?: string; agents?: string[] } | null) ?? {};
  const critic = readCritic(run);

  return (
    <div className="border border-border bg-card">
      <button onClick={onToggle} className="flex w-full flex-col gap-2 p-4 text-left hover:bg-muted/30">
        <div className="flex flex-wrap items-center gap-3">
          <span className="bg-primary px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground">
            {route.intent ?? run.mode}
          </span>
          <span className={`font-mono text-[10px] uppercase ${statusClass(run.status)}`}>{run.status}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{ms(run.duration_ms)}</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {run.total_prompt_tokens}/{run.total_completion_tokens} tok
          </span>
          {critic?.score != null ? (
            <span className={`font-mono text-[10px] uppercase ${scoreClass(critic.score)}`}>
              quality {critic.score}
              {critic.issues?.length ? ` · ${critic.issues.length} issue${critic.issues.length > 1 ? "s" : ""}` : ""}
            </span>
          ) : null}
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            {new Date(run.created_at).toLocaleString()}
          </span>
        </div>
        <p className="line-clamp-2 text-sm">{run.question ?? "(no question captured)"}</p>
        {route.agents?.length ? (
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            path: {route.agents.join(" → ")}
          </p>
        ) : null}
      </button>


      {expanded ? (
        <div className="border-t border-border">
          {stepsQ.isLoading ? (
            <p className="p-4 font-mono text-[11px] text-muted-foreground">Loading steps…</p>
          ) : stepsQ.error ? (
            <p className="p-4 font-mono text-[11px] text-destructive">Could not load steps.</p>
          ) : (stepsQ.data ?? []).length === 0 ? (
            <p className="p-4 font-mono text-[11px] text-muted-foreground">No steps recorded.</p>
          ) : (
            (stepsQ.data ?? []).map((s) => <StepRow key={s.id} step={s} />)
          )}
          {run.final_answer ? (
            <div className="border-t border-border p-4">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Final answer
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{run.final_answer}</p>
            </div>
          ) : null}
          {run.error ? (
            <p className="border-t border-border p-4 font-mono text-[11px] text-destructive">{run.error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TracesPage() {
  useEffect(() => {
    logEvent("page_view", { page: "traces" });
  }, []);

  const [openId, setOpenId] = useState<string | null>(null);
  const runsQ = useQuery({ queryKey: ["agent_runs"], queryFn: () => fetchAgentRuns(40) });

  const runs = runsQ.data ?? [];
  const errored = runs.filter((r) => r.status === "error").length;
  const avgMs = runs.length
    ? Math.round(runs.reduce((s, r) => s + (r.duration_ms ?? 0), 0) / runs.length)
    : 0;
  const tokens = runs.reduce((s, r) => s + r.total_prompt_tokens + r.total_completion_tokens, 0);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-mono text-xl font-bold uppercase tracking-tight">Agent_Traces</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every mentor turn, with the routing decision, agent path, retrieval hits, latency and token
          usage. Expand a run to inspect each agent step.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-px border border-border bg-border md:grid-cols-4">
          {[
            ["Runs", String(runs.length)],
            ["Errors", String(errored)],
            ["Avg latency", ms(avgMs)],
            ["Tokens", String(tokens)],
          ].map(([label, value]) => (
            <div key={label} className="bg-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
              <p className="mt-1 font-mono text-lg font-bold">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 space-y-3">
          {runsQ.isLoading ? (
            <p className="font-mono text-[11px] text-muted-foreground">Loading traces…</p>
          ) : runsQ.error ? (
            <p className="font-mono text-[11px] text-destructive">Could not load traces.</p>
          ) : runs.length === 0 ? (
            <p className="font-mono text-[11px] text-muted-foreground">
              No agent runs yet — ask the mentor a question from a study session.
            </p>
          ) : (
            runs.map((r) => (
              <RunCard
                key={r.id}
                run={r}
                expanded={openId === r.id}
                onToggle={() => setOpenId((id) => (id === r.id ? null : r.id))}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
}
