import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { fetchDomains, fetchMyDomainProgress } from "@/lib/study";
import { logEvent } from "@/lib/analytics";

export const Route = createFileRoute("/_authenticated/study/")({
  component: StudyHub,
  head: () => ({
    meta: [
      { title: "Study Hub · Claude Architect Prep" },
      { name: "description", content: "Practice by exam domain with question-anatomy layouts and per-domain progress." },
      { property: "og:title", content: "Study Hub · Claude Architect Prep" },
      { property: "og:description", content: "Practice by exam domain with per-domain progress rings." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function StudyHub() {
  useEffect(() => { logEvent("page_view", { page: "study_hub" }); }, []);

  const domainsQ = useQuery({ queryKey: ["domains"], queryFn: fetchDomains });
  const progressQ = useQuery({
    queryKey: ["my_progress"],
    queryFn: fetchMyDomainProgress,
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-16">
        <header className="mb-12">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
            {"> Study_Hub"}
          </div>
          <h1 className="font-mono text-4xl font-bold uppercase tracking-tight">
            Exam_Domains
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Five domains cover the Claude Certified Architect Foundations blueprint.
            Pick a domain to run a question-anatomy practice set.
          </p>
        </header>

        {domainsQ.isLoading && (
          <div className="font-mono text-xs text-muted-foreground">Loading domains…</div>
        )}
        {domainsQ.error && (
          <div className="border border-destructive/40 bg-destructive/10 p-4 font-mono text-xs text-destructive">
            {(domainsQ.error as Error).message}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {domainsQ.data?.map((d) => {
            const p = progressQ.data?.[d.id] ?? { attempted: 0, correct: 0, total: 0 };
            const pct = p.total ? Math.round((p.correct / p.total) * 100) : 0;
            return (
              <Link
                key={d.id}
                to="/study/$slug"
                params={{ slug: d.slug }}
                onClick={() => logEvent("cta_click", { cta: "domain_open", slug: d.slug })}
                className="group flex flex-col border border-border bg-card p-6 transition-colors hover:border-primary"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Weight_{d.weight}%
                  </div>
                  <ProgressRing pct={pct} />
                </div>
                <h2 className="mb-2 font-mono text-lg font-bold uppercase tracking-tight">
                  {d.title}
                </h2>
                <p className="mb-6 flex-1 text-xs leading-relaxed text-muted-foreground">
                  {d.description}
                </p>
                <div className="flex items-center justify-between border-t border-border pt-3 font-mono text-[10px] uppercase tracking-widest">
                  <span className="text-muted-foreground">
                    {p.correct}/{p.total} correct
                  </span>
                  <span className="text-primary group-hover:underline">
                    Begin →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="relative h-10 w-10">
      <svg viewBox="0 0 40 40" className="h-10 w-10 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3" className="stroke-border" />
        <circle
          cx="20" cy="20" r={r} fill="none" strokeWidth="3"
          strokeDasharray={`${dash} ${c}`}
          className="stroke-primary transition-all"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono text-[9px] font-bold">
        {pct}%
      </div>
    </div>
  );
}
