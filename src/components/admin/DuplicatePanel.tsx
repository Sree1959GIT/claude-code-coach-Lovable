/**
 * Stage 8 sub-task 8.3 — duplicate / near-duplicate detector panel.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { scanQuestionDuplicates, type DuplicateScan } from "@/lib/duplicates.functions";

const btn =
  "border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-muted disabled:opacity-40";

export function DuplicatePanel() {
  const run = useServerFn(scanQuestionDuplicates);
  const [threshold, setThreshold] = useState(0.9);
  const [result, setResult] = useState<DuplicateScan | null>(null);

  const mutation = useMutation({
    mutationFn: () => run({ data: { threshold } }),
    onSuccess: (res) => {
      setResult(res);
      toast.success(
        res.pairs.length
          ? `${res.pairs.length} near-duplicate pair${res.pairs.length === 1 ? "" : "s"} found`
          : "No near-duplicates above the threshold",
      );
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mt-4 border border-border bg-background p-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Similarity threshold · {threshold.toFixed(2)}
          <input
            type="range"
            min={0.7}
            max={0.99}
            step={0.01}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-56"
          />
        </label>
        <button type="button" className={btn} disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Scanning…" : "Scan_Duplicates"}
        </button>
      </div>

      {result && (
        <>
          <p className="mt-4 font-mono text-[11px] text-muted-foreground">
            {result.questions} questions · {result.embedded} newly embedded · {result.reused} cached ·{" "}
            {result.pairs.length} pair(s) ≥ {result.threshold.toFixed(2)}
          </p>

          {result.pairs.length === 0 ? (
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">
              Nothing to review — no question pair crosses the threshold.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto border border-border">
              <table className="w-full min-w-[760px] border-collapse font-mono text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left uppercase tracking-widest">
                    <th className="px-3 py-2">Sim</th>
                    <th className="px-3 py-2">Question A</th>
                    <th className="px-3 py-2">Question B</th>
                    <th className="px-3 py-2">Domains</th>
                  </tr>
                </thead>
                <tbody>
                  {result.pairs.map((p) => (
                    <tr key={`${p.a.id}-${p.b.id}`} className="border-b border-border/60 align-top">
                      <td className="px-3 py-2 font-bold">{(p.similarity * 100).toFixed(1)}%</td>
                      <td className="max-w-[280px] px-3 py-2 text-muted-foreground">{p.a.stem}</td>
                      <td className="max-w-[280px] px-3 py-2 text-muted-foreground">{p.b.stem}</td>
                      <td className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                        {p.sameDomain ? p.a.domainTitle : `${p.a.domainTitle} / ${p.b.domainTitle}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
