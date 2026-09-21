/**
 * S5 — Admin layout. The 17-section scroll is gone: this route holds the
 * permission gate plus a grouped side rail, and each group is its own page.
 */

import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/SiteHeader";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { logEvent } from "@/lib/analytics";
import { listReviews, listJobRuns } from "@/lib/admin.functions";
import { createSeo } from "@/lib/seo";
import { PageSkeleton, routeErrorComponent } from "@/components/Resilience";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
  pendingComponent: () => <PageSkeleton label="Loading admin console" />,
  errorComponent: routeErrorComponent,
  head: () =>
    createSeo({
      title: "Admin Console · Claude Architect Prep",
      description:
        "Role-gated console for managing learners, question content, quality, retrieval and operations.",
      path: "/admin",
      noIndex: true,
    }),
});

export const ADMIN_GROUPS = [
  { to: "/admin", label: "Overview", hint: "What needs a human today", exact: true },
  { to: "/admin/learners", label: "Learners", hint: "Accounts, roles and tiers" },
  { to: "/admin/content", label: "Content", hint: "Authoring, import, generation" },
  { to: "/admin/quality", label: "Quality", hint: "Review queue and audits" },
  { to: "/admin/retrieval", label: "Retrieval", hint: "Library crawl and corpus" },
  { to: "/admin/operations", label: "Operations", hint: "Jobs, evals, usage, keys" },
] as const;

export function useAdminCounts() {
  const fetchReviews = useServerFn(listReviews);
  const fetchRuns = useServerFn(listJobRuns);
  const reviewsQ = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: () => fetchReviews(),
    staleTime: 30_000,
  });
  const jobsQ = useQuery({
    queryKey: ["admin-job-runs"],
    queryFn: () => fetchRuns(),
    staleTime: 30_000,
  });
  const pending = (reviewsQ.data ?? []).filter((r: { status: string }) => r.status === "pending").length;
  const failing = (jobsQ.data ?? []).filter(
    (r: { status: string }) => r.status !== "ok" && r.status !== "success",
  ).length;
  return { pending, failing, loading: reviewsQ.isLoading || jobsQ.isLoading };
}

function AdminLayout() {
  const { isAdmin, loading } = useIsAdmin();
  const { pending, failing } = useAdminCounts();

  useEffect(() => {
    if (!loading) void logEvent("admin_console_view", { allowed: isAdmin });
  }, [loading, isAdmin]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Admin console</h1>

        {loading ? (
          <p className="mt-8 text-sm text-muted-foreground">Checking permissions…</p>
        ) : !isAdmin ? (
          <div className="mt-8 rounded-md border border-danger/40 bg-danger-soft p-6">
            <p className="text-sm font-semibold text-danger">Access denied</p>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">
              This console is restricted to accounts holding the admin role. Ask an existing admin to
              grant it, then reload this page.
            </p>
            <Link
              to="/dashboard"
              className="mt-6 inline-block rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Back to dashboard
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-8 md:grid-cols-[220px_1fr]">
            <nav aria-label="Admin sections" className="space-y-1">
              {ADMIN_GROUPS.map((g) => {
                const badge =
                  g.to === "/admin/quality" ? pending : g.to === "/admin/operations" ? failing : 0;
                return (
                  <Link
                    key={g.to}
                    to={g.to}
                    activeOptions={{ exact: "exact" in g ? g.exact : false }}
                    className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    activeProps={{ className: "bg-secondary font-medium text-foreground" }}
                  >
                    <span>{g.label}</span>
                    {badge > 0 && (
                      <span
                        className={[
                          "rounded px-1.5 py-0.5 font-mono text-xs",
                          g.to === "/admin/operations"
                            ? "bg-danger-soft text-danger"
                            : "bg-warning-soft text-warning",
                        ].join(" ")}
                      >
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
            <div className="min-w-0">
              <Outlet />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
