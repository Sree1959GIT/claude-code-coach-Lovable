/**
 * Sub-task 5 — Evaluator (critic) agent.
 * Server-only. Owns the "how apt is this option?" path: weighs the learner's
 * selected option against the stem and its rivals, grounded in retrieved
 * passages, without ever naming the correct letter before submission.
 */

import type { AgentIntent, Db } from "../orchestrator.server";
import { logStep } from "../orchestrator.server";
import type { RetrievalResult } from "./retrieval.agent.server";
import { retrievalSystemMessage } from "./retrieval.agent.server";
import type { ChatMessage, QuestionContext } from "./explainer.agent.server";
import { questionContextMessage, splitBrief } from "./explainer.agent.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
export const EVALUATOR_MODEL = "google/gemini-3.6-flash";

const CRITIC_PERSONA = `You are the Option Critic for the Claude Code Architect Foundation exam prep.

Role:
- The learner has an option in mind. Judge how APT that option is for the stem — not whether it is "the answer".
- Structure your reasoning: (a) what the stem actually demands, including the decisive qualifier words; (b) what the learner's option gets right; (c) where it falls short or over/under-reaches; (d) the single strongest rival option and the one distinction that separates them.
- Never state or imply the correct letter before the learner submits. Teach the discriminator instead.
- Ground everything in Anthropic Claude Code / Claude Agent SDK terminology.
- Plain prose only — no markdown, lists, headings or code fences.

OUTPUT FORMAT (required, two parts):
1) WRITTEN ANSWER: a clear critique the learner will READ (4-6 sentences), following the structure above.
2) Then emit the literal marker [[brief]] on its own, followed by a SPOKEN summary: 2-3 short conversational sentences carrying the same verdict. Never read the written answer verbatim.

HIGHLIGHT MARKERS (required inside the SPOKEN part):
Immediately before each spoken sentence, emit exactly one marker naming what that sentence is about:
  [[scenario]] scenario paragraph
  [[stem]] the question stem
  [[opt:A]] / [[opt:B]] / ... that answer option
  [[none]] general talk
Markers are stripped before display. Never mention markers in your prose.`;

export type EvaluatorArgs = {
  messages: { role: "user" | "assistant"; content: string }[];
  context?: QuestionContext | null;
  intent?: AgentIntent;
  retrieval?: RetrievalResult | null;
  profileNote?: string | null;
  trace?: { db: Db; runId: string | null; userId: string; stepIndex: number };
};

/** Focus instruction naming the option under review. */
export function evaluatorFocusMessage(ctx?: QuestionContext | null): string {
  const label = ctx?.selectedOption;
  if (!label) {
    return "The learner has not selected an option. Ask which option they have in mind, then critique the stem's demands in the meantime.";
  }
  const text = ctx?.options?.find((o) => o.label === label)?.text ?? "";
  return `Option under review: ${label}${text ? `. "${text}"` : ""}. Critique this option's aptness first, then compare it to the strongest rival.`;
}

/** Assemble the critic message stack. */
export function buildEvaluatorMessages(args: EvaluatorArgs): ChatMessage[] {
  const sources = args.retrieval ? retrievalSystemMessage(args.retrieval) : null;
  return [
    { role: "system", content: CRITIC_PERSONA },
    { role: "system", content: questionContextMessage(args.context) },
    { role: "system", content: evaluatorFocusMessage(args.context) },
    ...(args.profileNote ? [{ role: "system" as const, content: args.profileNote }] : []),
    ...(sources ? [{ role: "system" as const, content: sources }] : []),
    ...args.messages.slice(-20),
  ];
}

function gatewayError(status: number, body: string): Error {
  if (status === 429) return new Error("Mentor is rate limited. Try again in a moment.");
  if (status === 402) return new Error("AI credits exhausted. Add credits in Lovable settings.");
  return new Error(`Evaluator call failed: ${status} ${body.slice(0, 160)}`);
}

/** Streaming variant for the mentor panel. */
export async function streamEvaluator(args: EvaluatorArgs): Promise<ReadableStream<Uint8Array>> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const { fetchGatewayStream } = await import("./gateway.server");
  return fetchGatewayStream({
    url: `${GATEWAY_URL}/chat/completions`,
    apiKey: key,
    label: "Mentor",
    body: {
      model: EVALUATOR_MODEL,
      stream: true,
      stream_options: { include_usage: true },
      messages: buildEvaluatorMessages(args),
    },
  });
}


export type EvaluatorResult = {
  text: string;
  written: string;
  spoken: string;
  model: string;
  error: string | null;
};

/** Buffered variant, used for non-streaming callers and tracing. */
export async function runEvaluatorAgent(args: EvaluatorArgs): Promise<EvaluatorResult> {
  const started = Date.now();
  const key = process.env["LOVABLE_API_KEY"];
  let result: EvaluatorResult;
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const res = await fetch(`${GATEWAY_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EVALUATOR_MODEL,
        messages: buildEvaluatorMessages(args),
      }),
    });
    if (!res.ok) throw gatewayError(res.status, await res.text().catch(() => ""));

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    promptTokens = json.usage?.prompt_tokens ?? 0;
    completionTokens = json.usage?.completion_tokens ?? 0;
    result = { text, ...splitBrief(text), model: EVALUATOR_MODEL, error: null };
  } catch (err) {
    result = {
      text: "",
      written: "",
      spoken: "",
      model: EVALUATOR_MODEL,
      error: err instanceof Error ? err.message : "Evaluator unavailable",
    };
  }

  if (args.trace) {
    await logStep(args.trace.db, {
      runId: args.trace.runId,
      userId: args.trace.userId,
      stepIndex: args.trace.stepIndex,
      agent: "evaluator",
      role: "critic",
      model: EVALUATOR_MODEL,
      input: {
        option: args.context?.selectedOption ?? null,
        turns: args.messages.length,
        grounded: Boolean(args.retrieval?.contextBlock),
      },
      output: { written: result.written.slice(0, 4000), spoken: result.spoken.slice(0, 1000) },
      status: result.error ? "error" : "ok",
      ...(result.error ? { error: result.error } : {}),
      durationMs: Date.now() - started,
      promptTokens,
      completionTokens,
    }).catch(() => {
      /* tracing must never break the critique */
    });
  }

  return result;
}
