/**
 * Phase G2 — spider control desk: catalog source URLs with last-crawl stamps.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listCrawlTargets,
  addCrawlTarget,
  updateCrawlTarget,
  deleteCrawlTarget,
  crawlTargets,
  type CrawlOutcome,
} from "@/lib/spider.functions";

const label = "font-mono text-[10px] uppercase tracking-widest text-muted-foreground";
const btn =
  "bg-primary px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-50";
const ghost =
  "border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 hover:bg-muted";
const input =
  "w-full border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary";

function ago(iso: string | null) {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function SpiderPanel() {
  const fetchTargets = useServerFn(listCrawlTargets);
  const add = useServerFn(addCrawlTarget);
  const update = useServerFn(updateCrawlTarget);
  const remove = useServerFn(deleteCrawlTarget);
  const crawl = useServerFn(crawlTargets);

  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [interval, setInterval] = useState(168);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<CrawlOutcome[]>([]);
  const [onlyDue, setOnlyDue] = useState(false);

  const targets = useQuery({ queryKey: ["crawl-targets"], queryFn: () => fetchTargets({}) });
  const rows = (targets.data ?? []).filter((t) => (onlyDue ? t.due : true));
  const dueCount = (targets.data ?? []).filter((t) => t.due).length;

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      await fn();
      await targets.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await run("add", async () => {
      await add({
        data: {
          url: url.trim(),
          label: name.trim() || null,
          intervalHours: interval,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        },
      });
      setUrl("");
      setName("");
      setTags("");
      toast.success("URL catalogued");
    });
  }

  async function handleCrawl(id: string | null, dueOnly: boolean) {
    await run(id ? `crawl:${id}` : "crawl:batch", async () => {
      const r = await crawl({ data: { id, dueOnly, limit: 5 } });
      setResults(r.results);
      const ok = r.results.filter((x) => x.ok).length;
      if (r.results.length === 0) toast.info("Nothing due to crawl");
      else toast.success(`Crawled ${r.results.length} — ${ok} succeeded`);
    });
  }

  return (
    <div className="mt-4 border border-border bg-background p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={label}>Spider_Control_Desk</p>
        <div className="flex flex-wrap gap-2">
          <button
            className={ghost}
            disabled={busy !== null}
            onClick={() => setOnlyDue((v) => !v)}
          >
            {onlyDue ? "Show_All" : `Show_Due (${dueCount})`}
          </button>
          <button
            className={btn}
            disabled={busy !== null}
            onClick={() => handleCrawl(null, true)}
          >
            {busy === "crawl:batch" ? "Crawling…" : "Crawl_Due"}
          </button>
        </div>
      </div>

      <form className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]" onSubmit={handleAdd}>
        <input
          className={input}
          placeholder="https://docs.anthropic.com/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <input
          className={input}
          placeholder="Label (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={input}
          placeholder="Tags, comma separated"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <input
            className={`${input} w-20`}
            type="number"
            min={1}
            max={8760}
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value) || 168)}
            title="Crawl interval in hours"
          />
          <button className={btn} disabled={busy !== null}>
            {busy === "add" ? "…" : "Add"}
          </button>
        </div>
      </form>

      {targets.isLoading && <p className={`${label} mt-4`}>Loading…</p>}
      {targets.data?.length === 0 && (
        <p className="mt-4 font-mono text-[11px] text-muted-foreground">
          No URLs catalogued yet.
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto border border-border">
          <table className="w-full border-collapse font-mono text-[11px]">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">URL</th>
                <th className="px-3 py-2 text-left">Every</th>
                <th className="px-3 py-2 text-left">Last crawl</th>
                <th className="px-3 py-2 text-left">Result</th>
                <th className="px-3 py-2 text-right">Chunks</th>
                <th className="px-3 py-2 text-left" />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-t border-border align-top">
                  <td className="max-w-[22rem] px-3 py-2">
                    <p className="truncate font-bold">{t.label || t.url}</p>
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-[10px] text-muted-foreground hover:text-primary"
                    >
                      {t.url}
                    </a>
                    {!t.enabled && <span className={label}>paused</span>}
                  </td>
                  <td className="px-3 py-2">{t.intervalHours}h</td>
                  <td className="px-3 py-2">
                    {ago(t.lastCrawledAt)}
                    {t.due && <span className="ml-2 text-primary">· due</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={t.lastOk === false ? "text-destructive" : ""}>
                      {t.lastStatus ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{t.lastChunks ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        className={ghost}
                        disabled={busy !== null}
                        onClick={() => handleCrawl(t.id, false)}
                      >
                        {busy === `crawl:${t.id}` ? "…" : "Crawl"}
                      </button>
                      <button
                        className={ghost}
                        disabled={busy !== null}
                        onClick={() =>
                          run(`toggle:${t.id}`, () =>
                            update({ data: { id: t.id, enabled: !t.enabled } }),
                          )
                        }
                      >
                        {t.enabled ? "Pause" : "Resume"}
                      </button>
                      <button
                        className={ghost}
                        disabled={busy !== null}
                        onClick={() => run(`del:${t.id}`, () => remove({ data: { id: t.id } }))}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results.length > 0 && (
        <ul className="mt-4 space-y-1 font-mono text-[11px]">
          {results.map((r) => (
            <li key={r.id} className={r.ok ? "" : "text-destructive"}>
              {r.ok ? "OK" : "FAIL"} · {r.url} · {r.status} · {r.chunks} chunks
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
