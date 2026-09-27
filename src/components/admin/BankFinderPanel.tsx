/** E1–E4 — Find question banks: research job, results desk, preview, import. */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FloatingWindow } from "@/components/FloatingWindow";
import { useActiveExam } from "@/hooks/useActiveExam";
import {
  createBankJob, runBankJob, getLatestBankJob, listBankSources, importBankSources, type BankSource,
} from "@/lib/bank-research.functions";

const statusTone: Record<string, string> = {
  ok: "text-success", running: "text-warning", error: "text-destructive", pending: "text-muted-foreground",
};

export function BankFinderPanel() {
  const { active } = useActiveExam();
  const examId = active?.id ?? null;
  const qc = useQueryClient();
  const create = useServerFn(createBankJob);
  const run = useServerFn(runBankJob);
  const latest = useServerFn(getLatestBankJob);
  const list = useServerFn(listBankSources);
  const doImport = useServerFn(importBankSources);

  const [focus, setFocus] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<BankSource | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const jobQ = useQuery({
    queryKey: ["bank-job", examId],
    enabled: !!examId,
    queryFn: () => latest({ data: { examId: examId! } }),
    refetchInterval: (q) => (running || q.state.data?.status === "running" ? 2000 : false),
  });
  const srcQ = useQuery({
    queryKey: ["bank-sources", examId],
    enabled: !!examId,
    queryFn: () => list({ data: { examId: examId! } }),
  });

  useEffect(() => { setSelected(new Set()); }, [examId]);

  async function start() {
    if (!examId) return;
    setError(null); setMessage(null); setRunning(true);
    try {
      const { jobId } = await create({ data: { examId, focus: focus.trim() || null } });
      await qc.invalidateQueries({ queryKey: ["bank-job", examId] });
      const r = await run({ data: { jobId } });
      if (!r.ok) setError(r.error ?? "Research failed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Research failed.");
    } finally {
      setRunning(false);
      qc.invalidateQueries({ queryKey: ["bank-job", examId] });
      qc.invalidateQueries({ queryKey: ["bank-sources", examId] });
    }
  }

  async function importIds(ids: string[]) {
    if (!examId || ids.length === 0) return;
    setImporting(true); setError(null); setMessage(null);
    try {
      const r = await doImport({ data: { examId, sourceIds: ids } });
      setMessage(`Imported ${r.imported} question${r.imported === 1 ? "" : "s"}, skipped ${r.skipped}. See Import logs for each row.`);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
      qc.invalidateQueries({ queryKey: ["bank-sources", examId] });
    }
  }

  if (!examId) return <p className="text-sm text-muted-foreground">Pick an exam in the top bar first.</p>;

  const job = jobQ.data;
  const sources = srcQ.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder={`Optional focus for ${active?.name ?? "this exam"}, e.g. agent SDK retries`}
          className="min-w-[240px] flex-1"
          maxLength={200}
        />
        <Button onClick={start} disabled={running}>{running ? "Researching…" : "Start research"}</Button>
      </div>

      {job && (
        <ol className="grid gap-1 rounded-md border border-border bg-surface p-3 text-sm" aria-live="polite">
          {job.stages.map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-3">
              <span className={statusTone[s.status] ?? ""}>
                {s.status === "ok" ? "✓" : s.status === "error" ? "✕" : s.status === "running" ? "…" : "○"} {s.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {s.detail}{s.ms != null ? ` · ${(s.ms / 1000).toFixed(1)}s` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}

      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
      {message && <p className="rounded-md border border-success/40 bg-success-soft p-2 text-sm">{message}</p>}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Sources found ({sources.length})</h3>
        <Button size="sm" variant="outline" disabled={selected.size === 0 || importing} onClick={() => importIds([...selected])}>
          {importing ? "Importing…" : `Import selected (${selected.size})`}
        </Button>
      </div>

      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sources yet. Start research to find question banks.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2"><span className="sr-only">Select</span></th>
                <th className="p-2">Site</th><th className="p-2">Page</th>
                <th className="p-2">Questions</th><th className="p-2">Answers</th>
                <th className="p-2">Relevance</th><th className="p-2">Status</th><th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => {
                const done = s.status === "imported";
                return (
                  <tr key={s.id} className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => setPreview(s)}>
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${s.host}`}
                        disabled={done || s.questionCount === 0}
                        checked={selected.has(s.id)}
                        onChange={(e) => {
                          const n = new Set(selected);
                          e.target.checked ? n.add(s.id) : n.delete(s.id);
                          setSelected(n);
                        }}
                      />
                    </td>
                    <td className="p-2 font-mono text-xs">{s.host}</td>
                    <td className="max-w-[260px] truncate p-2" title={s.title ?? ""}>{s.title ?? "—"}</td>
                    <td className="p-2">{s.questionCount}</td>
                    <td className="p-2">{s.answerCoverage}</td>
                    <td className="p-2">{s.relevance}%</td>
                    <td className="p-2" title={s.note ?? ""}>{done ? "Already imported" : s.status}</td>
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" disabled={done || s.questionCount === 0 || importing} onClick={() => importIds([s.id])}>
                        Import
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <FloatingWindow
        open={!!preview}
        id="bank-preview"
        title={preview?.title ?? preview?.host ?? "Source"}
        subtitle={preview ? `${preview.questionCount} questions · answers ${preview.answerCoverage}` : undefined}
        onClose={() => setPreview(null)}
        footer={preview && (
          <div className="flex items-center justify-between gap-2 p-2">
            <a href={preview.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">Open original page</a>
            <Button size="sm" disabled={preview.status === "imported" || preview.questionCount === 0 || importing} onClick={() => importIds([preview.id])}>
              Import this source
            </Button>
          </div>
        )}
      >
        <div className="space-y-3 p-3 text-sm">
          {preview?.note && <p className="text-muted-foreground">{preview.note}</p>}
          {preview?.extracted.map((q, i) => (
            <div key={i} className="rounded-md border border-border bg-surface p-2">
              <p className="font-medium">{i + 1}. {q.stem}</p>
              <ul className="mt-1 list-none space-y-0.5">
                {q.options.map((o, j) => <li key={j}>{String.fromCharCode(65 + j)}. {o}</li>)}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">Answer: {q.answer ?? "not given"}</p>
            </div>
          ))}
        </div>
      </FloatingWindow>
    </div>
  );
}
