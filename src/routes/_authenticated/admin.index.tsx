/** S5 — Admin overview: what needs a human today. */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useAdminCounts } from "./admin";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminOverview,
});

function AdminOverview() {
  const { pending, failing, loading } = useAdminCounts();

  return (
    <div>
      <h2 className="text-lg font-semibold">What needs a human today</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Everything else is grouped in the rail — nothing here is a dead end.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card
          title="Drafts awaiting review"
          value={loading ? "…" : String(pending)}
          tone={pending > 0 ? "warning" : "ok"}
          to="/admin/quality"
          action="Open review queue"
        />
        <Card
          title="Job runs needing attention"
          value={loading ? "…" : String(failing)}
          tone={failing > 0 ? "danger" : "ok"}
          to="/admin/operations"
          action="Open operations"
        />
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Shortcut to="/reviews" label="Full review workspace" hint="Inspect each draft with its agent evidence" />
        <Shortcut to="/admin/content" label="Author a question" hint="Manual editor or the agentic drafting loop" />
        <Shortcut to="/admin/retrieval" label="Crawl and corpus health" hint="Spider desk and defrag sweep" />
        <Shortcut to="/admin/learners" label="Learners" hint="Roles, tiers and activity" />
      </div>
    </div>
  );
}

function Card(props: {
  title: string;
  value: string;
  tone: "ok" | "warning" | "danger";
  to: string;
  action: string;
}) {
  const tone =
    props.tone === "danger"
      ? "text-danger"
      : props.tone === "warning"
        ? "text-warning"
        : "text-success";
  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="text-sm text-muted-foreground">{props.title}</div>
      <div className={`mt-2 font-mono text-4xl font-bold tabular-nums ${tone}`}>{props.value}</div>
      <Link to={props.to} className="mt-4 inline-block text-sm text-primary hover:underline">
        {props.action} →
      </Link>
    </div>
  );
}

function Shortcut(props: { to: string; label: string; hint: string }) {
  return (
    <Link
      to={props.to}
      className="rounded-md border border-border bg-card p-4 transition-colors hover:border-primary"
    >
      <div className="text-sm font-medium">{props.label}</div>
      <div className="mt-1 text-xs text-muted-foreground">{props.hint}</div>
    </Link>
  );
}
