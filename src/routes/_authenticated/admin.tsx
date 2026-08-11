import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { logEvent } from "@/lib/analytics";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Admin Console · Claude Architect Prep" },
      {
        name: "description",
        content: "Role-gated console for managing learners, question content, review queues and scheduled jobs.",
      },
      { property: "og:title", content: "Admin Console · Claude Architect Prep" },
      { property: "og:description", content: "Manage learners, content, review queues and scheduled jobs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const SECTIONS: { code: string; title: string; body: string; status: "live" | "planned" }[] = [
  { code: "01", title: "Learners", body: "Attempts, mastery and last-active per account.", status: "planned" },
  { code: "02", title: "Content", body: "Domains and questions with publish state.", status: "planned" },
  { code: "03", title: "Review queue", body: "Approve or reject drafted questions.", status: "planned" },
  { code: "04", title: "Scheduled jobs", body: "Library re-index runs and their history.", status: "planned" },
  { code: "05", title: "Agent evals", body: "Golden-set replay scored by the critic.", status: "planned" },
];

function AdminPage() {
  const { isAdmin, loading } = useIsAdmin();

  useEffect(() => {
    if (!loading) void logEvent("admin_console_view", { allowed: isAdmin });
  }, [loading, isAdmin]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Stage_06B</p>
        <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight uppercase">Admin_Console</h1>

        {loading ? (
          <p className="mt-8 font-mono text-xs text-muted-foreground">Checking permissions…</p>
        ) : !isAdmin ? (
          <div className="mt-8 border border-destructive/40 bg-destructive/5 p-6">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-destructive">Access_Denied</p>
            <p className="mt-3 max-w-xl font-mono text-xs leading-relaxed text-muted-foreground">
              This console is restricted to accounts holding the admin role. Ask an existing admin to grant it, then
              reload this page.
            </p>
            <Link
              to="/dashboard"
              className="mt-6 inline-block bg-primary px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground"
            >
              Back_To_Dashboard
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-3 max-w-2xl font-mono text-xs leading-relaxed text-muted-foreground">
              Operator surface for content, learners and agent maintenance. Sections light up as Stage 6b sub-tasks
              land.
            </p>
            <div className="mt-8 grid gap-px border border-border bg-border sm:grid-cols-2">
              {SECTIONS.map((s) => (
                <div key={s.code} className="bg-background p-5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-muted-foreground">{s.code}</span>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {s.status}
                    </span>
                  </div>
                  <h2 className="mt-3 font-mono text-sm font-bold uppercase tracking-tight">{s.title}</h2>
                  <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/library"
                className="border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-muted"
              >
                Library_Console
              </Link>
              <Link
                to="/traces"
                className="border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-muted"
              >
                Agent_Traces
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
