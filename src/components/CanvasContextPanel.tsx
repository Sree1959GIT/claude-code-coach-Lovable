/**
 * Phase E9 — Docs section of the Study Canvas: the active question context
 * profile, FSRS metrics for that question, concept links and doc references.
 */

import { ExternalLink } from "lucide-react";
import type { LearnResource } from "@/lib/resources";
import {
  formatDue,
  retrievability,
  type CanvasFsrs,
  type CanvasQuestionContext,
} from "@/lib/canvas-context";
import type { CodeAdvice } from "@/lib/advice";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1">
      <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="truncate text-right text-[11px]">{value}</span>
    </div>
  );
}

export function CanvasContextPanel({
  context,
  fsrs,
  fsrsLoading,
  advice,
  docs,
}: {
  context?: CanvasQuestionContext | null;
  fsrs?: CanvasFsrs | null;
  fsrsLoading?: boolean;
  advice?: CodeAdvice | null;
  docs: LearnResource[];
}) {
  const r = fsrs ? retrievability(fsrs) : null;

  return (
    <div className="space-y-4 p-3">
      <section>
        <h3 className="mb-1 font-mono text-[9px] uppercase tracking-[0.3em] text-primary">
          Question_Context
        </h3>
        {context ? (
          <div>
            <Row label="Domain" value={context.domain ?? "—"} />
            <Row label="Item" value={`Q${context.index}/${context.total}`} />
            <Row label="Concept" value={context.keyConcept ?? "—"} />
            <Row label="Concept_Tag" value={context.conceptTag ?? "—"} />
            <Row label="Difficulty" value={context.difficulty ?? "—"} />
            <Row
              label="Selection"
              value={
                context.selectedOption
                  ? `${context.selectedOption}${context.revealed ? " · revealed" : ""}`
                  : "None"
              }
            />
          </div>
        ) : (
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            No_Active_Question
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-1 font-mono text-[9px] uppercase tracking-[0.3em] text-primary">
          FSRS_Metrics
        </h3>
        {fsrsLoading ? (
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Loading…
          </p>
        ) : fsrs ? (
          <div>
            <Row label="Status" value={fsrs.status} />
            <Row label="Next_Review" value={formatDue(fsrs.dueAt)} />
            <Row label="Stability" value={`${fsrs.stability.toFixed(2)}d`} />
            <Row label="Difficulty" value={fsrs.difficulty.toFixed(1)} />
            <Row label="Reps · Lapses" value={`${fsrs.reps} · ${fsrs.lapses}`} />
            <Row
              label="Retrievability"
              value={r === null ? "—" : `${Math.round(r * 100)}%`}
            />
            <Row
              label="Last_Attempt"
              value={
                fsrs.lastAttemptCorrect === null
                  ? "—"
                  : fsrs.lastAttemptCorrect
                    ? "Correct"
                    : "Incorrect"
              }
            />
          </div>
        ) : (
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Not_Yet_Scheduled — answer this question to start tracking.
          </p>
        )}
      </section>

      {advice && advice.conceptLinks.length > 0 && (
        <section>
          <h3 className="mb-1 font-mono text-[9px] uppercase tracking-[0.3em] text-primary">
            Concept_Links
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {advice.conceptLinks.map((c, i) => (
              <li
                key={i}
                className="border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground"
              >
                {c}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-1 font-mono text-[9px] uppercase tracking-[0.3em] text-primary">
          Reference_Docs
        </h3>
        {docs.length === 0 ? (
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            No_Docs_Matched
          </p>
        ) : (
          <ul className="space-y-1">
            {docs.map((d) => (
              <li key={d.url}>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-2 border border-border px-2 py-1.5 text-[11px] hover:border-primary"
                >
                  <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block truncate">{d.title}</span>
                    <span className="block font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      {d.source}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
