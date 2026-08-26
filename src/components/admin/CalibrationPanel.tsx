/**
 * Stage 8 sub-task 8.8 — difficulty calibration panel.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { calibrateDifficulty, type CalibrationResult } from "@/lib/calibration.functions";

const btn =
  "border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-muted disabled:opacity-40";

export function CalibrationPanel() {
  const run = useServerFn(calibrateDifficulty);
  const [minSamples, setMinSamples] = useState(5);
  const [result, setResult] = useState<CalibrationResult | null>(null);

  const mutation = useMutation({
    mutationFn: (apply: boolean) => run({ data: { minSamples, apply } }),
    onSuccess: (res) => {
      setResult(res);
      toast.success(
        res.applied
          ? `Stored calibrated difficulty for ${res.applied} questions.`
          : `${res.withData} questions have enough data · ${res.changes} would change.`,
      );
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rows = (result?.rows ?? []).filter((r) => r.samples > 0).slice(0, 50);

  return (
    <div className="mt-4 border border-border bg-background p-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Min attempts · {minSamples}
          <input
            type="range"
            min={1}
            max={50}
            step={1}
            value={minSamples}
            onChange={(e) => setMinSamples(Number(e.target.value))}
            className="w-40"
          />
        </label>
        <button
          type="button"
          className={btn}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(false)}
        >
          {mutation.isPending ? "Working…" : "Preview_Calibration"}
        </button>
        <button
          type="button"
          className={btn}
          disabled={mutation.isPending || !result}
          onClick={() => mutation.mutate(true)}
        >
          Apply_Calibration
        </button>
      </div>

      {result && (
        <div className="mt-4 overflow-x-auto border border-border">
          <table className="w-full min-w-[640px] border-collapse font-mono text-[11px]">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left uppercase tracking-widest">
                <th className="px-3 py-2">Question</th>
                <th className="px-3 py-2 text-right">Attempts</th>
                <th className="px-3 py-2 text-right">Accuracy</th>
                <th className="px-3 py-2">Authored</th>
                <th className="px-3 py-2">Calibrated</th>
                <th className="px-3 py-2">Suggested</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    No questions have attempt data yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.questionId} className="border-b border-border/60 align-top">
                    <td className="max-w-[320px] px-3 py-2">{r.stem}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{r.samples}</td>
                    <td className="px-3 py-2 text-right">
                      {r.accuracy === null ? "—" : `${Math.round(r.accuracy * 100)}%`}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.authored}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.calibrated ?? "—"}</td>
                    <td className={`px-3 py-2 font-bold ${r.changed ? "text-primary" : ""}`}>
                      {r.enoughData ? r.suggested : "insufficient"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="border-t border-border bg-muted/20 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {result.scanned} scanned · {result.withData} with data · {result.changes} changes ·{" "}
            {result.applied} applied
          </div>
        </div>
      )}
    </div>
  );
}
