/** S5 — Admin › Quality: review queue and content audits. */

import { createFileRoute, Link } from "@tanstack/react-router";
import { ReviewQueue } from "@/components/admin/CorePanels";
import { AdminSection } from "@/components/admin/AdminSection";
import { DuplicatePanel } from "@/components/admin/DuplicatePanel";
import { DistractorPanel } from "@/components/admin/DistractorPanel";
import { EnrichPanel } from "@/components/admin/EnrichPanel";
import { CitationPanel } from "@/components/admin/CitationPanel";
import { CalibrationPanel } from "@/components/admin/CalibrationPanel";
import { ParityPanel } from "@/components/admin/ParityPanel";

export const Route = createFileRoute("/_authenticated/admin/quality")({
  component: QualityGroup,
});

function QualityGroup() {
  return (
    <div>
      <section className="mb-12">
        <h2 className="text-lg font-semibold tracking-tight">Review queue</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Drafted or flagged questions awaiting a human decision. Approve or reject with an optional
          note, or open the{" "}
          <Link to="/reviews" className="text-primary underline">
            full review workspace
          </Link>{" "}
          to inspect each draft with its agent evidence.
        </p>
        <ReviewQueue />
      </section>

      <AdminSection
        title="Duplicate detector"
        blurb="Embeds every question and flags near-duplicate pairs above the chosen cosine-similarity threshold. Vectors are cached and only re-embedded when the text changes."
      >
        <DuplicatePanel />
      </AdminSection>

      <AdminSection
        title="Distractor audit"
        blurb="Flags distractors nobody picks, distractors chosen more often than the threshold, and any option missing an explanation."
      >
        <DistractorPanel />
      </AdminSection>

      <AdminSection
        title="Explanation enrichment"
        blurb="Drafts grounded, cited explanations for options missing one. Review the drafts first, then approve to write them back."
      >
        <EnrichPanel />
      </AdminSection>

      <AdminSection
        title="Citation coverage"
        blurb="Share of questions per domain with at least one linked library chunk. Refresh links to recompute semantic citations against the current library."
      >
        <CitationPanel />
      </AdminSection>

      <AdminSection
        title="Difficulty calibration"
        blurb="Recomputes each question's difficulty band from live first-attempt accuracy. Preview first, then apply."
      >
        <CalibrationPanel />
      </AdminSection>

      <AdminSection
        title="Coverage parity"
        blurb="Maps the live question bank against the blueprint weights: which domains are under-served, by how many questions, and how their difficulty mix and citations stack up."
      >
        <ParityPanel />
      </AdminSection>
    </div>
  );
}
