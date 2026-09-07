/**
 * Phase E7 — advice breakdown matrices rendered inside the Study Canvas:
 * a line-by-line code walk, a design-tradeoff matrix, misconception checks,
 * concept linkages and follow-up questions.
 */

import { BookOpen, GitBranch, HelpCircle, Lightbulb, Link2 } from "lucide-react";
import type { CodeAdvice } from "@/lib/advice";

const HEAD =
  "flex items-center gap-1.5 border-b border-border pb-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground";

export function AdviceMatrix({
  advice,
  activeFile,
  onJumpToLine,
}: {
  advice: CodeAdvice;
  activeFile?: string;
  onJumpToLine?: (line: number) => void;
}) {
  const walk = advice.walkthrough;

  return (
    <div className="space-y-5 px-3 py-3 text-[11px] leading-relaxed">
      {advice.summary && (
        <section className="space-y-1.5">
          <h3 className={HEAD}>
            <BookOpen className="h-3 w-3" /> Advice · Summary
          </h3>
          <p className="text-foreground">{advice.summary}</p>
        </section>
      )}

      {walk.length > 0 && (
        <section className="space-y-1.5">
          <h3 className={HEAD}>
            <BookOpen className="h-3 w-3" /> Line_By_Line · {walk.length} steps
          </h3>
          <ol className="divide-y divide-border border border-border">
            {walk.map((step, i) => {
              const span =
                step.endLine > step.line ? `${step.line}–${step.endLine}` : `${step.line}`;
              const sameFile = !activeFile || !step.file || step.file === activeFile;
              return (
                <li key={i} className="grid grid-cols-[auto_1fr] gap-3 p-2">
                  <button
                    type="button"
                    onClick={sameFile ? () => onJumpToLine?.(step.line) : undefined}
                    disabled={!sameFile || !onJumpToLine}
                    title={
                      sameFile ? `Jump to line ${step.line}` : `${step.file} · line ${span}`
                    }
                    className="h-fit shrink-0 border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground transition-colors enabled:hover:border-primary enabled:hover:text-foreground disabled:opacity-60"
                  >
                    L{span}
                  </button>
                  <div>
                    {step.label && (
                      <p className="font-mono text-[10px] uppercase tracking-widest text-foreground">
                        {step.label}
                      </p>
                    )}
                    <p className="text-muted-foreground">{step.explanation}</p>
                    {!sameFile && step.file && (
                      <p className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                        in {step.file}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {advice.tradeoffs.length > 0 && (
        <section className="space-y-1.5">
          <h3 className={HEAD}>
            <GitBranch className="h-3 w-3" /> Design_Tradeoffs
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-border text-left">
              <thead>
                <tr className="bg-muted/40 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  <th className="border border-border px-2 py-1">Decision</th>
                  <th className="border border-border px-2 py-1">Chosen</th>
                  <th className="border border-border px-2 py-1">Alternative</th>
                  <th className="border border-border px-2 py-1">Why</th>
                </tr>
              </thead>
              <tbody>
                {advice.tradeoffs.map((t, i) => (
                  <tr key={i} className="align-top">
                    <td className="border border-border px-2 py-1 text-foreground">
                      {t.decision}
                    </td>
                    <td className="border border-border px-2 py-1 text-muted-foreground">
                      {t.chosen}
                    </td>
                    <td className="border border-border px-2 py-1 text-muted-foreground">
                      {t.alternative}
                    </td>
                    <td className="border border-border px-2 py-1 text-muted-foreground">
                      {t.why}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {advice.misconceptions.length > 0 && (
        <section className="space-y-1.5">
          <h3 className={HEAD}>
            <Lightbulb className="h-3 w-3" /> Misconception_Checks
          </h3>
          <ul className="space-y-2">
            {advice.misconceptions.map((m, i) => (
              <li key={i} className="border-l-2 border-primary/50 pl-2">
                <p className="text-muted-foreground">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-destructive">
                    Myth
                  </span>{" "}
                  {m.claim}
                </p>
                <p className="text-foreground">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-primary">
                    Reality
                  </span>{" "}
                  {m.reality}
                </p>
                {m.check && (
                  <p className="text-muted-foreground">
                    <span className="font-mono text-[9px] uppercase tracking-widest">Check</span>{" "}
                    {m.check}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {advice.conceptLinks.length > 0 && (
        <section className="space-y-1.5">
          <h3 className={HEAD}>
            <Link2 className="h-3 w-3" /> Concept_Linkages
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {advice.conceptLinks.map((c, i) => (
              <span
                key={i}
                className="border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground"
              >
                {c}
              </span>
            ))}
          </div>
        </section>
      )}

      {advice.followUps.length > 0 && (
        <section className="space-y-1.5">
          <h3 className={HEAD}>
            <HelpCircle className="h-3 w-3" /> Follow_Up_Questions
          </h3>
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            {advice.followUps.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
