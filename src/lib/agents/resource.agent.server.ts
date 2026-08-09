/**
 * Sub-task 11 — Resource agent.
 * Server-only. Picks the most relevant watch/read resources for the current
 * turn (learner message + question context + retrieved passage titles) so the
 * mentor panel can surface them alongside the answer. Never throws.
 */

import { matchResources, type LearnResource } from "../resources";
import { logStep, type AgentIntent, type Db } from "../orchestrator.server";

export type ResourceAgentArgs = {
  message: string;
  context?: {
    stem?: string | null;
    key_concept?: string | null;
    domain?: string | null;
  } | null;
  intent?: AgentIntent;
  /** Titles of retrieved library passages, used as extra matching signal. */
  retrievalTitles?: string[];
  trace?: { db: Db; runId: string | null; userId: string; stepIndex: number };
};

export type ResourceResult = {
  resources: LearnResource[];
  error: string | null;
};

/** Smalltalk needs no reading list; deep-dive intents get a wider set. */
function limitFor(intent?: AgentIntent): number {
  switch (intent) {
    case "smalltalk":
      return 0;
    case "concept_lookup":
    case "explain_question":
      return 3;
    default:
      return 2;
  }
}

export async function runResourceAgent(args: ResourceAgentArgs): Promise<ResourceResult> {
  const started = Date.now();
  const limit = limitFor(args.intent);
  let result: ResourceResult = { resources: [], error: null };

  if (limit > 0) {
    try {
      result = {
        resources: matchResources(
          [
            args.message,
            args.context?.key_concept ?? null,
            args.context?.domain ?? null,
            args.context?.stem ?? null,
            ...(args.retrievalTitles ?? []),
          ],
          limit,
        ),
        error: null,
      };
    } catch (err) {
      result = {
        resources: [],
        error: err instanceof Error ? err.message : "Resource lookup failed",
      };
    }
  }

  if (args.trace) {
    await logStep(args.trace.db, {
      runId: args.trace.runId,
      userId: args.trace.userId,
      stepIndex: args.trace.stepIndex,
      agent: "retrieval",
      role: "resources",
      input: { intent: args.intent ?? null, limit, titles: args.retrievalTitles ?? [] },
      output: { picked: result.resources.map((r) => r.title) },
      status: result.error ? "error" : "ok",
      ...(result.error ? { error: result.error } : {}),
      durationMs: Date.now() - started,
    }).catch(() => {
      /* tracing must never break the turn */
    });
  }

  return result;
}
