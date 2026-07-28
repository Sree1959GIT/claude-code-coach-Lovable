import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { useSession } from "@/hooks/useSession";
import { logEvent } from "@/lib/analytics";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Dashboard · Claude Architect Prep" },
      { name: "description", content: "Your Claude Certified Architect Foundations prep dashboard." },
      { property: "og:title", content: "Dashboard · Claude Architect Prep" },
      { property: "og:description", content: "Your prep dashboard." },
      { property: "og:url", content: "/dashboard" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "/dashboard" }],
  }),
});

function Dashboard() {
  const { user } = useSession();
  useEffect(() => {
    logEvent("page_view", { page: "dashboard" });
  }, []);

  const name = user?.user_metadata?.full_name ?? user?.email ?? "Architect";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-8">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
            {"> Session_Active"}
          </div>
          <h1 className="font-mono text-4xl font-bold uppercase tracking-tight">
            Welcome, {name}
          </h1>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <a
            href="/study"
            className="group flex flex-col justify-between border border-border bg-card p-8 transition-colors hover:border-primary"
          >
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-primary">
                {"> Study_Hub"}
              </div>
              <h2 className="mb-3 font-mono text-xl font-bold uppercase tracking-tight">
                Practice_By_Domain
              </h2>
              <p className="text-sm text-muted-foreground">
                Five exam domains, question-anatomy layout, live scoring.
              </p>
            </div>
            <div className="mt-6 font-mono text-[10px] uppercase tracking-widest text-primary group-hover:underline">
              Open →
            </div>
          </a>
          <a
            href="/analytics"
            className="group flex flex-col justify-between border border-border bg-card p-8 transition-colors hover:border-primary"
          >
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-primary">
                {"> Analytics"}
              </div>
              <h2 className="mb-3 font-mono text-xl font-bold uppercase tracking-tight">
                Progress_Signals
              </h2>
              <p className="text-sm text-muted-foreground">
                Per-domain accuracy, response times, and 14-day cadence.
              </p>
            </div>
            <div className="mt-6 font-mono text-[10px] uppercase tracking-widest text-primary group-hover:underline">
              Open →
            </div>
          </a>
        </div>
      </main>
    </div>
  );
}
