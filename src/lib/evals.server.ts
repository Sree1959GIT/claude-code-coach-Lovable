/**
 * Stage 6b sub-task 11 — agent evaluation runner.
 *
 * Replays the active golden prompts in `agent_evals` through the same routing
 * and answering path the mentor stream uses (buffered, not streamed), scores
 * each answer with the deterministic critic plus expectation checks, and
 * persists an `agent_eval_runs` batch with one `agent_eval_results` row per
 * prompt. Server-only. Never throws for a single failing prompt.
 */

import { planRoute, type AgentIntent } from "./orchestrator.server";
import { runRetrievalAgent } from "./agents/retrieval.agent.server";
import { runExplainerAgent, type QuestionContext } from "./agents/explainer.agent.server";
import { runEvaluatorAgent } from "./agents/evaluator.agent.server";
import { critique, type CriticIssue } from "./agents/critic.agent.server";

export type EvalCaseResult = {
  evalId: string;
  name: string;
  intent: AgentIntent;
  agents: string[];
  answer: string;
  score: number;
  passed: boolean;
  issues: string[];
  missingPoints: string[];
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  error: string | null;
};

export type EvalBatchResult = {
  runId: string | null;
  label: string;
  total: number;
  passed: number;
  failed: number;
  avgScore: number;
  durationMs: number;
  results: EvalCaseResult[];
  error: string | null;
};

const PASS_SCORE = 70;
/** Keep a manual batch bounded so a run stays cheap and fast. */
const MAX_CASES = 25;

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** A key point counts as covered when most of its salient words appear. */
function coversPoint(answer: string, point: string): boolean {
  const hay = normalise(answer);
  const words = normalise(point)
    .split(" ")
    .filter((w) => w.length > 3);
  if (words.length === 0) return hay.includes(normalise(point));
  const hits = words.filter((w) => hay.includes(w)).length;
  return hits / words.length >= 0.6;
}

type QuestionRow = {
  scenario: string | null;
  stem: string;
  key_concept: string | null;
  domains: { title: string } | null;
  question_options: { label: string; text: string; sort_order: number }[];
};

async function loadContext(
  questionId: string | null,
  selectedOptionLabel: string | null,
): Promise<QuestionContext | null> {
  if (!questionId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("questions")
    .select("scenario, stem, key_concept, domains(title), question_options(label, text, sort_order)")
    .eq("id", questionId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as QuestionRow;
  return {
    scenario: row.scenario,
    stem: row.stem,
    key_concept: row.key_concept,
    domain: row.domains?.title ?? null,
    options: [...(row.question_options ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => ({ label: o.label, text: o.text })),
    selectedOption: selectedOptionLabel,
  };
}

/** Run one golden prompt end to end and score it. */
export async function runEvalCase(row: {
  id: string;
  name: string;
  prompt: string;
  question_id: string | null;
  selected_option_label: string | null;
  expected_intent: string | null;
  expected_agents: string[];
  expected_points: string[];
}): Promise<EvalCaseResult> {
  const started = Date.now();
  const context = await loadContext(row.question_id, row.selected_option_label);
  const plan = planRoute(row.prompt, {
    selectedOption: context?.selectedOption ?? null,
    hasQuestion: Boolean(context?.stem),
  });

  const issues: string[] = [];
  let penalty = 0;

  if (row.expected_intent && row.expected_intent !== plan.intent) {
    issues.push(`intent: expected ${row.expected_intent}, routed ${plan.intent}`);
    penalty += 30;
  }
  const missingAgents = (row.expected_agents ?? []).filter((a) => !plan.agents.includes(a as never));
  if (missingAgents.length) {
    issues.push(`agents missing: ${missingAgents.join(", ")}`);
    penalty += 10 * missingAgents.length;
  }

  const retrieval = plan.useRetrieval
    ? await runRetrievalAgent({ message: row.prompt, context, intent: plan.intent }).catch(() => null)
    : null;

  const args = {
    messages: [{ role: "user" as const, content: row.prompt }],
    context,
    intent: plan.intent,
    retrieval,
  };

  const result =
    plan.intent === "evaluate_option"
      ? await runEvaluatorAgent(args)
      : await runExplainerAgent(args);

  const answer = result.text ?? "";
  const verdict = critique({
    answer,
    intent: plan.intent,
    retrievedCount: retrieval?.matches?.length ?? 0,
    answerRevealed: false,
  });
  for (const i of verdict.issues as CriticIssue[]) issues.push(`${i.code}: ${i.detail}`);

  const missingPoints = (row.expected_points ?? []).filter((p) => !coversPoint(answer, p));
  if (missingPoints.length) penalty += 15 * missingPoints.length;

  if (result.error) {
    issues.push(`agent error: ${result.error}`);
    penalty += 100;
  }

  const score = Math.max(0, Math.min(100, verdict.score - penalty));

  return {
    evalId: row.id,
    name: row.name,
    intent: plan.intent,
    agents: plan.agents,
    answer: answer.slice(0, 4000),
    score,
    passed: score >= PASS_SCORE && !result.error,
    issues,
    missingPoints,
    durationMs: Date.now() - started,
    promptTokens: 0,
    completionTokens: 0,
    error: result.error ?? null,
  };
}

/** Replay every active golden prompt and persist the batch. */
export async function runEvalBatch(label = "manual"): Promise<EvalBatchResult> {
  const startedAt = Date.now();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: evals, error: loadErr } = await supabaseAdmin
    .from("agent_evals")
    .select("id, name, prompt, question_id, selected_option_label, expected_intent, expected_agents, expected_points")
    .eq("is_active", true)
    .order("sort_order")
    .limit(MAX_CASES);

  if (loadErr) {
    return {
      runId: null,
      label,
      total: 0,
      passed: 0,
      failed: 0,
      avgScore: 0,
      durationMs: Date.now() - startedAt,
      results: [],
      error: loadErr.message,
    };
  }

  const rows = evals ?? [];
  const { data: runRow } = await supabaseAdmin
    .from("agent_eval_runs")
    .insert({ label, status: "running", total: rows.length, passed: 0, failed: 0, avg_score: 0 })
    .select("id")
    .single();
  const runId = runRow?.id ?? null;

  const results: EvalCaseResult[] = [];
  for (const row of rows) {
    try {
      results.push(await runEvalCase(row as Parameters<typeof runEvalCase>[0]));
    } catch (err) {
      results.push({
        evalId: row.id,
        name: row.name,
        intent: "concept_lookup",
        agents: [],
        answer: "",
        score: 0,
        passed: false,
        issues: [err instanceof Error ? err.message : "case failed"],
        missingPoints: [],
        durationMs: 0,
        promptTokens: 0,
        completionTokens: 0,
        error: err instanceof Error ? err.message : "case failed",
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const avgScore = results.length
    ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
    : 0;
  const durationMs = Date.now() - startedAt;

  if (runId) {
    if (results.length) {
      await supabaseAdmin.from("agent_eval_results").insert(
        results.map((r) => ({
          eval_run_id: runId,
          eval_id: r.evalId,
          name: r.name,
          intent: r.intent,
          agents: r.agents,
          answer: r.answer,
          score: r.score,
          passed: r.passed,
          issues: r.issues,
          missing_points: r.missingPoints,
          duration_ms: r.durationMs,
          prompt_tokens: r.promptTokens,
          completion_tokens: r.completionTokens,
          error: r.error,
        })),
      );
    }
    await supabaseAdmin
      .from("agent_eval_runs")
      .update({
        status: "done",
        total: results.length,
        passed,
        failed,
        avg_score: avgScore,
        duration_ms: durationMs,
      })
      .eq("id", runId);
  }

  return { runId, label, total: results.length, passed, failed, avgScore, durationMs, results, error: null };
}
