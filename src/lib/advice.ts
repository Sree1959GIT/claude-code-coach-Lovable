/**
 * Phase E7 — structured advice breakdown matrices for a code example.
 *
 * The documentation agent emits prose; this module defines the *structured*
 * counterpart the UI renders as matrices: a line-by-line walkthrough, design
 * tradeoffs, misconception checks, concept linkages and follow-up questions.
 * Client-safe: types plus defensive normalisation of the stored jsonb payload.
 */

export type AdviceWalkStep = {
  /** File the step refers to. */
  file: string;
  /** First line of the referenced span (1-based). */
  line: number;
  /** Last line of the span; equals `line` for a single line. */
  endLine: number;
  /** Short label, e.g. "Build the message list". */
  label: string;
  /** What the code does and why it matters here. */
  explanation: string;
};

export type AdviceTradeoff = {
  decision: string;
  chosen: string;
  alternative: string;
  why: string;
};

export type AdviceMisconception = {
  /** What learners commonly believe. */
  claim: string;
  /** What is actually true. */
  reality: string;
  /** A quick self-check question that exposes the mistake. */
  check: string;
};

export type CodeAdvice = {
  summary: string;
  walkthrough: AdviceWalkStep[];
  tradeoffs: AdviceTradeoff[];
  misconceptions: AdviceMisconception[];
  conceptLinks: string[];
  followUps: string[];
};

export const EMPTY_ADVICE: CodeAdvice = {
  summary: "",
  walkthrough: [],
  tradeoffs: [],
  misconceptions: [],
  conceptLinks: [],
  followUps: [],
};

const str = (v: unknown, max = 1200): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

const strList = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? v
        .map((x) => str(x, 400))
        .filter(Boolean)
        .slice(0, max)
    : [];

const int = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1;
};

/** Coerce any stored/model payload into a safe `CodeAdvice`. */
export function normalizeAdvice(value: unknown): CodeAdvice {
  if (!value || typeof value !== "object") return EMPTY_ADVICE;
  const raw = value as Record<string, unknown>;

  const walkthrough: AdviceWalkStep[] = (Array.isArray(raw.walkthrough) ? raw.walkthrough : [])
    .slice(0, 40)
    .map((entry) => {
      const e = (entry ?? {}) as Record<string, unknown>;
      const line = int(e.line);
      const endRaw = e.endLine ?? e.end_line ?? line;
      const endLine = Math.max(line, int(endRaw));
      return {
        file: str(e.file, 200),
        line,
        endLine,
        label: str(e.label, 200),
        explanation: str(e.explanation, 1200),
      };
    })
    .filter((s) => s.explanation.length > 0);

  const tradeoffs: AdviceTradeoff[] = (Array.isArray(raw.tradeoffs) ? raw.tradeoffs : [])
    .slice(0, 12)
    .map((entry) => {
      const e = (entry ?? {}) as Record<string, unknown>;
      return {
        decision: str(e.decision, 300),
        chosen: str(e.chosen, 600),
        alternative: str(e.alternative, 600),
        why: str(e.why, 800),
      };
    })
    .filter((t) => t.decision.length > 0);

  const misconceptions: AdviceMisconception[] = (
    Array.isArray(raw.misconceptions) ? raw.misconceptions : []
  )
    .slice(0, 12)
    .map((entry) => {
      const e = (entry ?? {}) as Record<string, unknown>;
      return {
        claim: str(e.claim, 400),
        reality: str(e.reality, 800),
        check: str(e.check, 400),
      };
    })
    .filter((m) => m.claim.length > 0);

  return {
    summary: str(raw.summary, 1500),
    walkthrough,
    tradeoffs,
    misconceptions,
    conceptLinks: strList(raw.conceptLinks ?? raw.concept_links, 10),
    followUps: strList(raw.followUps ?? raw.follow_ups, 8),
  };
}

/** True when there is anything worth showing in the advice panel. */
export function hasAdvice(advice: CodeAdvice | null | undefined): boolean {
  if (!advice) return false;
  return (
    advice.summary.length > 0 ||
    advice.walkthrough.length > 0 ||
    advice.tradeoffs.length > 0 ||
    advice.misconceptions.length > 0
  );
}
