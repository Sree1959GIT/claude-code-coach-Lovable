/**
 * Phase E6 — code generation console with a live agent stream tracker.
 * Starts a tracked run, then polls `code_gen_jobs` to show each agent's
 * status as it happens.
 */

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { generateCodebaseDraft, startCodeGenJob } from "@/lib/codegen.functions";
import { getCodeGenJob, listCodeGenJobs, type CodeGenJob } from "@/lib/codegen-jobs.functions";

const btn =
  "border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-muted disabled:opacity-40";
const field =
  "border border-border bg-background px-2 py-1.5 font-mono text-[11px] focus:outline-none focus:border-primary";

const AGENTS = ["research", "sme", "verifier", "documentation"] as const;
const AGENT_LABEL: Record<string, string> = {
  research: "01 · Research",
  sme: "02 · SME",
  verifier: "03 · Verifier",
  documentation: "04 · Documentation",
};

function statusTone(status: string) {
  if (status === "succeeded" || status === "ok") return "text-primary";
  if (status === "failed" || status === "error") return "text-destructive";
  return "text-muted-foreground";
}

function StreamTracker({ job }: { job: CodeGenJob }) {
  const live = job.status === "queued" || job.status === "running";
  return (
    <div className="mt-4 border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2 font-mono text-[10px] uppercase tracking-widest">
        <span>
          {job.conceptLabel ?? job.conceptTag} · {job.language} · {job.difficulty}
        </span>
        <span className={statusTone(job.status)}>
          {live ? `${job.currentAgent ?? "starting"}…` : job.status} · attempt {job.attempts || 1}
        </span>
      </div>

      <ol className="divide-y divide-border/60">
        {AGENTS.map((agent) => {
          const agentSteps = job.steps.filter((s) => s.agent === agent);
          const last = agentSteps[agentSteps.length - 1];
          const isCurrent = live && job.currentAgent === agent;
          const state = last ? last.status : isCurrent ? "running" : "pending";
          return (
            <li key={agent} className="flex gap-3 px-3 py-2 font-mono text-[11px]">
              <span
                className={`mt-[3px] inline-block h-2 w-2 shrink-0 ${
                  state === "ok"
                    ? "bg-primary"
                    : state === "error"
                      ? "bg-destructive"
                      : state === "running"
                        ? "animate-pulse bg-foreground"
                        : "bg-border"
                }`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold uppercase tracking-widest">{AGENT_LABEL[agent]}</span>
                  <span className={`uppercase tracking-widest ${statusTone(state)}`}>
                    {state}
                    {last ? ` · ${last.durationMs}ms` : ""}
                  </span>
                </div>
                {agentSteps.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {agentSteps.map((s, i) => (
                      <li key={i} className={s.status === "error" ? "text-destructive" : ""}>
                        {s.summary}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {(job.error || job.savedCodebaseId) && (
        <div className="border-t border-border bg-muted/20 px-3 py-2 font-mono text-[10px] uppercase tracking-widest">
          {job.savedCodebaseId ? (
            <span className="text-primary">Saved to library · {job.savedCodebaseId.slice(0, 8)}</span>
          ) : (
            <span className="text-destructive">{job.error}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function CodeGenPanel() {
  const start = useServerFn(startCodeGenJob);
  const generate = useServerFn(generateCodebaseDraft);
  const readJob = useServerFn(getCodeGenJob);
  const listJobs = useServerFn(listCodeGenJobs);

  const [conceptTag, setConceptTag] = useState("");
  const [language, setLanguage] = useState<"python" | "javascript">("python");
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">(
    "intermediate",
  );
  const [persist, setPersist] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);

  const jobQ = useQuery({
    queryKey: ["code-gen-job", jobId],
    queryFn: () => readJob({ data: { jobId: jobId! } }),
    enabled: Boolean(jobId),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "queued" || s === "running" ? 1500 : false;
    },
  });

  const recentQ = useQuery({
    queryKey: ["code-gen-jobs"],
    queryFn: () => listJobs({}),
    refetchInterval: 15000,
  });

  const run = useMutation({
    mutationFn: async () => {
      const { jobId: id } = await start({
        data: { conceptTag, conceptLabel: conceptTag, language, difficulty },
      });
      setJobId(id);
      return generate({
        data: { conceptTag, conceptLabel: conceptTag, language, difficulty, persist, jobId: id },
      });
    },
    onSuccess: (res) => {
      void jobQ.refetch();
      void recentQ.refetch();
      if (res.save?.saved) toast.success("Verified example saved to the library.");
      else if (res.error) toast.error(res.error);
      else toast.success("Draft generated (not saved).");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const job = jobQ.data ?? null;

  return (
    <div className="mt-4 border border-border bg-background p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Concept
          <input
            className={`${field} w-56`}
            value={conceptTag}
            placeholder="agent_loop"
            onChange={(e) => setConceptTag(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Language
          <select
            className={field}
            value={language}
            onChange={(e) => setLanguage(e.target.value as "python" | "javascript")}
          >
            <option value="python">python</option>
            <option value="javascript">javascript</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Difficulty
          <select
            className={field}
            value={difficulty}
            onChange={(e) =>
              setDifficulty(e.target.value as "beginner" | "intermediate" | "advanced")
            }
          >
            <option value="beginner">beginner</option>
            <option value="intermediate">intermediate</option>
            <option value="advanced">advanced</option>
          </select>
        </label>
        <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <input
            type="checkbox"
            checked={persist}
            onChange={(e) => setPersist(e.target.checked)}
          />
          Save_If_Verified
        </label>
        <button
          type="button"
          className={btn}
          disabled={run.isPending || !conceptTag.trim()}
          onClick={() => run.mutate()}
        >
          {run.isPending ? "Generating…" : "Run_Generation"}
        </button>
      </div>

      {job && <StreamTracker job={job} />}

      <div className="mt-6">
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Recent_Runs
        </h3>
        <div className="mt-2 overflow-x-auto border border-border">
          <table className="w-full min-w-[560px] border-collapse font-mono text-[11px]">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left uppercase tracking-widest">
                <th className="px-3 py-2">Concept</th>
                <th className="px-3 py-2">Language</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Steps</th>
                <th className="px-3 py-2">Started</th>
              </tr>
            </thead>
            <tbody>
              {(recentQ.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    No generation runs yet.
                  </td>
                </tr>
              ) : (
                (recentQ.data ?? []).map((j) => (
                  <tr
                    key={j.id}
                    className="cursor-pointer border-b border-border/60 hover:bg-muted/20"
                    onClick={() => setJobId(j.id)}
                  >
                    <td className="px-3 py-2">{j.conceptLabel ?? j.conceptTag}</td>
                    <td className="px-3 py-2 text-muted-foreground">{j.language}</td>
                    <td className={`px-3 py-2 uppercase ${statusTone(j.status)}`}>{j.status}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{j.steps.length}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(j.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
