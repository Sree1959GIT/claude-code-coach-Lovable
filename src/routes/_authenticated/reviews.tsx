/**
 * Enhancement 2.0 — Phase C: dedicated human review workspace for drafts.
 * Every pending draft is shown in full (scenario, stem, options, explanations)
 * alongside its agentic provenance, and can only go live from here.
 */
import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { listDraftReviews, type DraftReviewItem } from "@/lib/authoring.functions";
import { resolveReview } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/reviews")({
  component: ReviewsPage,
  errorComponent: ({ error }) => (
    <div className="p-8 font-mono text-sm text-destructive">Review workspace error: {error.message}</div>
  ),
  head: () => ({
    meta: [
      { title: "Draft Review Queue · Claude Architect Prep" },
      {
        name: "description",
        content:
          "Human review workspace for drafted exam questions: inspect the stem, options, explanations and agent evidence before publishing.",
      },
      { property: "og:title", content: "Draft Review Queue · Claude Architect Prep" },
      {
        property: "og:description",
        content: "Approve or reject drafted certification questions with full agent provenance in view.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const btn =
  "border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-muted disabled:opacity-40";

type OriginFilter = "all" | "agentic" | "manual" | "ai";

function ReviewCard({ item }: { item: DraftReviewItem }) {
  const decide = useServerFn(resolveReview);
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: (status: "approved" | "rejected") =>
      decide({ data: { id: item.reviewId, status, notes: notes.trim() || null } }),
    onSuccess: (_r, status) => {
      toast.success(status === "approved" ? "Published to learners" : "Draft archived");
      void queryClient.invalidateQueries({ queryKey: ["draft-reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const hasOneCorrect = item.options.filter((o) => o.isCorrect).length === 1;
  const missingExplanations = item.options.filter((o) => !o.explanation?.trim()).length;

  return (
    <article className="border border-border bg-background p-5">
      <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>{item.domainTitle}</span>
        <span>{item.difficulty}</span>
        <span>origin: {item.origin}</span>
        <span>state: {item.questionStatus}</span>
        {item.reviewScore != null && <span>reviewer {item.reviewScore}/100</span>}
        {item.iteration != null && <span>iteration {item.iteration}</span>}
      </div>

      {item.scenario && <p className="mt-3 font-mono text-[11px] text-muted-foreground">{item.scenario}</p>}
      <h3 className="mt-2 text-sm font-medium">{item.stem}</h3>

      <ul className="mt-3 space-y-1">
        {item.options.map((o) => (
          <li key={o.id} className="font-mono text-[11px]">
            <span className={o.isCorrect ? "font-bold text-primary" : ""}>
              {o.label}. {o.text}
            </span>
            {o.explanation ? (
              <span className="text-muted-foreground"> — {o.explanation}</span>
            ) : (
              <span className="text-destructive"> — missing explanation</span>
            )}
          </li>
        ))}
      </ul>

      <ul className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest">
        <li className={`border border-border px-2 py-1 ${hasOneCorrect ? "text-foreground" : "text-destructive"}`}>
          {hasOneCorrect ? "single correct" : "correct-answer problem"}
        </li>
        <li
          className={`border border-border px-2 py-1 ${missingExplanations === 0 ? "text-foreground" : "text-destructive"}`}
        >
          {missingExplanations === 0 ? "all explained" : `${missingExplanations} unexplained`}
        </li>
        <li className="border border-border px-2 py-1 text-muted-foreground">{item.options.length} options</li>
      </ul>

      {item.rationale && (
        <p className="mt-3 font-mono text-[11px] text-muted-foreground">Setter rationale: {item.rationale}</p>
      )}
      {item.reviewNotes && (
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">Reviewer notes: {item.reviewNotes}</p>
      )}
      {item.notes && <p className="mt-1 font-mono text-[11px] text-muted-foreground">Queue note: {item.notes}</p>}
      {item.citations.length > 0 && (
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
          Evidence: {item.citations.slice(0, 4).map((c) => c.title).join("; ")}
        </p>
      )}
      {item.runId && (
        <Link
          to="/traces"
          className="mt-1 inline-block font-mono text-[10px] uppercase tracking-widest underline"
        >
          View_Agent_Trace
        </Link>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Decision note (optional)"
          className="min-w-[14rem] flex-1 border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
        />
        <button className={btn} disabled={mutation.isPending} onClick={() => mutation.mutate("approved")}>
          Approve_And_Publish
        </button>
        <button className={btn} disabled={mutation.isPending} onClick={() => mutation.mutate("rejected")}>
          Reject
        </button>
      </div>
    </article>
  );
}

function ReviewsPage() {
  const load = useServerFn(listDraftReviews);
  const [filter, setFilter] = useState<OriginFilter>("all");

  const { data = [], isLoading, error } = useQuery({ queryKey: ["draft-reviews"], queryFn: () => load({}) });

  const items = useMemo(
    () => (filter === "all" ? data : data.filter((d) => d.origin === filter || d.source === filter)),
    [data, filter],
  );

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-mono text-lg font-bold uppercase tracking-tight">Draft_Review_Queue</h1>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          Drafts stay invisible to learners until approved here. Approving publishes the question; rejecting archives
          it.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {(["all", "agentic", "ai", "manual"] as OriginFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`${btn} ${filter === f ? "bg-muted" : ""}`}
            >
              {f}
            </button>
          ))}
          <Link to="/admin" className={btn}>
            Admin_Console
          </Link>
        </div>

        {isLoading && <p className="mt-6 font-mono text-xs text-muted-foreground">Loading drafts…</p>}
        {error && <p className="mt-6 font-mono text-xs text-destructive">{(error as Error).message}</p>}
        {!isLoading && !error && items.length === 0 && (
          <p className="mt-6 font-mono text-xs text-muted-foreground">Nothing awaiting review.</p>
        )}

        <div className="mt-6 space-y-5">
          {items.map((item) => (
            <ReviewCard key={item.reviewId} item={item} />
          ))}
        </div>
      </main>
    </div>
  );
}
