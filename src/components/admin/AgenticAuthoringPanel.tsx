/**
 * Enhancement 2.0 — Phase C: agentic authoring workspace.
 * Runs Setter → Researcher → Adversary → Reviewer and queues DRAFTS only.
 * Manual authoring stays untouched and remains the default path.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  addAuthoringSource,
  deleteAuthoringSource,
  listAuthoringSources,
  queueAuthoredDrafts,
  runAgenticAuthoring,
  setAuthoringSourceEnabled,
  type AuthoringRunResult,
} from "@/lib/authoring.functions";

const btn =
  "border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-muted disabled:opacity-40";

async function fetchDomains() {
  const { data, error } = await supabase.from("domains").select("id, title, sort_order").order("sort_order");
  if (error) throw error;
  return data ?? [];
}

async function fetchQuestions(domainId: string) {
  const { data, error } = await supabase
    .from("questions")
    .select("id, stem, status")
    .eq("domain_id", domainId)
    .order("sort_order")
    .limit(300);
  if (error) throw error;
  return data ?? [];
}

export function AgenticAuthoringPanel() {
  const run = useServerFn(runAgenticAuthoring);
  const queueSelected = useServerFn(queueAuthoredDrafts);
  const loadSources = useServerFn(listAuthoringSources);
  const addSource = useServerFn(addAuthoringSource);
  const toggleSource = useServerFn(setAuthoringSourceEnabled);
  const removeSource = useServerFn(deleteAuthoringSource);
  const queryClient = useQueryClient();

  const { data: domains = [] } = useQuery({ queryKey: ["domains-list"], queryFn: fetchDomains, staleTime: 300_000 });
  const { data: sources = [] } = useQuery({ queryKey: ["authoring-sources"], queryFn: () => loadSources({}) });

  const [domainId, setDomainId] = useState("");
  const [count, setCount] = useState(2);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("mixed");
  const [topicHint, setTopicHint] = useState("");
  const [baseQuestionId, setBaseQuestionId] = useState("");
  const [revisionNotes, setRevisionNotes] = useState("");
  const [result, setResult] = useState<AuthoringRunResult | null>(null);
  const [srcLabel, setSrcLabel] = useState("");
  const [srcUrl, setSrcUrl] = useState("");

  const { data: questions = [] } = useQuery({
    queryKey: ["authoring-questions", domainId],
    queryFn: () => fetchQuestions(domainId),
    enabled: Boolean(domainId),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!domainId && domains.length) setDomainId(domains[0]!.id);
  }, [domains, domainId]);


  const mutation = useMutation({
    mutationFn: (dryRun: boolean) =>
      run({
        data: {
          domainId,
          count,
          difficulty,
          topicHint: topicHint.trim() || null,
          baseQuestionId: baseQuestionId || null,
          revisionNotes: revisionNotes.trim() || null,
          dryRun,
        },
      }),
    onSuccess: (res) => {
      setResult(res);
      if (res.queued > 0) {
        toast.success(
          baseQuestionId
            ? "Revision proposal queued for review"
            : `Queued ${res.queued} draft${res.queued === 1 ? "" : "s"} for human review`,
        );
        void queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
        void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
        void queryClient.invalidateQueries({ queryKey: ["draft-reviews"] });
      } else {
        toast.success(`Drafted ${res.drafts.length} item(s)`);
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });


  const sourceMutation = useMutation({
    mutationFn: () => addSource({ data: { label: srcLabel.trim(), url: srcUrl.trim() } }),
    onSuccess: () => {
      setSrcLabel("");
      setSrcUrl("");
      toast.success("Source approved");
      void queryClient.invalidateQueries({ queryKey: ["authoring-sources"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const mutateSource = useMutation({
    mutationFn: (args: { id: string; enabled?: boolean; remove?: boolean }) =>
      args.remove ? removeSource({ data: { id: args.id } }) : toggleSource({ data: { id: args.id, enabled: args.enabled! } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["authoring-sources"] }),
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mt-4 border border-border bg-background p-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Domain
          <select
            value={domainId}
            onChange={(e) => {
              setDomainId(e.target.value);
              setResult(null);
            }}
            className="border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
          >
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Items
          <input
            type="number"
            min={1}
            max={5}
            value={count}
            disabled={Boolean(baseQuestionId)}
            onChange={(e) => setCount(Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
            className="w-20 border border-border bg-background px-2 py-1 font-mono text-xs text-foreground disabled:opacity-40"
          />
        </label>


        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Difficulty
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
            className="border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
          >
            <option value="mixed">mixed</option>
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
        </label>

        <label className="flex flex-1 flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Focus topic (optional)
          <input
            value={topicHint}
            onChange={(e) => setTopicHint(e.target.value)}
            placeholder="e.g. subagent delegation"
            className="border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
          />
        </label>

        <div className="flex gap-2">
          <button className={btn} disabled={!domainId || mutation.isPending} onClick={() => mutation.mutate(true)}>
            {mutation.isPending ? "Running…" : "Preview_Loop"}
          </button>
          <button className={btn} disabled={!domainId || mutation.isPending} onClick={() => mutation.mutate(false)}>
            {baseQuestionId ? "Queue_Revision" : "Queue_Drafts"}
          </button>
        </div>
      </div>

      {/* B7 — edit mode */}
      <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-border pt-4">
        <label className="flex min-w-[18rem] flex-1 flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Edit mode — revise an existing question (optional)
          <select
            value={baseQuestionId}
            onChange={(e) => {
              setBaseQuestionId(e.target.value);
              setResult(null);
            }}
            className="border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
          >
            <option value="">— author new items —</option>
            {questions.map((q) => (
              <option key={q.id} value={q.id}>
                [{q.status}] {q.stem.slice(0, 80)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Revision notes
          <input
            value={revisionNotes}
            onChange={(e) => setRevisionNotes(e.target.value)}
            disabled={!baseQuestionId}
            placeholder="e.g. distractor B is a giveaway"
            className="border border-border bg-background px-2 py-1 font-mono text-xs text-foreground disabled:opacity-40"
          />
        </label>
      </div>


      {/* Approved research sources */}
      <div className="mt-6 border-t border-border pt-4">
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Approved_Research_Sources
        </h3>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          The library is always searched first. Agents may only reference the hosts listed here — there are no default
          external sources.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input
            value={srcLabel}
            onChange={(e) => setSrcLabel(e.target.value)}
            placeholder="Label"
            className="border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
          />
          <input
            value={srcUrl}
            onChange={(e) => setSrcUrl(e.target.value)}
            placeholder="https://docs.example.com/…"
            className="min-w-[16rem] flex-1 border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
          />
          <button
            className={btn}
            disabled={!srcLabel.trim() || !srcUrl.trim() || sourceMutation.isPending}
            onClick={() => sourceMutation.mutate()}
          >
            Add_Source
          </button>
        </div>
        {sources.length === 0 ? (
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">No approved sources yet.</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 border border-border px-3 py-1.5 font-mono text-[11px]">
                <span className="font-bold">{s.label}</span>
                <span className="text-muted-foreground">{s.host}</span>
                <span className={s.enabled ? "text-primary" : "text-muted-foreground"}>
                  {s.enabled ? "enabled" : "disabled"}
                </span>
                <button
                  className="ml-auto underline"
                  onClick={() => mutateSource.mutate({ id: s.id, enabled: !s.enabled })}
                >
                  {s.enabled ? "Disable" : "Enable"}
                </button>
                <button className="underline" onClick={() => mutateSource.mutate({ id: s.id, remove: true })}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Run output */}
      {result && (
        <div className="mt-6 border-t border-border pt-4">
          <p className="font-mono text-[11px] text-muted-foreground">
            {result.domainTitle} · {result.evidenceCount} evidence passage(s) · {result.drafts.length} drafted ·{" "}
            {result.queued} queued
          </p>

          <ul className="mt-2 flex flex-wrap gap-2">
            {result.steps.map((s, i) => (
              <li
                key={i}
                className={`border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${
                  s.status === "ok" ? "text-foreground" : "text-destructive"
                }`}
              >
                {s.agent} · {s.detail} · {s.durationMs}ms
              </li>
            ))}
          </ul>

          {result.issues.length > 0 && (
            <ul className="mt-3 space-y-1 font-mono text-[11px] text-destructive">
              {result.issues.map((i, idx) => (
                <li key={idx}>{i}</li>
              ))}
            </ul>
          )}

          <div className="mt-4 space-y-4">
            {result.drafts.map((d, i) => (
              <article key={i} className="border border-border p-4">
                <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>{d.difficulty}</span>
                  <span>reviewer {d.reviewScore}/100</span>
                  <span>{d.isRevision ? "revision" : "new"}</span>
                  <span>{d.questionId ? "queued for review" : "preview"}</span>
                </div>
                {d.isRevision && (
                  <div className="mt-2 border border-border p-2">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Field_Diff ({d.diff.length})
                    </p>
                    {d.diff.length === 0 ? (
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">No changes proposed.</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {d.diff.map((f, k) => (
                          <li key={k} className="font-mono text-[11px]">
                            <span className="uppercase tracking-widest text-muted-foreground">{f.field}</span>
                            <div className="text-destructive">− {f.before || "(empty)"}</div>
                            <div className="text-primary">+ {f.after || "(empty)"}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {d.scenario && <p className="mt-2 font-mono text-[11px] text-muted-foreground">{d.scenario}</p>}
                <p className="mt-2 text-sm font-medium">{d.stem}</p>
                <ul className="mt-2 space-y-1">
                  {d.options.map((o) => (
                    <li key={o.label} className="font-mono text-[11px]">
                      <span className={o.isCorrect ? "font-bold text-primary" : ""}>
                        {o.label}. {o.text}
                      </span>
                      {o.explanation && <span className="text-muted-foreground"> — {o.explanation}</span>}
                    </li>
                  ))}
                </ul>
                {d.adversaryIssues.length > 0 && (
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                    Adversary: {d.adversaryIssues.join(" · ")}
                  </p>
                )}
                {d.reviewNotes && (
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">Reviewer: {d.reviewNotes}</p>
                )}
                {d.citations.length > 0 && (
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    Sources: {d.citations.slice(0, 4).map((c) => c.title).join("; ")}
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
