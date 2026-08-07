/**
 * Sub-task 2 — Orchestrator core.
 * Server-only: classifies a learner turn into an intent, decides the agent path,
 * and records run/step traces in `agent_runs` / `agent_steps`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type Db = SupabaseClient<Database>;

export type AgentIntent =
  | "explain_question"
  | "evaluate_option"
  | "concept_lookup"
  | "study_strategy"
  | "smalltalk";

export type AgentName = "orchestrator" | "retrieval" | "explainer" | "evaluator" | "memory";

export type RoutePlan = {
  intent: AgentIntent;
  /** Ordered agent path the orchestrator will execute. */
  agents: AgentName[];
  /** Whether library retrieval should run for this turn. */
  useRetrieval: boolean;
  /** Short rationale, stored in the trace for debugging. */
  reason: string;
};

const RULES: { intent: AgentIntent; test: RegExp }[] = [
  { intent: "evaluate_option", test: /\b(this option|my answer|option [a-d]\b|is [a-d] correct|why (is|isn'?t) [a-d])/i },
  { intent: "explain_question", test: /\b(explain (the )?question|what.*(asking|mean)|interpret|break (it|this) down|rephrase)/i },
  { intent: "study_strategy", test: /\b(how (do|should) i (study|prepare|remember)|strategy|tips?|time management|revise|plan)\b/i },
  { intent: "concept_lookup", test: /\b(what is|what are|define|difference between|how does|when should i use)\b/i },
  { intent: "smalltalk", test: /^\s*(hi|hey|hello|thanks|thank you|ok(ay)?|got it)\b/i },
];

/** Deterministic, zero-cost intent classification for a learner turn. */
export function classifyIntent(
  message: string,
  ctx?: { selectedOption?: string | null; hasQuestion?: boolean },
): AgentIntent {
  const text = (message ?? "").trim();
  for (const rule of RULES) {
    if (rule.test.test(text)) {
      if (rule.intent === "evaluate_option" && !ctx?.hasQuestion) return "concept_lookup";
      return rule.intent;
    }
  }
  if (ctx?.selectedOption && ctx?.hasQuestion) return "evaluate_option";
  if (ctx?.hasQuestion) return "explain_question";
  return "concept_lookup";
}

/** Map an intent to the agent path and retrieval decision. */
export function planRoute(
  message: string,
  ctx?: { selectedOption?: string | null; hasQuestion?: boolean },
): RoutePlan {
  const intent = classifyIntent(message, ctx);
  switch (intent) {
    case "evaluate_option":
      return {
        intent,
        agents: ["orchestrator", "retrieval", "evaluator", "memory"],
        useRetrieval: true,
        reason: "Learner is asking about the aptness of a specific answer option.",
      };
    case "explain_question":
      return {
        intent,
        agents: ["orchestrator", "retrieval", "explainer", "memory"],
        useRetrieval: true,
        reason: "Learner wants the stem/scenario interpreted without the answer revealed.",
      };
    case "concept_lookup":
      return {
        intent,
        agents: ["orchestrator", "retrieval", "explainer"],
        useRetrieval: true,
        reason: "Factual concept question — ground it in the library corpus.",
      };
    case "study_strategy":
      return {
        intent,
        agents: ["orchestrator", "memory", "explainer"],
        useRetrieval: false,
        reason: "Advice question — use the learner profile rather than library passages.",
      };
    case "smalltalk":
    default:
      return {
        intent: "smalltalk",
        agents: ["orchestrator", "explainer"],
        useRetrieval: false,
        reason: "Conversational filler — answer briefly, no retrieval needed.",
      };
  }
}

/** Open a run row. Returns the run id, or null if tracing fails (never throws). */
export async function startRun(
  db: Db,
  args: {
    userId: string;
    mode?: string;
    question?: string | null;
    questionId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<string | null> {
  const { data, error } = await db
    .from("agent_runs")
    .insert({
      user_id: args.userId,
      mode: args.mode ?? "mentor",
      question: args.question ?? null,
      question_id: args.questionId ?? null,
      status: "running",
      metadata: (args.metadata ?? {}) as never,
    })
    .select("id")
    .single();
  if (error) return null;
  return data.id;
}

/** Append a step to a run. Best-effort: swallows tracing errors. */
export async function logStep(
  db: Db,
  args: {
    runId: string | null;
    userId: string;
    stepIndex: number;
    agent: AgentName;
    role?: string;
    model?: string;
    input?: unknown;
    output?: unknown;
    status?: "ok" | "error";
    error?: string;
    durationMs?: number;
    promptTokens?: number;
    completionTokens?: number;
  },
): Promise<void> {
  if (!args.runId) return;
  await db.from("agent_steps").insert({
    run_id: args.runId,
    user_id: args.userId,
    step_index: args.stepIndex,
    agent: args.agent,
    role: args.role ?? null,
    model: args.model ?? null,
    input: (args.input ?? null) as never,
    output: (args.output ?? null) as never,
    status: args.status ?? "ok",
    error: args.error ?? null,
    duration_ms: args.durationMs ?? null,
    prompt_tokens: args.promptTokens ?? 0,
    completion_tokens: args.completionTokens ?? 0,
  });
}

/**
 * Close a run. `agent_runs` is insert/select-only under RLS for users, so the
 * update runs with the admin client (loaded lazily, server-side only).
 */
export async function finishRun(args: {
  runId: string | null;
  status: "done" | "error";
  finalAnswer?: string | null;
  error?: string | null;
  durationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
}): Promise<void> {
  if (!args.runId) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("agent_runs")
      .update({
        status: args.status,
        final_answer: args.finalAnswer ?? null,
        error: args.error ?? null,
        duration_ms: args.durationMs ?? null,
        total_prompt_tokens: args.promptTokens ?? 0,
        total_completion_tokens: args.completionTokens ?? 0,
      })
      .eq("id", args.runId);
  } catch {
    // Tracing must never break the mentor response.
  }
}
