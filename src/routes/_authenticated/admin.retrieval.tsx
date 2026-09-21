/** S5 — Admin › Retrieval: crawl sources and corpus hygiene. */

import { createFileRoute } from "@tanstack/react-router";
import { AdminSection } from "@/components/admin/AdminSection";
import { SpiderPanel } from "@/components/admin/SpiderPanel";
import { DefragPanel } from "@/components/admin/DefragPanel";
import { ImportLogsPanel } from "@/components/admin/ImportLogsPanel";

export const Route = createFileRoute("/_authenticated/admin/retrieval")({
  component: RetrievalGroup,
});

function RetrievalGroup() {
  return (
    <div>
      <AdminSection
        title="Spider control desk"
        blurb="Catalogue the source pages worth re-checking, set how often each is re-crawled, and see when each was last fetched and what came back. Crawls reuse stored credentials and feed the library."
      >
        <SpiderPanel />
      </AdminSection>

      <AdminSection
        title="Corpus defrag"
        blurb="Consolidates fragmented library sections, strips empty structural leftovers, and re-embeds whatever changed. Run the dry run first, then apply."
      >
        <DefragPanel />
      </AdminSection>

      <AdminSection
        title="Import logs"
        blurb="Every bulk submission with its per-row status and diagnostic message."
      >
        <ImportLogsPanel />
      </AdminSection>
    </div>
  );
}
