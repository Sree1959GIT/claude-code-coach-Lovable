/**
 * Sub-task 12 — Critic agent.
 * Server-only. Runs AFTER the answer has finished streaming to the learner, so
 * it never adds latency. It audits the accumulated answer deterministically
 * (zero model cost) and records the verdict as the final step of the run:
 *   - format contract: is the [[brief]] spoken part present?
 *   - highlight markers: did the spoken part carry sync markers?
 *   - answer leakage: did an "explain the question" turn reveal the key?
 *   - grounding: were retrieved passages actually used?
 * Never throws.
 */

import { logStep, type AgentIntent, type Db } from "../orchestrator.server";

export type CriticIssue = {
  code: "missing_brief" | "missing_markers" | "answer_leak" | "ungrounded" | "too_short";
  severity: "warn" | "error";
  detail: string;
};

export type CriticVerdict = {
  score: number; // 0-100
  issues: CriticIssue[];
  error: string | null;
};

export type CriticArgs = {
  answer: string;
  intent?: AgentIntent;
  /** Number of library passages handed to the answering agent. */
  retrievedCount?: number;
  /** Whether the learner has already submitted an answer for this question. */
  answerRevealed?: boolean;
  trace?: { db: Db; runId: string | null; userId: string; stepIndex: number };
};

const LEAK_PATTERNS = [
  /\bthe correct (answer|option|choice) is\b/i,
  /\boption [a-d] is (the )?correct\b/i,
  /\bthe answer is [a-d]\b/i,
];

/** Deterministic audit of a finished mentor answer. */
export function critique(args: Omit<CriticArgs, "trace">): CriticVerdict {
  const answer = (args.answer ?? "").trim();
  const issues: CriticIssue[] = [];

  if (answer.length < 40) {
    issues.push({ code: "too_short", severity: "error", detail: `Answer was only ${answer.length} chars.` });
  }

  const briefIdx = answer.indexOf("[[brief]]");
  const spoken = briefIdx === -1 ? "" : answer.slice(briefIdx + 9);

  if (args.intent !== "smalltalk") {
    if (briefIdx === -1) {
      issues.push({ code: "missing_brief", severity: "warn", detail: "No [[brief]] spoken summary was emitted." });
    } else if (!/\[\[(scenario|stem|opt:[a-z]|none)\]\]/i.test(spoken)) {
      issues.push({
        code: "missing_markers",
        severity: "warn",
        detail: "Spoken summary carried no highlight markers, so nothing blinks in the question pane.",
      });
    }
  }

  if (!args.answerRevealed && (args.intent === "explain_question" || args.intent === "evaluate_option")) {
    const leak = LEAK_PATTERNS.find((re) => re.test(answer));
    if (leak) {
      issues.push({
        code: "answer_leak",
        severity: "error",
        detail: "Answer named the correct option before the learner submitted.",
      });
    }
  }

  if ((args.retrievedCount ?? 0) > 0 && !/\[\d+\]/.test(answer)) {
    issues.push({
      code: "ungrounded",
      severity: "warn",
      detail: `${args.retrievedCount} passage(s) were retrieved but none were cited.`,
    });
  }

  const penalty = issues.reduce((sum, i) => sum + (i.severity === "error" ? 35 : 12), 0);
  return { score: Math.max(0, 100 - penalty), issues, error: null };
}

/** Critique the finished answer and log it as a trace step. Never throws. */
export async function runCriticAgent(args: CriticArgs): Promise<CriticVerdict> {
  const started = Date.now();
  let verdict: CriticVerdict;
  try {
    verdict = critique(args);
  } catch (err) {
    verdict = { score: 0, issues: [], error: err instanceof Error ? err.message : "Critic failed" };
  }

  if (args.trace) {
    await logStep(args.trace.db, {
      runId: args.trace.runId,
      userId: args.trace.userId,
      stepIndex: args.trace.stepIndex,
      agent: "orchestrator",
      role: "critic",
      input: {
        intent: args.intent ?? null,
        chars: (args.answer ?? "").length,
        retrievedCount: args.retrievedCount ?? 0,
        answerRevealed: Boolean(args.answerRevealed),
      },
      output: { score: verdict.score, issues: verdict.issues },
      status: verdict.error || verdict.issues.some((i) => i.severity === "error") ? "error" : "ok",
      ...(verdict.error ? { error: verdict.error } : {}),
      durationMs: Date.now() - started,
    }).catch(() => {
      /* tracing must never break the turn */
    });
  }

  return verdict;
}
