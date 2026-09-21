/** S5 — Admin › Operations: jobs, evals, usage and keys. */

import { createFileRoute } from "@tanstack/react-router";
import { JobsPanel, EvalsPanel } from "@/components/admin/CorePanels";
import { AdminSection } from "@/components/admin/AdminSection";
import { UsagePanel } from "@/components/admin/UsagePanel";
import { ByokPanel } from "@/components/admin/ByokPanel";

export const Route = createFileRoute("/_authenticated/admin/operations")({
  component: OperationsGroup,
});

function OperationsGroup() {
  return (
    <div>
      <AdminSection
        title="Scheduled jobs"
        blurb="Library re-index history from the cron endpoint, plus a manual trigger."
      >
        <JobsPanel />
      </AdminSection>

      <AdminSection
        title="Agent evals"
        blurb="Replay the golden prompt set through the live agent path and score each answer with the critic."
      >
        <EvalsPanel />
      </AdminSection>

      <AdminSection
        title="AI usage board"
        blurb="What the AI actually costs: cache hit rate and credits saved by reused answers, spend and token volume per task and model, and the concepts learners ask for most."
      >
        <UsagePanel />
      </AdminSection>

      <AdminSection
        title="Key vault"
        blurb="Store your own Anthropic or Google keys. They are encrypted before saving, verified against the provider, and only ever shown as the last four characters."
      >
        <ByokPanel />
      </AdminSection>
    </div>
  );
}
