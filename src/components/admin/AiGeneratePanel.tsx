/**
 * Stage 8 sub-task 8.2 — AI question generator (draft) admin panel.
 * Preview first, then queue the drafts into the review queue.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateQuestions, type GenerateResult } from "@/lib/generate.functions";

const btn =
  "border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-muted disabled:opacity-40";

async function fetchDomains() {
  const { data, error } = await supabase.from("domains").select("id, title, sort_order").order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export function AiGeneratePanel() {
  const run = useServerFn(generateQuestions);
  const queryClient = useQueryClient();
  const { data: domains = [] } = useQuery({ queryKey: ["domains-list"], queryFn: fetchDomains, staleTime: 300_000 });

  const [domainId, setDomainId] = useState("");
  const [count, setCount] = useState(3);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("mixed");
  const [topicHint, setTopicHint] = useState("");
  const [result, setResult] = useState<GenerateResult | null>(null);

  useEffect(() => {
    if (!domainId && domains.length) setDomainId(domains[0]!.id);
  }, [domains, domainId]);

  const mutation = useMutation({
    mutationFn: (commit: boolean) => run({ data: { domainId, count, difficulty, topicHint, commit } }),
    onSuccess: (res) => {
      setResult(res);
      if (res.queued > 0) {
        toast.success(`Queued ${res.queued} draft${res.queued === 1 ? "" : "s"} for review`);
        void queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
        void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
      } else {
        toast.success(`Generated ${res.generated} draft${res.generated === 1 ? "" : "s"}`);
      }
    },
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
            className="border border-border bg-muted/20 px-2 py-1.5 font-mono text-[11px] normal-case tracking-normal text-foreground outline-none focus:border-primary"
          >
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Count
          <input
            type="number"
            min={1}
            max={8}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-20 border border-border bg-muted/20 px-2 py-1.5 font-mono text-[11px] text-foreground outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Difficulty
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
            className="border border-border bg-muted/20 px-2 py-1.5 font-mono text-[11px] normal-case tracking-normal text-foreground outline-none focus:border-primary"
          >
            {(["mixed", "easy", "medium", "hard"] as const).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[240px] flex-1 flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Topic_Hint (optional)
          <input
            value={topicHint}
            onChange={(e) => setTopicHint(e.target.value)}
            placeholder="e.g. subagents and tool permissions"
            className="border border-border bg-muted/20 px-2 py-1.5 font-mono text-[11px] normal-case tracking-normal text-foreground outline-none focus:border-primary"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={btn}
          disabled={!domainId || mutation.isPending}
          onClick={() => mutation.mutate(false)}
        >
          {mutation.isPending ? "Generating…" : "Preview_Drafts"}
        </button>
        <button
          type="button"
          className={`${btn} bg-primary text-primary-foreground border-primary`}
          disabled={!domainId || mutation.isPending}
          onClick={() => mutation.mutate(true)}
        >
          Generate_And_Queue
        </button>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Drafts land in the review queue — never published directly
        </span>
      </div>

      {result && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {result.domainTitle} · requested {result.requested} · generated {result.generated} · queued {result.queued} ·
            skipped {result.skipped}
          </p>

          {result.issues.length > 0 && (
            <ul className="mt-3 space-y-1 font-mono text-[11px] text-destructive">
              {result.issues.slice(0, 20).map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}

          <div className="mt-4 space-y-4">
            {result.drafts.map((d, i) => (
              <article key={i} className="border border-border p-4">
                <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>#{i + 1}</span>
                  <span>{d.difficulty}</span>
                  {d.duplicate && <span className="text-destructive">duplicate</span>}
                  {d.questionId && <span className="text-primary">queued</span>}
                  {d.citations.length === 0 && <span>ungrounded</span>}
                </div>
                {d.scenario && (
                  <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted-foreground">{d.scenario}</p>
                )}
                <p className="mt-2 font-mono text-[12px] font-bold leading-relaxed">{d.stem}</p>
                <ul className="mt-3 space-y-2">
                  {d.options.map((o) => (
                    <li key={o.label} className="font-mono text-[11px] leading-relaxed">
                      <span className={o.isCorrect ? "font-bold text-primary" : "text-muted-foreground"}>
                        {o.label}.
                      </span>{" "}
                      <span className={o.isCorrect ? "font-bold" : ""}>{o.text}</span>
                      {o.explanation && (
                        <span className="block pl-4 text-[10px] text-muted-foreground">{o.explanation}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {d.citations.length > 0 && (
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Sources: {d.citations.slice(0, 3).join(" · ")}
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
