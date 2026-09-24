/** S5 — Admin › Content: authoring, bulk import, generation. */

import { createFileRoute } from "@tanstack/react-router";
import { AuthoringSection } from "@/components/admin/CorePanels";
import { AdminSection } from "@/components/admin/AdminSection";
import { BulkImportPanel } from "@/components/admin/BulkImportPanel";
import { AiGeneratePanel } from "@/components/admin/AiGeneratePanel";
import { CodeGenPanel } from "@/components/admin/CodeGenPanel";
import { CreateExamWizard } from "@/components/admin/CreateExamWizard";

export const Route = createFileRoute("/_authenticated/admin/content")({
  component: ContentGroup,
});

function ContentGroup() {
  return (
    <div>
      <AdminSection
        title="Create an exam"
        blurb="Name a new exam, then lay out its study areas with weights and where each came from. It is saved as a draft that learners can't see."
      >
        <CreateExamWizard />
      </AdminSection>

      <AdminSection
        title="Authoring"
        blurb="Domains and their questions, with option health and live difficulty from real attempts. Manual authoring is the default; switch to Agentic to run the drafting loop."
      >
        <AuthoringSection />
      </AdminSection>

      <AdminSection
        title="Bulk import"
        blurb="Paste or upload CSV/JSON questions, validate them against the blueprint domains with a dry run, then commit. Duplicate stems are flagged and skipped by default."
      >
        <BulkImportPanel />
      </AdminSection>

      <AdminSection
        title="AI question generator"
        blurb="Draft blueprint-aligned questions grounded in retrieved library chunks. Preview first, then queue them into the review queue for a human decision."
      >
        <AiGeneratePanel />
      </AdminSection>

      <AdminSection
        title="Code generation"
        blurb="Runs the four-agent code example loop and streams each agent's live status. Verified examples are saved to the shared codebase library."
      >
        <CodeGenPanel />
      </AdminSection>
    </div>
  );
}
