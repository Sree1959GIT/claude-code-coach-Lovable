/**
 * Phase G1 — import logs panel: per-row diagnostics for bulk submissions.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listImportRuns, getImportRunItems } from "@/lib/import-logs.functions";

const STATUS_CLASS: Record<string, string> = {
  imported: "text-primary",
  ok: "text-muted-foreground",
  duplicate: "text-muted-foreground",
  skipped: "text-muted-foreground",
  error: "text-destructive",
};

export function ImportLogsPanel() {
  const fetchRuns = useServerFn(listImportRuns);
  const fetchItems = useServerFn(getImportRunItems);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "problems">("problems");

  const runs = useQuery({ queryKey: ["import-runs"], queryFn: () => fetchRuns({}) });
  const items = useQuery({
    queryKey: ["import-run-items", openId],
    queryFn: () => fetchItems({ data: { runId: openId! } }),
    enabled: Boolean(openId),
  });

  const rows = (items.data ?? []).filter((i) =>
    filter === "all" ? true : i.status === "error" || i.status === "duplicate",
  );

  return (
    <div className="mt-4 border border-border bg-background p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Import_Logs</p>

      {runs.isLoading && (
        <p className="mt-3 font-mono text-[11px] text-muted-foreground">Loading…</p>
      )}
      {runs.data?.length === 0 && (
        <p className="mt-3 font-mono text-[11px] text-muted-foreground">No imports recorded yet.</p>
      )}

      {(runs.data?.length ?? 0) > 0 && (
        <div className="mt-3 overflow-x-auto border border-border">
          <table className="w-full border-collapse font-mono text-[11px]">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Mode</th>
                <th className="px-3 py-2 text-left">Format</th>
                <th className="px-3 py-2 text-right">Parsed</th>
                <th className="px-3 py-2 text-right">Imported</th>
                <th className="px-3 py-2 text-right">Skipped</th>
                <th className="px-3 py-2 text-left" />
              </tr>
            </thead>
            <tbody>
              {(runs.data ?? []).map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 uppercase">{r.dryRun ? "dry_run" : "commit"}</td>
                  <td className="px-3 py-2 uppercase">{r.format}</td>
                  <td className="px-3 py-2 text-right">{r.parsed}</td>
                  <td className="px-3 py-2 text-right">{r.imported}</td>
                  <td className="px-3 py-2 text-right">{r.skipped}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setOpenId(openId === r.id ? null : r.id)}
                      className="border border-border px-2 py-1 text-[10px] font-bold uppercase tracking-widest hover:border-primary"
                    >
                      {openId === r.id ? "Hide" : "Rows"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-center gap-3">
            {(["problems", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-muted ${
                  filter === f ? "bg-primary text-primary-foreground border-primary" : ""
                }`}
              >
                {f === "problems" ? "Problems_Only" : "All_Rows"}
              </button>
            ))}
          </div>

          {items.isLoading && (
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">Loading rows…</p>
          )}
          {!items.isLoading && rows.length === 0 && (
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">
              {filter === "problems" ? "No problem rows in this run." : "No rows recorded."}
            </p>
          )}

          {rows.length > 0 && (
            <div className="mt-3 overflow-x-auto border border-border">
              <table className="w-full border-collapse font-mono text-[11px]">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Row</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Domain</th>
                    <th className="px-3 py-2 text-left">Stem</th>
                    <th className="px-3 py-2 text-left">Diagnostic</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={i.id} className="border-t border-border align-top">
                      <td className="px-3 py-2 text-muted-foreground">{i.rowNumber}</td>
                      <td className={`px-3 py-2 uppercase tracking-widest text-[10px] ${STATUS_CLASS[i.status] ?? ""}`}>
                        {i.status}
                      </td>
                      <td className="px-3 py-2">{i.domainSlug ?? "—"}</td>
                      <td className="max-w-xs truncate px-3 py-2">{i.stem ?? "—"}</td>
                      <td className="px-3 py-2 text-destructive">{i.message ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
