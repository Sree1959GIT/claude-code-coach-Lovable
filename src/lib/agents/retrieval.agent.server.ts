/**
 * Sub-task 3 — Retrieval agent wrapper.
 * Server-only. Wraps the raw RAG retrieval core with query construction,
 * intent-aware tuning, citation shaping, tracing and graceful degradation.
 */

import type { LibraryMatch } from "../retrieval.server";
import type { AgentIntent, Db } from "../orchestrator.server";
import { logStep } from "../orchestrator.server";

export type Citation = {
  n: number;
  title: string;
  url: string | null;
  source: string;
  similarity: number;
};

export type RetrievalResult = {
  matches: LibraryMatch[];
  citations: Citation[];
  /** Prompt-ready block (empty string when nothing was retrieved). */
  contextBlock: string;
  query: string;
  error: string | null;
};

export type RetrievalAgentArgs = {
  message: string;
  context?: {
    scenario?: string | null;
    stem?: string | null;
    key_concept?: string | null;
    domain?: string | null;
    options?: { label: string; text: string }[];
    selectedOption?: string | null;
  } | null;
  intent?: AgentIntent;
  /** Tracing (all optional — retrieval works untraced). */
  trace?: { db: Db; runId: string | null; userId: string; stepIndex: number };
};

const EMPTY: Omit<RetrievalResult, "query"> = {
  matches: [],
  citations: [],
  contextBlock: "",
  error: null,
};

/** Tuning per intent: how many passages and how strict the similarity floor is. */
function tuning(intent?: AgentIntent): { matchCount: number; minSimilarity: number } {
  switch (intent) {
    case "concept_lookup":
      return { matchCount: 6, minSimilarity: 0.2 };
    case "evaluate_option":
      return { matchCount: 5, minSimilarity: 0.22 };
    case "explain_question":
      return { matchCount: 5, minSimilarity: 0.2 };
    default:
      return { matchCount: 4, minSimilarity: 0.25 };
  }
}

/** Build a focused retrieval query from the turn plus the question context. */
export function buildRetrievalQuery(args: RetrievalAgentArgs): string {
  const ctx = args.context ?? undefined;
  const selected =
    ctx?.selectedOption && ctx.options
      ? ctx.options.find((o) => o.label === ctx.selectedOption)?.text
      : undefined;

  return [args.message, ctx?.stem ?? "", ctx?.key_concept ?? "", ctx?.domain ?? "", selected ?? ""]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

/**
 * Run the retrieval agent. Never throws: on failure it returns an empty result
 * with `error` set so the orchestrator can continue ungrounded.
 */
export async function runRetrievalAgent(
  args: RetrievalAgentArgs,
): Promise<RetrievalResult> {
  const started = Date.now();
  const query = buildRetrievalQuery(args);
  const { matchCount, minSimilarity } = tuning(args.intent);

  if (query.length < 3) {
    return { ...EMPTY, query };
  }

  let result: RetrievalResult;
  try {
    const { retrieveChunks, buildContextBlock } = await import("../retrieval.server");
    const matches = await retrieveChunks({ query, matchCount, minSimilarity });
    result = {
      matches,
      citations: matches.map((m, i) => ({
        n: i + 1,
        title: m.title,
        url: m.url,
        source: m.source,
        similarity: Number(m.similarity.toFixed(3)),
      })),
      contextBlock: matches.length ? buildContextBlock(matches, 5000) : "",
      query,
      error: null,
    };
  } catch (err) {
    result = {
      ...EMPTY,
      query,
      error: err instanceof Error ? err.message : "Library retrieval unavailable",
    };
  }

  if (args.trace) {
    await logStep(args.trace.db, {
      runId: args.trace.runId,
      userId: args.trace.userId,
      stepIndex: args.trace.stepIndex,
      agent: "retrieval",
      role: "retriever",
      input: { query, matchCount, minSimilarity, intent: args.intent ?? null },
      output: {
        matchCount: result.matches.length,
        citations: result.citations,
      },
      status: result.error ? "error" : "ok",
      ...(result.error ? { error: result.error } : {}),
      durationMs: Date.now() - started,
    }).catch(() => {
      /* tracing must never break retrieval */
    });
  }

  return result;
}

/** System-message text instructing the model how to use retrieved passages. */
export function retrievalSystemMessage(result: RetrievalResult): string | null {
  if (!result.contextBlock) return null;
  return `Library passages retrieved for this turn. Use them as the factual basis for your explanation. Cite them inline as [1], [2] etc. in the WRITTEN ANSWER only — never in the spoken part. If they do not cover the point, rely on your own knowledge and do not invent citations.\n\n${result.contextBlock}`;
}
