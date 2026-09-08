/**
 * Phase E8 — turn the Study Canvas advice matrices (Phase E7) into mentor
 * prompt material, so conversational depth adapts to how much structured
 * guidance the active code example carries.
 */

import { normalizeAdvice, type CodeAdvice } from "@/lib/advice";

export type AdviceDepth = "none" | "light" | "deep";

/** How rich the attached advice is — drives how far the mentor may go. */
export function adviceDepth(advice: CodeAdvice): AdviceDepth {
  const signals =
    advice.walkthrough.length +
    advice.tradeoffs.length +
    advice.misconceptions.length +
    (advice.summary ? 1 : 0);
  if (signals === 0) return "none";
  return signals >= 5 ? "deep" : "light";
}

const DEPTH_DIRECTIVE: Record<AdviceDepth, string> = {
  none: "No worked code example is attached. Keep the explanation conceptual and compact (3-4 sentences), and avoid inventing code specifics.",
  light:
    "A worked code example with partial advice notes is attached. Reference it briefly when it clarifies the concept, but stay concise (3-5 sentences).",
  deep: "A worked code example with a full advice breakdown is attached. Teach at greater depth (5-7 sentences): cite the concrete lines or design tradeoffs by name, correct the listed misconceptions when the learner drifts toward them, and end the written part with one of the listed follow-up questions when it fits naturally.",
};

/**
 * Build the system message describing the attached advice matrices, or `null`
 * when nothing useful is attached.
 */
export function adviceSystemMessage(value: unknown): {
  content: string;
  depth: AdviceDepth;
} | null {
  const advice = normalizeAdvice(value);
  const depth = adviceDepth(advice);
  if (depth === "none") return null;

  const lines: string[] = [
    "Attached code-example advice (from the learner's Study Canvas). Use it to ground concrete answers; never paste it verbatim.",
  ];
  if (advice.summary) lines.push(`Summary: ${advice.summary}`);

  if (advice.walkthrough.length) {
    lines.push("Line-by-line walkthrough:");
    for (const s of advice.walkthrough.slice(0, 12)) {
      const span = s.endLine > s.line ? `${s.line}-${s.endLine}` : `${s.line}`;
      lines.push(
        `  L${span}${s.file ? ` (${s.file})` : ""}${s.label ? ` ${s.label}:` : ":"} ${s.explanation}`,
      );
    }
  }
  if (advice.tradeoffs.length) {
    lines.push("Design tradeoffs:");
    for (const t of advice.tradeoffs.slice(0, 6)) {
      lines.push(`  ${t.decision}: chose ${t.chosen} over ${t.alternative} — ${t.why}`);
    }
  }
  if (advice.misconceptions.length) {
    lines.push("Common misconceptions to correct:");
    for (const m of advice.misconceptions.slice(0, 6)) {
      lines.push(`  Myth: ${m.claim} | Reality: ${m.reality}`);
    }
  }
  if (advice.conceptLinks.length) {
    lines.push(`Related concepts: ${advice.conceptLinks.join(", ")}`);
  }
  if (advice.followUps.length) {
    lines.push(`Follow-up questions you may ask: ${advice.followUps.join(" | ")}`);
  }

  lines.push(DEPTH_DIRECTIVE[depth]);
  return { content: lines.join("\n").slice(0, 6000), depth };
}

/** Depth directive on its own, for callers that only need the pacing rule. */
export function adviceDepthDirective(value: unknown): string {
  const depth = adviceDepth(normalizeAdvice(value));
  return DEPTH_DIRECTIVE[depth];
}
