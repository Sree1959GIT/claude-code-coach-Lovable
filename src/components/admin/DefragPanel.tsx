/**
 * Phase G4 — corpus defragmentation sweep panel.
 * Dry-run preview first, then an apply pass that re-embeds changed chunks.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { runDefragSweep, type DefragResult } from "@/lib/defrag.functions";

const btn =
  "bg-primary px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-50";
const ghost =
  "border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 hover:bg-muted";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-border px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm font-bold">{value}</p>
    </div>
  );
}

export function DefragPanel() {
  const sweep = useServerFn(runDefragSweep);
  const [busy, setBusy] = useState<"scan" | "apply" | null>(null);
  const [result, setResult] = useState<DefragResult | null>(null);

  async function run(dryRun: boolean) {
    setBusy(dryRun ? "scan" : "apply");
    try {
      const r = (await sweep({ data: { dryRun, limit: 20 } })) as DefragResult;
      setResult(r);
      if (!r.ok) toast.error(r.error ?? "Sweep failed");
      else if (r.documentsChanged === 0) toast.info("Corpus is already clean");
      else
        toast.success(
          dryRun
            ? `${r.documentsChanged} document(s) would be cleaned up`
            : `Cleaned ${r.documentsChanged} document(s), re-embedded ${r.chunksReembedded} section(s)`,
        );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sweep failed");
    } finally {
      setBusy(null);
    }
  }

  const rows = (result?.results ?? []).filter((r) => r.changed || r.error);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={ghost} disabled={busy !== null} onClick={() => void run(true)}>
          {busy === "scan" ? "Scanning…" : "Dry_Run"}
        </button>
        <button
          type="button"
          className={btn}
          disabled={busy !== null || !result || result.documentsChanged === 0 || !result.dryRun}
          onClick={() => void run(false)}
        >
          {busy === "apply" ? "Sweeping…" : "Apply_Sweep"}
        </button>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Up to 20 oldest documents per run
        </p>
      </div>

      {result && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-6">
            <Stat label="Docs scanned" value={result.documentsScanned} />
            <Stat label="Docs changed" value={result.documentsChanged} />
            <Stat label="Sections before" value={result.chunksBefore} />
            <Stat label="Sections after" value={result.chunksAfter} />
            <Stat label="Merged" value={result.chunksMerged} />
            <Stat label="Empty stripped" value={result.chunksStripped} />
          </div>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {result.dryRun ? "Dry run · nothing written" : `Applied · ${result.chunksReembedded} re-embedded`} ·{" "}
            {Math.round(result.durationMs / 100) / 10}s
          </p>
        </>
      )}

      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto border border-border">
          <table className="w-full min-w-[640px] border-collapse font-mono text-[11px]">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-3 py-2">Document</th>
                <th className="px-3 py-2 text-right">Before</th>
                <th className="px-3 py-2 text-right">After</th>
                <th className="px-3 py-2 text-right">Merged</th>
                <th className="px-3 py-2 text-right">Stripped</th>
                <th className="px-3 py-2 text-right">Re-embedded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.documentId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    {r.title}
                    {r.error && <span className="ml-2 text-destructive">{r.error}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{r.before}</td>
                  <td className="px-3 py-2 text-right">{r.after}</td>
                  <td className="px-3 py-2 text-right">{r.merged}</td>
                  <td className="px-3 py-2 text-right">{r.stripped}</td>
                  <td className="px-3 py-2 text-right">{r.reembedded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && rows.length === 0 && (
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          No fragmented or empty sections found in the scanned documents.
        </p>
      )}
    </div>
  );
}
