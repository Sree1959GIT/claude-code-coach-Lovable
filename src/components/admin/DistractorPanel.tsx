/**
 * Stage 8 sub-task 8.4 — distractor quality audit panel.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  auditQuestionDistractors,
  type DistractorAudit,
  type DistractorFlag,
} from "@/lib/distractors.functions";

const btn =
  "border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-muted disabled:opacity-40";

const FLAG_LABEL: Record<DistractorFlag, string> = {
  never_chosen: "Never_chosen",
  over_chosen: "Over_chosen",
  missing_explanation: "No_explanation",
};

export function DistractorPanel() {
  const run = useServerFn(auditQuestionDistractors);
  const [minAttempts, setMinAttempts] = useState(5);
  const [overChosenShare, setOverChosenShare] = useState(0.4);
  const [filter, setFilter] = useState<DistractorFlag | "all">("all");
  const [result, setResult] = useState<DistractorAudit | null>(null);

  const mutation = useMutation({
    mutationFn: () => run({ data: { minAttempts, overChosenShare } }),
    onSuccess: (res) => {
      setResult(res);
      toast.success(
        res.items.length ? `${res.items.length} question(s) flagged` : "No distractor issues found",
      );
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const items = result
    ? result.items.filter((i) => filter === "all" || i.flags.includes(filter))
    : [];

  return (
    <div className="mt-4 border border-border bg-background p-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Min attempts · {minAttempts}
          <input
            type="range"
            min={1}
            max={30}
            step={1}
            value={minAttempts}
            onChange={(e) => setMinAttempts(Number(e.target.value))}
            className="w-48"
          />
        </label>
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Over-chosen share · {(overChosenShare * 100).toFixed(0)}%
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={overChosenShare}
            onChange={(e) => setOverChosenShare(Number(e.target.value))}
            className="w-48"
          />
        </label>
        <button type="button" className={btn} disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Auditing…" : "Run_Audit"}
        </button>
      </div>

      {result && (
        <>
          <p className="mt-4 font-mono text-[11px] text-muted-foreground">
            {result.questions} questions · {result.audited} with ≥ {result.minAttempts} attempts ·{" "}
            {result.totals.never_chosen} never-chosen · {result.totals.over_chosen} over-chosen ·{" "}
            {result.totals.missing_explanation} missing explanations
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {(["all", "never_chosen", "over_chosen", "missing_explanation"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`${btn} ${filter === f ? "bg-muted" : ""}`}
              >
                {f === "all" ? "All" : FLAG_LABEL[f]}
              </button>
            ))}
          </div>

          {items.length === 0 ? (
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">
              Nothing to review for this filter.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {items.map((q) => (
                <div key={q.questionId} className="border border-border p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="max-w-[70ch] font-mono text-[11px]">{q.stem}</p>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {q.domainTitle} · {q.attempts} attempts · {(q.correctShare * 100).toFixed(0)}% correct
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {q.options.map((o) => (
                      <li key={o.optionId} className="font-mono text-[11px] text-muted-foreground">
                        <span className="font-bold">{o.label}.</span> {o.text}{" "}
                        <span className="text-[10px] uppercase tracking-widest">
                          [{o.isCorrect ? "correct" : "distractor"} · {o.picks} picks ·{" "}
                          {(o.share * 100).toFixed(0)}%]
                        </span>
                        {o.flags.map((f) => (
                          <span
                            key={f}
                            className="ml-2 border border-border px-1 text-[9px] uppercase tracking-widest"
                          >
                            {FLAG_LABEL[f]}
                          </span>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
