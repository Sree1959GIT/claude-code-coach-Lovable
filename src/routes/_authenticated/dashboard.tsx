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

        <div className="border border-border bg-card p-8">
          <h2 className="mb-3 font-mono text-sm font-bold uppercase tracking-widest text-primary">
            Stage_2_Pending
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Authentication and analytics capture are live. The full Study Hub, exam engine,
            SME voice mentor, and adaptive learning modules are queued for the next build
            stage. Your session data is already being tracked for personalization.
          </p>

          <div className="mt-8 grid gap-px bg-border sm:grid-cols-3">
            {[
              { k: "Status", v: "Authenticated" },
              { k: "Domains_Unlocked", v: "0 / 5" },
              { k: "Next_Stage", v: "Study_Hub" },
            ].map((row) => (
              <div key={row.k} className="bg-card p-4">
                <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  {row.k}
                </div>
                <div className="font-mono text-sm">{row.v}</div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
