/**
 * Sub-task 6 — Memory agent.
 * Server-only. Owns the "who is this learner?" path: reads recent attempts and
 * FSRS mastery state, distills them into a short profile note that the
 * explainer/evaluator can use as system guidance, and traces the step.
 *
 * Never throws: on failure it returns an empty note so the mentor keeps working.
 */

import type { AgentIntent, Db } from "../orchestrator.server";
import { logStep } from "../orchestrator.server";

export type ThreadTurn = { question: string; answer: string; intent: string | null };

export type LearnerProfile = {
  /** Prompt-ready system guidance (empty string when nothing useful is known). */
  note: string;
  attempts: number;
  accuracy: number | null;
  weakDomains: string[];
  strongDomains: string[];
  dueCount: number;
  lapseHeavy: number;
  /** Sub-task 15: earlier mentor turns from this learner's thread. */
  recentTurns: ThreadTurn[];
  error: string | null;
};

export type MemoryAgentArgs = {
  db: Db;
  userId: string;
  intent?: AgentIntent;
  /** Domain title of the question currently on screen, if any. */
  currentDomain?: string | null;
  /** Skip conversation recall (e.g. smalltalk turns). */
  includeThread?: boolean;
  trace?: { runId: string | null; stepIndex: number };
};


const EMPTY: LearnerProfile = {
  note: "",
  attempts: 0,
  accuracy: null,
  weakDomains: [],
  strongDomains: [],
  dueCount: 0,
  lapseHeavy: 0,
  recentTurns: [],
  error: null,
};

type AttemptRow = {
  is_correct: boolean;
  questions: { domain_id: string; domains: { title: string } | null } | null;
};

function pct(n: number): number {
  return Math.round(n * 100);
}

/** Turn raw stats into a compact system note for the downstream agents. */
export function buildProfileNote(
  p: Omit<LearnerProfile, "note" | "error">,
  currentDomain?: string | null,
): string {
  if (p.attempts < 3) {
    return "Learner profile: not enough history yet. Teach from first principles and keep explanations self-contained.";
  }

  const parts: string[] = [
    `Learner profile (private context — never read it aloud or quote it): ${p.attempts} recent attempts, ${p.accuracy === null ? "unknown" : `${pct(p.accuracy)}%`} accuracy.`,
  ];
  if (p.weakDomains.length) {
    parts.push(`Weakest areas: ${p.weakDomains.join(", ")}. Slow down and be more concrete there.`);
  }
  if (p.strongDomains.length) {
    parts.push(`Confident areas: ${p.strongDomains.join(", ")}. Be brisk there and skip basics.`);
  }
  if (currentDomain && p.weakDomains.includes(currentDomain)) {
    parts.push(
      `The current question is in a weak area (${currentDomain}) — anchor the explanation in the decisive qualifier words before anything else.`,
    );
  }
  if (p.lapseHeavy > 0) {
    parts.push(
      `${p.lapseHeavy} item(s) have lapsed repeatedly — favour a memorable discriminator over exhaustive detail.`,
    );
  }
  if (p.dueCount > 0) {
    parts.push(`${p.dueCount} card(s) are due for review; a one-line nudge to review is welcome if it fits naturally.`);
  }
  return parts.join(" ");
}

/**
 * Sub-task 15 — render earlier mentor turns as a private system note so the
 * answering agent can build on what it already said instead of repeating it.
 */
export function buildThreadNote(turns: ThreadTurn[]): string {
  if (!turns.length) return "";
  const lines = turns
    .slice(0, 4)
    .reverse()
    .map((t, i) => {
      const q = t.question.replace(/\s+/g, " ").slice(0, 200);
      const a = t.answer.replace(/\s+/g, " ").slice(0, 320);
      return `${i + 1}. [${t.intent ?? "turn"}] Learner asked: "${q}" — you answered: "${a}"`;
    });
  return [
    "Conversation memory (private context — never read it aloud or quote it verbatim). Earlier turns with this learner, oldest first:",
    ...lines,
    "Build on this: do not repeat an explanation you already gave, refer back naturally when it helps, and go one level deeper if they ask something similar again.",
  ].join("\n");
}


/** Read learner state and produce a profile note. Never throws. */
export async function runMemoryAgent(args: MemoryAgentArgs): Promise<LearnerProfile> {
  const started = Date.now();
  let profile: LearnerProfile;

  try {
    const nowIso = new Date().toISOString();
    const [attemptsRes, masteryRes, runsRes] = await Promise.all([
      args.db
        .from("question_attempts")
        .select("is_correct, questions(domain_id, domains(title))")
        .eq("user_id", args.userId)
        .order("created_at", { ascending: false })
        .limit(60),
      args.db
        .from("user_mastery")
        .select("due_at, lapses")
        .eq("user_id", args.userId)
        .limit(500),
      args.includeThread === false
        ? Promise.resolve({ data: [], error: null })
        : args.db
            .from("agent_runs")
            .select("question, final_answer, metadata, created_at")
            .eq("user_id", args.userId)
            .eq("status", "done")
            .order("created_at", { ascending: false })
            .limit(4),
    ]);


    if (attemptsRes.error) throw attemptsRes.error;

    const attempts = (attemptsRes.data ?? []) as unknown as AttemptRow[];
    const total = attempts.length;
    const correct = attempts.filter((a) => a.is_correct).length;

    const byDomain = new Map<string, { hit: number; n: number }>();
    for (const a of attempts) {
      const title = a.questions?.domains?.title;
      if (!title) continue;
      const cur = byDomain.get(title) ?? { hit: 0, n: 0 };
      cur.n += 1;
      if (a.is_correct) cur.hit += 1;
      byDomain.set(title, cur);
    }

    const scored = [...byDomain.entries()]
      .filter(([, v]) => v.n >= 3)
      .map(([title, v]) => ({ title, rate: v.hit / v.n }));

    const weakDomains = scored
      .filter((d) => d.rate < 0.6)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 3)
      .map((d) => d.title);
    const strongDomains = scored
      .filter((d) => d.rate >= 0.85)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 3)
      .map((d) => d.title);

    const mastery = masteryRes.error ? [] : (masteryRes.data ?? []);
    const dueCount = mastery.filter((m) => m.due_at !== null && m.due_at <= nowIso).length;
    const lapseHeavy = mastery.filter((m) => (m.lapses ?? 0) >= 3).length;

    type RunRow = {
      question: string | null;
      final_answer: string | null;
      metadata: { intent?: string } | null;
    };
    const runRows = (runsRes.error ? [] : ((runsRes.data ?? []) as unknown as RunRow[])).filter(
      (r) => r.question && r.final_answer,
    );
    const recentTurns: ThreadTurn[] = runRows.map((r) => ({
      question: r.question ?? "",
      answer: (r.final_answer ?? "").split("[[brief]]")[0]!.trim(),
      intent: r.metadata?.intent ?? null,
    }));

    const stats = {
      attempts: total,
      accuracy: total ? correct / total : null,
      weakDomains,
      strongDomains,
      dueCount,
      lapseHeavy,
      recentTurns,
    };

    const threadNote = buildThreadNote(recentTurns);
    const note = [buildProfileNote(stats, args.currentDomain), threadNote].filter(Boolean).join("\n\n");
    profile = { ...stats, note, error: null };

  } catch (err) {
    profile = {
      ...EMPTY,
      error: err instanceof Error ? err.message : "Learner memory unavailable",
    };
  }

  if (args.trace) {
    await logStep(args.db, {
      runId: args.trace.runId,
      userId: args.userId,
      stepIndex: args.trace.stepIndex,
      agent: "memory",
      role: "profiler",
      input: { intent: args.intent ?? null, currentDomain: args.currentDomain ?? null },
      output: {
        recalledTurns: profile.recentTurns.length,
        attempts: profile.attempts,
        accuracy: profile.accuracy,
        weakDomains: profile.weakDomains,
        strongDomains: profile.strongDomains,
        dueCount: profile.dueCount,
        lapseHeavy: profile.lapseHeavy,
      },
      status: profile.error ? "error" : "ok",
      ...(profile.error ? { error: profile.error } : {}),
      durationMs: Date.now() - started,
    }).catch(() => {
      /* tracing must never break the mentor */
    });
  }

  return profile;
}
