/**
 * Stage 8 sub-task 1 — admin bulk question import with dry-run preview.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { importQuestions, type ImportResult } from "@/lib/import.functions";
import { IMPORT_CSV_TEMPLATE } from "@/lib/question-import";

const btn =
  "border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-muted disabled:opacity-40";

export function BulkImportPanel() {
  const runImport = useServerFn(importQuestions);
  const queryClient = useQueryClient();
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [text, setText] = useState("");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);

  const mutation = useMutation({
    mutationFn: (dryRun: boolean) => runImport({ data: { text, format, dryRun, skipDuplicates } }),
    onSuccess: (res) => {
      setResult(res);
      if (res.dryRun) {
        toast.success(`Dry run: ${res.valid} of ${res.parsed} rows importable`);
      } else {
        toast.success(`Imported ${res.imported} question${res.imported === 1 ? "" : "s"}`);
        void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  async function onFile(file: File | undefined) {
    if (!file) return;
    const content = await file.text();
    setText(content);
    setFormat(file.name.toLowerCase().endsWith(".json") ? "json" : "csv");
    setResult(null);
  }

  return (
    <div className="mt-4 border border-border bg-background p-5">
      <div className="flex flex-wrap items-center gap-3">
        {(["csv", "json"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setFormat(f);
              setResult(null);
            }}
            className={`${btn} ${format === f ? "bg-primary text-primary-foreground border-primary" : ""}`}
          >
            {f.toUpperCase()}
          </button>
        ))}
        <label className={`${btn} cursor-pointer`}>
          Upload_File
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
        <button type="button" className={btn} onClick={() => { setFormat("csv"); setText(IMPORT_CSV_TEMPLATE); setResult(null); }}>
          Load_Template
        </button>
        <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <input
            type="checkbox"
            checked={skipDuplicates}
            onChange={(e) => setSkipDuplicates(e.target.checked)}
            className="accent-primary"
          />
          Skip_Duplicates
        </label>
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResult(null);
        }}
        spellCheck={false}
        rows={10}
        placeholder={
          format === "csv"
            ? "domain,stem,correct,option_a,option_b,…"
            : '[{ "domain": "prompting-fundamentals", "stem": "…", "correct": "A", "options": [{ "label": "A", "text": "…" }] }]'
        }
        className="mt-4 w-full resize-y border border-border bg-muted/20 p-3 font-mono text-[11px] leading-relaxed outline-none focus:border-primary"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={btn}
          disabled={!text.trim() || mutation.isPending}
          onClick={() => mutation.mutate(true)}
        >
          {mutation.isPending ? "Working…" : "Dry_Run"}
        </button>
        <button
          type="button"
          className={`${btn} bg-primary text-primary-foreground border-primary`}
          disabled={!result?.dryRun || !result.valid || mutation.isPending}
          onClick={() => mutation.mutate(false)}
        >
          Commit_Import
        </button>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Dry run first, then commit
        </span>
      </div>

      {result && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {result.dryRun ? "Dry_Run" : "Imported"} · parsed {result.parsed} · importable {result.valid}
            {!result.dryRun && ` · inserted ${result.imported}`} · skipped {result.skipped}
          </p>

          {result.issues.length > 0 && (
            <ul className="mt-3 space-y-1 font-mono text-[11px] text-destructive">
              {result.issues.slice(0, 40).map((i, n) => (
                <li key={`${i.row}-${n}`}>
                  row {i.row}: {i.message}
                </li>
              ))}
              {result.issues.length > 40 && (
                <li className="text-muted-foreground">+{result.issues.length - 40} more…</li>
              )}
            </ul>
          )}

          {result.preview.length > 0 && (
            <div className="mt-4 overflow-x-auto border border-border">
              <table className="w-full border-collapse font-mono text-[11px]">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Row</th>
                    <th className="px-3 py-2 text-left">Domain</th>
                    <th className="px-3 py-2 text-left">Stem</th>
                    <th className="px-3 py-2 text-left">Diff</th>
                    <th className="px-3 py-2 text-right">Opts</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.preview.slice(0, 100).map((p) => (
                    <tr key={p.row} className="border-t border-border">
                      <td className="px-3 py-2 text-muted-foreground">{p.row}</td>
                      <td className="px-3 py-2">{p.domainTitle ?? p.domainSlug}</td>
                      <td className="max-w-md truncate px-3 py-2">{p.stem}</td>
                      <td className="px-3 py-2 uppercase text-muted-foreground">{p.difficulty}</td>
                      <td className="px-3 py-2 text-right">{p.optionCount}</td>
                      <td className="px-3 py-2 uppercase tracking-widest text-[10px]">
                        {p.duplicate ? (
                          <span className="text-destructive">duplicate</span>
                        ) : (
                          <span className="text-muted-foreground">ok</span>
                        )}
                      </td>
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
