/** S5 — Admin › Learners. */

import { createFileRoute } from "@tanstack/react-router";
import { LearnersTable } from "@/components/admin/CorePanels";
import { AdminSection } from "@/components/admin/AdminSection";

export const Route = createFileRoute("/_authenticated/admin/learners")({
  component: () => (
    <AdminSection
      title="Learners"
      blurb="Every account with attempts, accuracy, tracked cards and last activity. Roles and membership tiers are set here."
    >
      <LearnersTable />
    </AdminSection>
  ),
});
