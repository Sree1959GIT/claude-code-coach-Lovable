/**
 * Phase G5 — Coverage parity matrix: bank composition vs. exam blueprint.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCoverageParity, type ParityRow } from "@/lib/coverage.functions";

const btn =
  "border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-muted disabled:opacity-40";

const STATE_LABEL: Record<ParityRow["state"], string> = {
  short: "Under-served",
  parity: "At parity",
  over: "Over-served",
};

function stateClass(state: ParityRow["state"]) {
  if (state === "short") return "text-destructive";
  if (state === "over") return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}

/** Diverging bar: blueprint share is the centre line, actual share deviates. */
function ParityBar({ row }: { row: ParityRow }) {
  const magnitude = Math.min(Math.abs(row.deltaPct), 20) / 20; // 20pts = full half-bar
  const width = `${magnitude * 50}%`;
  return (
    <div className="relative h-2 w-40 bg-muted">
      <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
      {row.deltaPct < 0 ? (
        <div className="absolute inset-y-0 right-1/2 bg-destructive" style={{ width }} />
      ) : (
        <div className="absolute inset-y-0 left-1/2 bg-primary" style={{ width }} />
      )}
    </div>
  );
}

export function ParityPanel() {
  const fetchParity = useServerFn(getCoverageParity);
  const [targetBankSize, setTargetBankSize] = useState(260);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["coverage-parity", targetBankSize],
    queryFn: () => fetchParity({ data: { targetBankSize } }),
    staleTime: 30_000,
  });

  return (
    <div className="mt-4 border border-border bg-background p-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Target bank size · {targetBankSize}
          <input
            type="range"
            min={65}
            max={1000}
            step={5}
            value={targetBankSize}
            onChange={(e) => setTargetBankSize(Number(e.target.value))}
            className="w-56"
          />
        </label>
        <button type="button" className={btn} disabled={isFetching} onClick={() => void refetch()}>
          {isFetching ? "Recomputing…" : "Recompute"}
        </button>
      </div>

      {isLoading && <p className="mt-4 font-mono text-xs text-muted-foreground">Loading parity report…</p>}
      {error && (
        <p className="mt-4 font-mono text-xs text-destructive">
          Could not load parity report: {(error as Error).message}
        </p>
      )}

      {data && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { k: "Published", v: String(data.totalPublished) },
              { k: "In bank", v: String(data.totalQuestions) },
              { k: "Shortfall", v: String(data.totalGap) },
              { k: "Mean deviation", v: `${data.meanDeviation} pts` },
            ].map((s) => (
              <div key={s.k} className="border border-border px-3 py-2">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{s.k}</div>
                <div className="font-mono text-lg font-bold">{s.v}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto border border-border">
            <table className="w-full min-w-[860px] border-collapse font-mono text-[11px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-3 py-2">Domain</th>
                  <th className="px-3 py-2 text-right">Blueprint</th>
                  <th className="px-3 py-2 text-right">Bank</th>
                  <th className="px-3 py-2 text-right">Δ</th>
                  <th className="px-3 py-2">Parity</th>
                  <th className="px-3 py-2 text-right">Published</th>
                  <th className="px-3 py-2 text-right">Target</th>
                  <th className="px-3 py-2 text-right">Gap</th>
                  <th className="px-3 py-2 text-right">E/M/H</th>
                  <th className="px-3 py-2 text-right">Cited</th>
                  <th className="px-3 py-2">State</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">
                      No domains found.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((r) => (
                    <tr key={r.domainId} className="border-b border-border/60">
                      <td className="px-3 py-2 font-bold">{r.title}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{r.blueprintPct}%</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{r.actualPct}%</td>
                      <td className={`px-3 py-2 text-right font-bold ${stateClass(r.state)}`}>
                        {r.deltaPct > 0 ? "+" : ""}
                        {r.deltaPct}
                      </td>
                      <td className="px-3 py-2">
                        <ParityBar row={r} />
                      </td>
                      <td className="px-3 py-2 text-right">{r.published}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{r.target}</td>
                      <td className={`px-3 py-2 text-right font-bold ${r.gap > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {r.gap > 0 ? `+${r.gap}` : r.gap}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {r.easy}/{r.medium}/{r.hard}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{r.citedPct}%</td>
                      <td className={`px-3 py-2 uppercase tracking-widest ${stateClass(r.state)}`}>
                        {STATE_LABEL[r.state]}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className="border-t border-border bg-muted/20 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Δ = bank share minus blueprint share, in percentage points · target sized to a {data.targetBankSize}-question bank
            </div>
          </div>
        </>
      )}
    </div>
  );
}
