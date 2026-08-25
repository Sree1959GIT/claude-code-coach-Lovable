/**
 * Stage 8 sub-task 8.7 — citation coverage report panel.
 */

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  refreshQuestionCitations,
  getCitationCoverage,
  type CitationCoverageRow,
} from "@/lib/citations.functions";

const btn =
  "border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-muted disabled:opacity-40";

function CoverageTable({ rows }: { rows: CitationCoverageRow[] }) {
  const totalQuestions = rows.reduce((n, r) => n + r.totalQuestions, 0);
  const totalCited = rows.reduce((n, r) => n + r.citedQuestions, 0);
  const overall = totalQuestions ? Math.round((totalCited / totalQuestions) * 1000) / 10 : 0;

  return (
    <div className="mt-4 overflow-x-auto border border-border">
      <table className="w-full min-w-[520px] border-collapse font-mono text-[11px]">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-left uppercase tracking-widest">
            <th className="px-3 py-2">Domain</th>
            <th className="px-3 py-2 text-right">Questions</th>
            <th className="px-3 py-2 text-right">With citation</th>
            <th className="px-3 py-2 text-right">Coverage</th>
            <th className="px-3 py-2">Bar</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                No domains found.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.domainId} className="border-b border-border/60 align-top">
                <td className="px-3 py-2 font-bold">{r.domainTitle}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{r.totalQuestions}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{r.citedQuestions}</td>
                <td className="px-3 py-2 text-right font-bold">{r.coveragePct}%</td>
                <td className="px-3 py-2">
                  <div className="h-2 w-32 bg-muted">
                    <div
                      className="h-2 bg-primary"
                      style={{ width: `${Math.min(r.coveragePct, 100)}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="border-t border-border bg-muted/20 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {rows.length} domains · {totalQuestions} questions · {totalCited} cited · {overall}% overall
      </div>
    </div>
  );
}

export function CitationPanel() {
  const fetch = useServerFn(getCitationCoverage);
  const run = useServerFn(refreshQuestionCitations);
  const [topK, setTopK] = useState(3);
  const [minSimilarity, setMinSimilarity] = useState(0.25);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["citation-coverage"],
    queryFn: () => fetch(),
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: () => run({ data: { topK, minSimilarity } }),
    onSuccess: (res) => {
      toast.success(
        `Linked ${res.linked}/${res.scanned} questions (${res.links} chunks). ${res.skipped} skipped.`,
      );
      void refetch();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mt-4 border border-border bg-background p-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Chunks per question · {topK}
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
            className="w-40"
          />
        </label>
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Min similarity · {minSimilarity.toFixed(2)}
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={minSimilarity}
            onChange={(e) => setMinSimilarity(Number(e.target.value))}
            className="w-40"
          />
        </label>
        <button type="button" className={btn} disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Linking…" : "Refresh_Links"}
        </button>
      </div>

      {isLoading && <p className="mt-4 font-mono text-xs text-muted-foreground">Loading coverage…</p>}
      {error && (
        <p className="mt-4 font-mono text-xs text-destructive">
          Could not load coverage: {(error as Error).message}
        </p>
      )}
      {data && <CoverageTable rows={data} />}
    </div>
  );
}
