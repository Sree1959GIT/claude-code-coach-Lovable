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

type EditableOption = { id: string | null; label: string; text: string; isCorrect: boolean; explanation: string | null };

function ReviewCard({ item }: { item: DraftReviewItem }) {
  const decide = useServerFn(resolveReview);
  const decideRevision = useServerFn(resolveDraftRevision);
  const saveEdits = useServerFn(updateDraftQuestion);
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState(false);

  const source = item.proposed ?? {
    scenario: item.scenario,
    stem: item.stem,
    keyConcept: item.keyConcept,
    difficulty: item.difficulty,
    options: item.options.map((o) => ({
      id: o.id,
      label: o.label,
      text: o.text,
      isCorrect: o.isCorrect,
      explanation: o.explanation,
    })),
  };

  const [draft, setDraft] = useState({
    scenario: source.scenario ?? "",
    stem: source.stem,
    keyConcept: source.keyConcept ?? "",
    difficulty: (["easy", "medium", "hard"].includes(source.difficulty) ? source.difficulty : "medium") as
      | "easy"
      | "medium"
      | "hard",
    options: source.options.map((o: any) => ({
      id: o.id ?? null,
      label: o.label,
      text: o.text,
      isCorrect: o.isCorrect,
      explanation: o.explanation ?? null,
    })) as EditableOption[],
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["draft-reviews"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
  };

  const editPayload = () => ({
    questionId: item.questionId,
    scenario: draft.scenario.trim() || null,
    stem: draft.stem.trim(),
    keyConcept: draft.keyConcept.trim() || null,
    difficulty: draft.difficulty,
    options: draft.options.map((o) => ({
      id: o.id,
      label: o.label,
      text: o.text,
      isCorrect: o.isCorrect,
      explanation: o.explanation?.trim() || null,
    })),
  });

  const saveMutation = useMutation({
    mutationFn: () => saveEdits({ data: editPayload() }),
    onSuccess: () => {
      toast.success("Draft updated");
      setEditing(false);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const mutation = useMutation({
    mutationFn: (status: "approved" | "rejected") =>
      item.kind === "revision"
        ? decideRevision({
            data: {
              draftId: item.draftId!,
              decision: status,
              notes: notes.trim() || null,
              edits: status === "approved" ? editPayload() : null,
            },
          })
        : decide({ data: { id: item.reviewId, status, notes: notes.trim() || null } }),
    onSuccess: (_r, status) => {
      toast.success(
        status === "approved"
          ? item.kind === "revision"
            ? "Revision applied to the live question"
            : "Published to learners"
          : item.kind === "revision"
            ? "Revision rejected"
            : "Draft archived",
      );
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const hasOneCorrect = draft.options.filter((o) => o.isCorrect).length === 1;
  const missingExplanations = draft.options.filter((o) => !o.explanation?.trim()).length;
  const input =
    "w-full border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground";

  return (
    <article className="border border-border bg-background p-5">
      <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>{item.domainTitle}</span>
        <span>{draft.difficulty}</span>
        <span>origin: {item.origin}</span>
        <span>state: {item.questionStatus}</span>
        <span className={item.kind === "revision" ? "text-primary" : ""}>{item.kind}</span>
        {item.reviewScore != null && <span>reviewer {item.reviewScore}/100</span>}
        {item.iteration != null && <span>iteration {item.iteration}</span>}
      </div>

      {item.kind === "revision" && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="border border-border p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Live_Question</p>
            {item.scenario && <p className="mt-1 font-mono text-[11px] text-muted-foreground">{item.scenario}</p>}
            <p className="mt-1 text-sm">{item.stem}</p>
            <ul className="mt-2 space-y-1">
              {item.options.map((o) => (
                <li key={o.id} className="font-mono text-[11px]">
                  <span className={o.isCorrect ? "font-bold text-primary" : ""}>
                    {o.label}. {o.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="border border-border p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Proposed_Revision · {item.diff.length} field change(s)
            </p>
            <ul className="mt-1 space-y-1">
              {item.diff.map((f, i) => (
                <li key={i} className="font-mono text-[11px]">
                  <span className="uppercase tracking-widest text-muted-foreground">{f.field}</span>
                  <div className="text-destructive">− {f.before || "(empty)"}</div>
                  <div className="text-primary">+ {f.after || "(empty)"}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {editing ? (
        <div className="mt-3 space-y-2">
          <input
            className={input}
            value={draft.scenario}
            placeholder="Scenario (optional)"
            onChange={(e) => setDraft((d) => ({ ...d, scenario: e.target.value }))}
          />
          <textarea
            className={`${input} min-h-[4rem]`}
            value={draft.stem}
            onChange={(e) => setDraft((d) => ({ ...d, stem: e.target.value }))}
          />
          <div className="flex flex-wrap gap-2">
            <input
              className={`${input} max-w-[16rem]`}
              value={draft.keyConcept}
              placeholder="Key concept"
              onChange={(e) => setDraft((d) => ({ ...d, keyConcept: e.target.value }))}
            />
            <select
              className={`${input} max-w-[8rem]`}
              value={draft.difficulty}
              onChange={(e) => setDraft((d) => ({ ...d, difficulty: e.target.value as typeof d.difficulty }))}
            >
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
            </select>
          </div>
          {draft.options.map((o, i) => (
            <div key={o.label} className="space-y-1 border border-border p-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-bold">{o.label}</span>
                <input
                  className={input}
                  value={o.text}
                  onChange={(e) =>
                    setDraft((d) => {
                      const options = [...d.options];
                      options[i] = { ...options[i]!, text: e.target.value };
                      return { ...d, options };
                    })
                  }
                />
                <label className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <input
                    type="radio"
                    name={`correct-${item.reviewId}`}
                    checked={o.isCorrect}
                    onChange={() =>
                      setDraft((d) => ({
                        ...d,
                        options: d.options.map((x, k) => ({ ...x, isCorrect: k === i })),
                      }))
                    }
                  />
                  correct
                </label>
              </div>
              <input
                className={input}
                value={o.explanation ?? ""}
                placeholder="Explanation"
                onChange={(e) =>
                  setDraft((d) => {
                    const options = [...d.options];
                    options[i] = { ...options[i]!, explanation: e.target.value };
                    return { ...d, options };
                  })
                }
              />
            </div>
          ))}
        </div>
      ) : (
        item.kind !== "revision" && (
          <>
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
          </>
        )
      )}

      <ul className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest">
        <li className={`border border-border px-2 py-1 ${hasOneCorrect ? "text-foreground" : "text-destructive"}`}>
          {hasOneCorrect ? "single correct" : "correct-answer problem"}
        </li>
        <li
          className={`border border-border px-2 py-1 ${missingExplanations === 0 ? "text-foreground" : "text-destructive"}`}
        >
          {missingExplanations === 0 ? "all explained" : `${missingExplanations} unexplained`}
        </li>
        <li className="border border-border px-2 py-1 text-muted-foreground">{draft.options.length} options</li>
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
        <button className={btn} onClick={() => setEditing((v) => !v)}>
          {editing ? "Close_Editor" : "Edit_Inline"}
        </button>
        {editing && item.kind === "new" && (
          <button className={btn} disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            Save_Edits
          </button>
        )}
        <button
          className={btn}
          disabled={mutation.isPending || !hasOneCorrect}
          onClick={() => mutation.mutate("approved")}
        >
          {item.kind === "revision" ? "Approve_And_Apply" : "Approve_And_Publish"}
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
