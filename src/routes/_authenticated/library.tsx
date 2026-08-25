import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/SiteHeader";
import { logEvent } from "@/lib/analytics";
import {
  isLibraryAdmin,
  listLibraryDocuments,
  seedLibrary,
  ingestDocument,
  ingestPreset,
} from "@/lib/library.functions";
import { INGEST_PRESETS } from "@/lib/library-presets";
import { searchLibrary } from "@/lib/retrieval.functions";


export const Route = createFileRoute("/_authenticated/library")({
  component: LibraryPage,
  head: () => ({
    meta: [
      { title: "Library Console · Claude Architect Prep" },
      {
        name: "description",
        content:
          "Admin console to seed, ingest and test the retrieval library that grounds the SME Voice Mentor.",
      },
      { property: "og:title", content: "Library Console · Claude Architect Prep" },
      {
        property: "og:description",
        content: "Seed, ingest and test the RAG knowledge library.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Doc = Awaited<ReturnType<typeof listLibraryDocuments>>[number];

const label = "font-mono text-[10px] uppercase tracking-widest text-muted-foreground";
const btn =
  "bg-primary px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-50";
const input =
  "w-full border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary";

function LibraryPage() {
  const checkAdmin = useServerFn(isLibraryAdmin);
  const listDocs = useServerFn(listLibraryDocuments);
  const runSeed = useServerFn(seedLibrary);
  const runIngest = useServerFn(ingestDocument);
  const runSearch = useServerFn(searchLibrary);
  const runPreset = useServerFn(ingestPreset);


  const [admin, setAdmin] = useState<boolean | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState("");
  const [content, setContent] = useState("");

  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<
    { title: string; url: string | null; similarity: number; content: string }[]
  >([]);

  async function refresh() {
    try {
      setDocs(await listDocs());
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to load documents");
    }
  }

  useEffect(() => {
    logEvent("page_view", { page: "library" });
    (async () => {
      try {
        const { admin: ok } = await checkAdmin();
        setAdmin(ok);
        if (ok) await refresh();
      } catch {
        setAdmin(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSeed(force: boolean) {
    setBusy("seed");
    setStatus(null);
    try {
      const r = await runSeed({ data: { force } });
      setStatus(
        `Seed complete — ${r.ingested} ingested, ${r.skipped} unchanged, ${r.failed} failed, ${r.totalChunks} chunks.`,
      );
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Seeding failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleIngest(e: React.FormEvent) {
    e.preventDefault();
    setBusy("ingest");
    setStatus(null);
    try {
      const r = await runIngest({
        data: {
          title: title.trim(),
          source: source.trim() || "manual",
          url: url.trim() ? url.trim() : null,
          kind: "doc",
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          content,
          force: true,
        },
      });
      setStatus(`Ingested "${title}" — ${r.chunkCount} chunks.`);
      setTitle("");
      setUrl("");
      setTags("");
      setContent("");
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Ingestion failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setBusy("search");
    setStatus(null);
    try {
      const r = await runSearch({ data: { query: query.trim(), matchCount: 5 } });
      if (r.error) setStatus(r.error);
      setMatches(
        r.matches.map((m) => ({
          title: m.title,
          url: m.url,
          similarity: m.similarity,
          content: m.content,
        })),
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-mono text-lg font-bold uppercase tracking-tight">
          Library_Console
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          The retrieval library grounds the SME Voice Mentor. Seed the curated corpus,
          ingest your own notes, and test what retrieval returns.
        </p>

        {admin === null && (
          <p className={`${label} mt-8`}>Checking access…</p>
        )}

        {admin === false && (
          <div className="mt-8 border border-border p-6">
            <p className="font-mono text-xs font-bold uppercase">Admin only</p>
            <p className="mt-2 text-sm text-muted-foreground">
              This console is restricted to accounts with the admin role.
            </p>
          </div>
        )}

        {admin && (
          <div className="mt-8 space-y-10">
            {status && (
              <p className="border border-border bg-muted/40 p-3 font-mono text-xs">
                {status}
              </p>
            )}

            <section className="border border-border p-5">
              <p className={label}>Curated corpus</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  className={btn}
                  disabled={busy !== null}
                  onClick={() => handleSeed(false)}
                >
                  {busy === "seed" ? "Seeding…" : "Seed_Library"}
                </button>
                <button
                  className="border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
                  disabled={busy !== null}
                  onClick={() => handleSeed(true)}
                >
                  Re-embed_All
                </button>
              </div>
            </section>

            <section className="border border-border p-5">
              <p className={label}>Source presets</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Additional docs sets and changelogs. Ingest adds only what changed;
                re-index re-embeds every document in the preset.
              </p>
              <ul className="mt-3 divide-y divide-border border border-border">
                {INGEST_PRESETS.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="min-w-[16rem] flex-1">
                      <p className="font-mono text-xs font-bold">{p.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                      <p className={`${label} mt-1`}>
                        {p.docs.length} docs · {p.tags.join(", ")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className={btn}
                        disabled={busy !== null}
                        onClick={() => handlePreset(p.id, false)}
                      >
                        {busy === `preset:${p.id}` ? "Working…" : "Ingest"}
                      </button>
                      <button
                        className="border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
                        disabled={busy !== null}
                        onClick={() => handlePreset(p.id, true)}
                      >
                        Re-index
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>


            <section className="border border-border p-5">
              <p className={label}>Ingest a document</p>
              <form className="mt-3 grid gap-3" onSubmit={handleIngest}>
                <input
                  className={input}
                  placeholder="Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    className={input}
                    placeholder="Source (e.g. anthropic-docs)"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  />
                  <input
                    className={input}
                    placeholder="URL (optional)"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>
                <input
                  className={input}
                  placeholder="Tags, comma separated"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
                <textarea
                  className={`${input} min-h-40`}
                  placeholder="Paste the document text…"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                />
                <div>
                  <button className={btn} disabled={busy !== null}>
                    {busy === "ingest" ? "Ingesting…" : "Ingest"}
                  </button>
                </div>
              </form>
            </section>

            <section className="border border-border p-5">
              <p className={label}>Test retrieval</p>
              <form className="mt-3 flex gap-3" onSubmit={handleSearch}>
                <input
                  className={input}
                  placeholder="Ask something the mentor would look up…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  required
                  minLength={2}
                />
                <button className={btn} disabled={busy !== null}>
                  {busy === "search" ? "…" : "Search"}
                </button>
              </form>
              {matches.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {matches.map((m, i) => (
                    <li key={i} className="border border-border p-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-mono text-xs font-bold">
                          [{i + 1}] {m.title}
                        </span>
                        <span className={label}>{m.similarity.toFixed(3)}</span>
                      </div>
                      <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                        {m.content}
                      </p>
                      {m.url && (
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block font-mono text-[10px] uppercase tracking-widest text-primary"
                        >
                          Open source
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <p className={label}>Documents ({docs.length})</p>
              <ul className="mt-3 divide-y divide-border border border-border">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-baseline justify-between gap-4 p-3">
                    <div>
                      <p className="font-mono text-xs font-bold">{d.title}</p>
                      <p className={label}>
                        {d.source} · {d.chunkCount} chunks · {d.tags.join(", ")}
                      </p>
                    </div>
                    <span className={label}>
                      {new Date(d.updatedAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
                {docs.length === 0 && (
                  <li className="p-3 text-xs text-muted-foreground">
                    No documents yet — run Seed_Library.
                  </li>
                )}
              </ul>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
