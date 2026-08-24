/**
 * Stage 8 sub-task 8.5 — explanation enrichment panel.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { enrichExplanations, type EnrichResult } from "@/lib/enrich.functions";

const btn =
  "border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-muted disabled:opacity-40";

export function EnrichPanel() {
  const run = useServerFn(enrichExplanations);
  const [limit, setLimit] = useState(3);
  const [result, setResult] = useState<EnrichResult | null>(null);

  const mutation = useMutation({
    mutationFn: (commit: boolean) => run({ data: { limit, commit } }),
    onSuccess: (res) => {
      setResult(res);
      if (res.committed) toast.success(`${res.written} explanation(s) written`);
      else
        toast.success(
          res.drafted ? `${res.drafted} draft explanation(s) ready for review` : "No explanations drafted",
        );
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mt-4 border border-border bg-background p-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Questions per run · {limit}
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="w-48"
          />
        </label>
        <button type="button" className={btn} disabled={mutation.isPending} onClick={() => mutation.mutate(false)}>
          {mutation.isPending ? "Working…" : "Draft_Explanations"}
        </button>
        <button
          type="button"
          className={btn}
          disabled={mutation.isPending || !result || result.drafts.length === 0}
          onClick={() => mutation.mutate(true)}
        >
          Approve_And_Write
        </button>
      </div>

      {result && (
        <>
          <p className="mt-4 font-mono text-[11px] text-muted-foreground">
            {result.missingOptions} option(s) missing explanations across {result.questionsWithGaps} question(s) ·{" "}
            {result.processed} processed this run · {result.drafted} drafted
            {result.committed ? ` · ${result.written} written` : ""}
          </p>

          {result.issues.length > 0 && (
            <ul className="mt-2 space-y-1">
              {result.issues.map((i, idx) => (
                <li key={idx} className="font-mono text-[10px] text-muted-foreground">
                  ! {i}
                </li>
              ))}
            </ul>
          )}

          {result.drafts.length === 0 ? (
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">Nothing to enrich right now.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {result.drafts.map((d) => (
                <div key={d.questionId} className="border border-border p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="max-w-[70ch] font-mono text-[11px]">{d.stem}</p>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {d.domainTitle}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-2">
                    {d.options.map((o) => (
                      <li key={o.optionId} className="font-mono text-[11px] text-muted-foreground">
                        <span className="font-bold">
                          {o.label}. {o.isCorrect ? "(correct) " : ""}
                        </span>
                        {o.text}
                        <p className="mt-1">→ {o.explanation}</p>
                      </li>
                    ))}
                  </ul>
                  {d.citations.length > 0 && (
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Sources: {d.citations.map((c) => c.title).join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
