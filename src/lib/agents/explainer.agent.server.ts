/**
 * Sub-task 4 — Explainer agent.
 * Server-only. Owns the teaching voice: builds the intent-aware prompt stack
 * (persona + question context + retrieved passages + learner turns) and calls
 * the AI gateway, either streaming (for the mentor panel) or buffered.
 */

import type { AgentIntent, Db } from "../orchestrator.server";
import { logStep } from "../orchestrator.server";
import type { RetrievalResult } from "./retrieval.agent.server";
import { retrievalSystemMessage } from "./retrieval.agent.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
export const EXPLAINER_MODEL = "google/gemini-3.6-flash";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type QuestionContext = {
  scenario?: string | null;
  stem?: string | null;
  key_concept?: string | null;
  domain?: string | null;
  options?: { label: string; text: string }[];
  selectedOption?: string | null;
};

export type ExplainerArgs = {
  messages: { role: "user" | "assistant"; content: string }[];
  context?: QuestionContext | null;
  intent?: AgentIntent;
  retrieval?: RetrievalResult | null;
  /** Extra system guidance (e.g. from the memory agent). */
  profileNote?: string | null;
  trace?: { db: Db; runId: string | null; userId: string; stepIndex: number };
};

const PERSONA = `You are the SME Voice Mentor for the Claude Code Architect Foundation exam prep.

Role:
- Help the learner INTERPRET the question in front of them. Never state the correct answer outright before they submit — teach the concept so they can decide.
- Ground explanations in Anthropic Claude Code / Claude Agent SDK terminology.
- Plain prose only — no markdown, lists, headings or code fences.

OUTPUT FORMAT (required, two parts):
1) WRITTEN ANSWER: a clear, well-structured explanation the learner will READ (3-6 sentences). Be specific and complete.
2) Then emit the literal marker [[brief]] on its own, followed by a SPOKEN summary: 2-3 short sentences, conversational and warm, that briefly explains the same point in line with the written answer. This part is spoken aloud, so keep it tight and natural — never read the written answer verbatim.

HIGHLIGHT MARKERS (required inside the SPOKEN part):
Immediately before each spoken sentence, emit exactly one marker naming what that sentence is about:
  [[scenario]] when talking about the scenario paragraph
  [[stem]] when talking about the question stem itself
  [[opt:A]] / [[opt:B]] / ... when talking about that answer option
  [[none]] for general talk
Markers are stripped before display. Never mention markers in your prose.`;

/** Intent-specific teaching instructions layered on top of the persona. */
export function intentDirective(intent?: AgentIntent): string {
  switch (intent) {
    case "evaluate_option":
      return "The learner is asking how apt a specific option is. Weigh that option against the stem: what it gets right, what it misses, and which keyword in the stem decides it. Compare it briefly to the strongest rival option. Do not name the correct letter.";
    case "explain_question":
      return "The learner wants the stem and scenario interpreted. Unpack what is actually being asked, name the decisive qualifier words, and say what a correct answer would have to do — without evaluating any option by letter.";
    case "concept_lookup":
      return "The learner is asking a factual concept question. Define the concept precisely, contrast it with the nearest confusable concept, and tie it back to how the exam tests it.";
    case "study_strategy":
      return "The learner wants study advice. Give concrete, actionable tactics tuned to this exam and, when known, to their weak areas. Keep it practical.";
    case "smalltalk":
      return "Conversational turn. Answer briefly and warmly, then nudge them back to the question at hand.";
    default:
      return "Answer helpfully and concisely, teaching the concept behind the question.";
  }
}

/** Render the current question as a system message. */
export function questionContextMessage(ctx?: QuestionContext | null): string {
  if (!ctx) return "No question context attached.";
  const options = ctx.options ?? [];
  return [
    "Current question context:",
    `Domain: ${ctx.domain ?? "(unspecified)"}`,
    `Key concept: ${ctx.key_concept ?? "(unspecified)"}`,
    ctx.scenario ? `Scenario: ${ctx.scenario}` : "",
    `Stem: ${ctx.stem ?? ""}`,
    options.length ? "Options:" : "",
    ...options.map((o) => `  ${o.label}. ${o.text}`),
    ctx.selectedOption
      ? `The learner has currently selected option ${ctx.selectedOption}. If they ask about "this option" or "my answer", they mean option ${ctx.selectedOption}.`
      : "The learner has not selected an option yet.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Assemble the full message stack sent to the model. */
export function buildExplainerMessages(args: ExplainerArgs): ChatMessage[] {
  const sources = args.retrieval ? retrievalSystemMessage(args.retrieval) : null;
  return [
    { role: "system", content: PERSONA },
    { role: "system", content: intentDirective(args.intent) },
    { role: "system", content: questionContextMessage(args.context) },
    ...(args.profileNote ? [{ role: "system" as const, content: args.profileNote }] : []),
    ...(sources ? [{ role: "system" as const, content: sources }] : []),
    ...args.messages.slice(-20),
  ];
}

function gatewayError(status: number, body: string): Error {
  if (status === 429) return new Error("Mentor is rate limited. Try again in a moment.");
  if (status === 402) return new Error("AI credits exhausted. Add credits in Lovable settings.");
  return new Error(`Mentor call failed: ${status} ${body.slice(0, 160)}`);
}

/**
 * Streaming variant: returns the raw SSE body for the mentor panel to consume.
 * Throws a user-presentable error on gateway failure.
 */
export async function streamExplainer(args: ExplainerArgs): Promise<ReadableStream<Uint8Array>> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  return fetchGatewayStream({
    url: `${GATEWAY_URL}/chat/completions`,
    apiKey: key,
    label: "Mentor",
    body: {
      model: EXPLAINER_MODEL,
      stream: true,
      stream_options: { include_usage: true },
      messages: buildExplainerMessages(args),
    },
  });
}


export type ExplainerResult = {
  text: string;
  written: string;
  spoken: string;
  model: string;
  error: string | null;
};

/** Split the model output into the written answer and the spoken brief. */
export function splitBrief(text: string): { written: string; spoken: string } {
  const idx = text.indexOf("[[brief]]");
  if (idx === -1) return { written: text.trim(), spoken: "" };
  return {
    written: text.slice(0, idx).trim(),
    spoken: text.slice(idx + "[[brief]]".length).trim(),
  };
}

/** Buffered variant, used for non-streaming callers and evaluation/tracing. */
export async function runExplainerAgent(args: ExplainerArgs): Promise<ExplainerResult> {
  const started = Date.now();
  const key = process.env["LOVABLE_API_KEY"];
  let result: ExplainerResult;
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const res = await fetch(`${GATEWAY_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EXPLAINER_MODEL,
        messages: buildExplainerMessages(args),
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
    result = { text, ...splitBrief(text), model: EXPLAINER_MODEL, error: null };
  } catch (err) {
    result = {
      text: "",
      written: "",
      spoken: "",
      model: EXPLAINER_MODEL,
      error: err instanceof Error ? err.message : "Explainer unavailable",
    };
  }

  if (args.trace) {
    await logStep(args.trace.db, {
      runId: args.trace.runId,
      userId: args.trace.userId,
      stepIndex: args.trace.stepIndex,
      agent: "explainer",
      role: "teacher",
      model: EXPLAINER_MODEL,
      input: {
        intent: args.intent ?? null,
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
      /* tracing must never break the answer */
    });
  }

  return result;
}
