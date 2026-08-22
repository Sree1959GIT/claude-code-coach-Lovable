import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/SiteHeader";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { logEvent } from "@/lib/analytics";
import {
  listLearners,
  listContent,
  listReviews,
  resolveReview,
  submitForReview,
  listJobRuns,
  runLibraryJobNow,
  listEvalRuns,
  listEvalResults,
  runEvalsNow,
} from "@/lib/admin.functions";


import { QuestionEditor } from "@/components/admin/QuestionEditor";
import { BulkImportPanel } from "@/components/admin/BulkImportPanel";



export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Admin Console · Claude Architect Prep" },
      {
        name: "description",
        content: "Role-gated console for managing learners, question content, review queues and scheduled jobs.",
      },
      { property: "og:title", content: "Admin Console · Claude Architect Prep" },
      { property: "og:description", content: "Manage learners, content, review queues and scheduled jobs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const SECTIONS: { code: string; title: string; body: string; status: "live" | "planned" }[] = [
  { code: "01", title: "Learners", body: "Attempts, mastery and last-active per account.", status: "live" },
  { code: "02", title: "Content", body: "Domains and questions with option health.", status: "live" },
  { code: "03", title: "Review queue", body: "Approve or reject drafted questions.", status: "live" },
  { code: "04", title: "Scheduled jobs", body: "Library re-index runs and their history.", status: "live" },
  { code: "05", title: "Agent evals", body: "Golden-set replay scored by the critic.", status: "live" },
  { code: "06", title: "Bulk import", body: "CSV/JSON question upload with dry-run preview.", status: "live" },
];


function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function LearnersTable() {
  const fetchLearners = useServerFn(listLearners);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-learners"],
    queryFn: () => fetchLearners(),
    staleTime: 60_000,
  });

  if (isLoading) return <p className="mt-4 font-mono text-xs text-muted-foreground">Loading learners…</p>;
  if (error)
    return (
      <p className="mt-4 font-mono text-xs text-destructive">Could not load learners: {(error as Error).message}</p>
    );

  const rows = data ?? [];
  const totalAttempts = rows.reduce((n, r) => n + r.attempts, 0);

  return (
    <div className="mt-4 overflow-x-auto border border-border">
      <table className="w-full min-w-[720px] border-collapse font-mono text-[11px]">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left uppercase tracking-widest text-[10px] text-muted-foreground">
            <th className="px-3 py-2">Learner</th>
            <th className="px-3 py-2">Roles</th>
            <th className="px-3 py-2 text-right">Attempts</th>
            <th className="px-3 py-2 text-right">Accuracy</th>
            <th className="px-3 py-2 text-right">Tracked</th>
            <th className="px-3 py-2">Joined</th>
            <th className="px-3 py-2">Last active</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                No learner accounts yet.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.userId} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2">
                  <span className="font-bold">{r.displayName || "Unnamed"}</span>
                  <span className="ml-2 text-[10px] text-muted-foreground">{r.userId.slice(0, 8)}</span>
                </td>
                <td className="px-3 py-2 uppercase tracking-widest text-[10px] text-muted-foreground">
                  {r.roles.length ? r.roles.join(" · ") : "user"}
                </td>
                <td className="px-3 py-2 text-right">{r.attempts}</td>
                <td className="px-3 py-2 text-right">{r.attempts ? `${r.accuracy}%` : "—"}</td>
                <td className="px-3 py-2 text-right">{r.masteryTracked}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmt(r.joinedAt)}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmt(r.lastActiveAt)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="border-t border-border bg-muted/20 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {rows.length} learners · {totalAttempts} attempts logged
      </div>
    </div>
  );
}

function ContentPanel() {
  const fetchContent = useServerFn(listContent);
  const sendToReview = useServerFn(submitForReview);
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ domainId: string; questionId?: string } | null>(null);
  const [queuedIds, setQueuedIds] = useState<string[]>([]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-content"],
    queryFn: () => fetchContent(),
    staleTime: 60_000,
  });

  const queueReview = useMutation({
    mutationFn: (questionId: string) => sendToReview({ data: { questionId } }),
    onSuccess: (_res, questionId) => {
      setQueuedIds((prev) => (prev.includes(questionId) ? prev : [...prev, questionId]));
      void queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
    },
  });


  if (isLoading) return <p className="mt-4 font-mono text-xs text-muted-foreground">Loading content…</p>;
  if (error)
    return (
      <p className="mt-4 font-mono text-xs text-destructive">Could not load content: {(error as Error).message}</p>
    );

  const domains = data ?? [];
  const domainOptions = domains.map((d) => ({ id: d.id, title: d.title }));

  return (
    <>
      {editor && (
        <QuestionEditor
          domains={domainOptions}
          defaultDomainId={editor.domainId}
          questionId={editor.questionId}
          onClose={() => setEditor(null)}
        />
      )}
      <div className="mt-4 space-y-px border border-border bg-border">
        {domains.length === 0 ? (
          <p className="bg-background p-5 font-mono text-xs text-muted-foreground">No domains published yet.</p>
        ) : (
          domains.map((d) => {
            const open = openId === d.id;
            return (
              <div key={d.id} className="bg-background">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : d.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <span className="font-mono text-xs font-bold uppercase tracking-tight">
                    {d.title}
                    <span className="ml-2 text-[10px] font-normal text-muted-foreground">/{d.slug}</span>
                  </span>
                  <span className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>{d.questionCount} q</span>
                    <span>weight {d.weight}%</span>
                    <span>{d.attemptCount} attempts</span>
                    <span>{d.accuracy === null ? "no data" : `${d.accuracy}% acc`}</span>
                    {d.issues > 0 && <span className="text-destructive">{d.issues} issues</span>}
                    <span>{open ? "−" : "+"}</span>
                  </span>
                </button>

                {open && (
                  <div className="border-t border-border px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setEditor({ domainId: d.id })}
                      className="mb-3 bg-primary px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground"
                    >
                      New_Question
                    </button>
                    {d.questions.length === 0 ? (
                      <p className="font-mono text-[11px] text-muted-foreground">No questions in this domain.</p>
                    ) : (
                      <ul className="space-y-2">
                        {d.questions.map((q) => {
                          const bad = !q.hasCorrect || q.optionCount < 2 || !q.hasExplanation;
                          return (
                            <li key={q.id} className="border border-border/60 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <p className="font-mono text-[11px] leading-relaxed">{q.stem}</p>
                                <div className="flex shrink-0 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => queueReview.mutate(q.id)}
                                    disabled={queueReview.isPending}
                                    className="border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-widest hover:bg-muted disabled:opacity-50"
                                  >
                                    {queuedIds.includes(q.id) ? "Queued" : "Send_To_Review"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditor({ domainId: d.id, questionId: q.id })}
                                    className="border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-widest hover:bg-muted"
                                  >
                                    Edit
                                  </button>
                                </div>
                              </div>

                              <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                <span>{q.difficulty}</span>
                                <span>{q.optionCount} options</span>
                                <span>{q.attempts} attempts</span>
                                <span>{q.accuracy === null ? "no data" : `${q.accuracy}% acc`}</span>
                                {bad && (
                                  <span className="text-destructive">
                                    {!q.hasCorrect
                                      ? "no single correct option"
                                      : q.optionCount < 2
                                        ? "too few options"
                                        : "missing explanation"}
                                  </span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

const REVIEW_FILTERS = ["pending", "approved", "rejected", "all"] as const;

function ReviewQueue() {
  const fetchReviews = useServerFn(listReviews);
  const decide = useServerFn(resolveReview);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof REVIEW_FILTERS)[number]>("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: () => fetchReviews(),
    staleTime: 30_000,
  });

  const resolve = useMutation({
    mutationFn: (vars: { id: string; status: "approved" | "rejected"; notes?: string | null }) =>
      decide({ data: vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
    },
  });

  if (isLoading) return <p className="mt-4 font-mono text-xs text-muted-foreground">Loading review queue…</p>;
  if (error)
    return <p className="mt-4 font-mono text-xs text-destructive">Could not load reviews: {(error as Error).message}</p>;

  const all = data ?? [];
  const rows = filter === "all" ? all : all.filter((r) => r.status === filter);
  const pendingCount = all.filter((r) => r.status === "pending").length;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {REVIEW_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${
              filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
            }`}
          >
            {f}
            {f === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-px border border-border bg-border">
        {rows.length === 0 ? (
          <p className="bg-background p-5 font-mono text-xs text-muted-foreground">
            Nothing in this bucket. Send a question from the Content panel to start a review.
          </p>
        ) : (
          rows.map((r) => {
            const bad = !r.hasCorrect || r.optionCount < 2 || !r.hasExplanation;
            const pending = r.status === "pending";
            return (
              <div key={r.id} className="bg-background p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>
                    {r.domainTitle} · {r.source}
                  </span>
                  <span
                    className={
                      r.status === "approved"
                        ? "text-primary"
                        : r.status === "rejected"
                          ? "text-destructive"
                          : undefined
                    }
                  >
                    {r.status} · {fmt(r.reviewedAt ?? r.createdAt)}
                  </span>
                </div>
                <p className="mt-2 font-mono text-[11px] leading-relaxed">{r.stem}</p>
                <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>{r.optionCount} options</span>
                  {bad && (
                    <span className="text-destructive">
                      {!r.hasCorrect ? "no single correct option" : !r.hasExplanation ? "missing explanation" : "too few options"}
                    </span>
                  )}
                </div>
                {r.notes && !pending && (
                  <p className="mt-2 font-mono text-[10px] text-muted-foreground">Notes: {r.notes}</p>
                )}

                {pending && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      value={notes[r.id] ?? ""}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      placeholder="Reviewer note (optional)"
                      className="min-w-[220px] flex-1 border border-border bg-background px-2 py-1 font-mono text-[11px]"
                    />
                    <button
                      type="button"
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate({ id: r.id, status: "approved", notes: notes[r.id] ?? null })}
                      className="bg-primary px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate({ id: r.id, status: "rejected", notes: notes[r.id] ?? null })}
                      className="border border-destructive px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-destructive disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {resolve.error && (
        <p className="mt-2 font-mono text-[11px] text-destructive">{(resolve.error as Error).message}</p>
      )}
    </div>
  );
}


function JobsPanel() {
  const fetchRuns = useServerFn(listJobRuns);
  const runNow = useServerFn(runLibraryJobNow);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-job-runs"],
    queryFn: () => fetchRuns(),
    staleTime: 30_000,
  });

  const trigger = useMutation({
    mutationFn: () => runNow({ data: undefined }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-job-runs"] }),
  });

  const rows = data ?? [];

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => trigger.mutate()}
        disabled={trigger.isPending}
        className="bg-primary px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
      >
        {trigger.isPending ? "Running…" : "Run_Refresh_Now"}
      </button>
      {trigger.data && (
        <span className="ml-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          repaired {trigger.data.repaired} · missing {trigger.data.missing}
        </span>
      )}
      {trigger.error && (
        <p className="mt-2 font-mono text-[11px] text-destructive">{(trigger.error as Error).message}</p>
      )}

      {isLoading ? (
        <p className="mt-4 font-mono text-xs text-muted-foreground">Loading job history…</p>
      ) : error ? (
        <p className="mt-4 font-mono text-xs text-destructive">Could not load jobs: {(error as Error).message}</p>
      ) : (
        <div className="mt-4 overflow-x-auto border border-border">
          <table className="w-full min-w-[680px] border-collapse font-mono text-[11px]">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left uppercase tracking-widest text-[10px] text-muted-foreground">
                <th className="px-3 py-2">Job</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Summary</th>
                <th className="px-3 py-2 text-right">Processed</th>
                <th className="px-3 py-2 text-right">Repaired</th>
                <th className="px-3 py-2 text-right">Duration</th>
                <th className="px-3 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    No job runs recorded yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 font-bold">{r.jobName}</td>
                    <td
                      className={`px-3 py-2 uppercase tracking-widest text-[10px] ${
                        r.status === "ok" ? "text-primary" : "text-destructive"
                      }`}
                    >
                      {r.status}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.error ?? r.summary ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{r.itemsProcessed}</td>
                    <td className="px-3 py-2 text-right">{r.itemsRepaired}</td>
                    <td className="px-3 py-2 text-right">{r.durationMs === null ? "—" : `${r.durationMs} ms`}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EvalsPanel() {
  const fetchRuns = useServerFn(listEvalRuns);
  const fetchResults = useServerFn(listEvalResults);
  const runNow = useServerFn(runEvalsNow);
  const queryClient = useQueryClient();
  const [openRun, setOpenRun] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-eval-runs"],
    queryFn: () => fetchRuns(),
    staleTime: 30_000,
  });

  const results = useQuery({
    queryKey: ["admin-eval-results", openRun],
    queryFn: () => fetchResults({ data: { runId: openRun! } }),
    enabled: Boolean(openRun),
  });

  const trigger = useMutation({
    mutationFn: () => runNow({ data: undefined }),
    onSuccess: (r) => {
      setOpenRun(r.runId);
      void queryClient.invalidateQueries({ queryKey: ["admin-eval-runs"] });
    },
  });

  const runs = data ?? [];

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => trigger.mutate()}
        disabled={trigger.isPending}
        className="bg-primary px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
      >
        {trigger.isPending ? "Replaying golden set…" : "Run_Evals_Now"}
      </button>
      {trigger.data && (
        <span className="ml-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {trigger.data.passed}/{trigger.data.total} passed · avg {trigger.data.avgScore}
        </span>
      )}
      {trigger.error && (
        <p className="mt-2 font-mono text-[11px] text-destructive">{(trigger.error as Error).message}</p>
      )}

      {isLoading ? (
        <p className="mt-4 font-mono text-xs text-muted-foreground">Loading eval history…</p>
      ) : error ? (
        <p className="mt-4 font-mono text-xs text-destructive">Could not load evals: {(error as Error).message}</p>
      ) : (
        <div className="mt-4 overflow-x-auto border border-border">
          <table className="w-full min-w-[680px] border-collapse font-mono text-[11px]">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left uppercase tracking-widest text-[10px] text-muted-foreground">
                <th className="px-3 py-2">Batch</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Passed</th>
                <th className="px-3 py-2 text-right">Failed</th>
                <th className="px-3 py-2 text-right">Avg score</th>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                    No eval batches yet. Run the golden set to create one.
                  </td>
                </tr>
              ) : (
                runs.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0 align-top">
                    <td className="px-3 py-2 font-bold">{r.label}</td>
                    <td
                      className={`px-3 py-2 uppercase tracking-widest text-[10px] ${
                        r.status === "done" ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {r.status}
                    </td>
                    <td className="px-3 py-2 text-right">{r.total}</td>
                    <td className="px-3 py-2 text-right text-primary">{r.passed}</td>
                    <td className={`px-3 py-2 text-right ${r.failed ? "text-destructive" : ""}`}>{r.failed}</td>
                    <td className="px-3 py-2 text-right">{r.avgScore}</td>
                    <td className="px-3 py-2 text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setOpenRun(openRun === r.id ? null : r.id)}
                        className="border border-border px-2 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-muted"
                      >
                        {openRun === r.id ? "Hide" : "Details"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {openRun && (
        <div className="mt-4 border border-border p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Case_Results</p>
          {results.isLoading ? (
            <p className="mt-3 font-mono text-xs text-muted-foreground">Loading cases…</p>
          ) : results.error ? (
            <p className="mt-3 font-mono text-xs text-destructive">{(results.error as Error).message}</p>
          ) : (results.data ?? []).length === 0 ? (
            <p className="mt-3 font-mono text-xs text-muted-foreground">This batch recorded no cases.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {(results.data ?? []).map((c) => (
                <li key={c.id} className="border border-border/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold">{c.name}</span>
                    <span
                      className={`font-mono text-[10px] font-bold uppercase tracking-widest ${
                        c.passed ? "text-primary" : "text-destructive"
                      }`}
                    >
                      {c.passed ? "pass" : "fail"} · {c.score}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {c.intent ?? "—"} · {c.agents.join(" → ") || "—"} ·{" "}
                    {c.durationMs === null ? "—" : `${c.durationMs} ms`}
                  </p>
                  {c.issues.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {c.issues.map((i, idx) => (
                        <li key={idx} className="font-mono text-[11px] text-destructive">
                          · {i}
                        </li>
                      ))}
                    </ul>
                  )}
                  {c.missingPoints.length > 0 && (
                    <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                      Missing points: {c.missingPoints.join("; ")}
                    </p>
                  )}
                  {c.answer && (
                    <p className="mt-2 line-clamp-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {c.answer}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}


function AdminPage() {
  const { isAdmin, loading } = useIsAdmin();

  useEffect(() => {
    if (!loading) void logEvent("admin_console_view", { allowed: isAdmin });
  }, [loading, isAdmin]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Stage_06B</p>
        <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight uppercase">Admin_Console</h1>

        {loading ? (
          <p className="mt-8 font-mono text-xs text-muted-foreground">Checking permissions…</p>
        ) : !isAdmin ? (
          <div className="mt-8 border border-destructive/40 bg-destructive/5 p-6">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-destructive">Access_Denied</p>
            <p className="mt-3 max-w-xl font-mono text-xs leading-relaxed text-muted-foreground">
              This console is restricted to accounts holding the admin role. Ask an existing admin to grant it, then
              reload this page.
            </p>
            <Link
              to="/dashboard"
              className="mt-6 inline-block bg-primary px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground"
            >
              Back_To_Dashboard
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-3 max-w-2xl font-mono text-xs leading-relaxed text-muted-foreground">
              Operator surface for content, learners and agent maintenance. Sections light up as Stage 6b sub-tasks
              land.
            </p>
            <div className="mt-8 grid gap-px border border-border bg-border sm:grid-cols-2">
              {SECTIONS.map((s) => (
                <div key={s.code} className="bg-background p-5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-muted-foreground">{s.code}</span>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {s.status}
                    </span>
                  </div>
                  <h2 className="mt-3 font-mono text-sm font-bold uppercase tracking-tight">{s.title}</h2>
                  <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              ))}
            </div>

            <section className="mt-10">
              <h2 className="font-mono text-sm font-bold uppercase tracking-tight">01 · Learners</h2>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                Every account with attempts, accuracy, tracked cards and last activity.
              </p>
              <LearnersTable />
            </section>

            <section className="mt-10">
              <h2 className="font-mono text-sm font-bold uppercase tracking-tight">02 · Content</h2>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                Domains and their questions, with option health and live difficulty from real attempts.
              </p>
              <ContentPanel />
            </section>

            <section className="mt-10">
              <h2 className="font-mono text-sm font-bold uppercase tracking-tight">03 · Review_Queue</h2>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                Drafted or flagged questions awaiting a human decision. Approve or reject with an optional note.
              </p>
              <ReviewQueue />
            </section>

            <section className="mt-10">
              <h2 className="font-mono text-sm font-bold uppercase tracking-tight">04 · Scheduled_Jobs</h2>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                Library re-index history from the cron endpoint, plus a manual trigger.
              </p>
              <JobsPanel />
            </section>

            <section className="mt-10">
              <h2 className="font-mono text-sm font-bold uppercase tracking-tight">05 · Agent_Evals</h2>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                Replay the golden prompt set through the live agent path and score each answer with the critic.
              </p>
              <EvalsPanel />
            </section>





            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/library"
                className="border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-muted"
              >
                Library_Console
              </Link>
              <Link
                to="/traces"
                className="border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-muted"
              >
                Agent_Traces
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
