/**
 * L4 — fast decision step (Jev, TypeSafe System One).
 *
 * Asks Jev one bounded question per turn — which intent is this, and does it
 * need a library lookup — and returns typed answers in a single buffered call.
 * Runs in shadow mode: the keyword router still decides; this result is only
 * logged next to it on the Traces page so agreement and speed can be compared
 * before anything relies on it. Never throws.
 */

import type { AgentIntent } from "@/lib/orchestrator.server";

export type Decision = {
  intent: AgentIntent;
  intentConfidence: number | null;
  needsLibrary: number | null;
  ms: number;
};

const INTENTS: Record<AgentIntent, string> = {
  explain_question: "Wants the question or scenario on screen interpreted or rephrased, without the answer.",
  evaluate_option: "Asks whether a specific answer option (or their chosen answer) is right or why.",
  concept_lookup: "Asks what a concept means, how something works, or how two things differ.",
  study_strategy: "Asks how to study, plan, revise, remember or manage exam time.",
  smalltalk: "Greeting, thanks, acknowledgement or other filler with no real question.",
};

export async function decideTurn(args: {
  turn: string;
  hasQuestion: boolean;
  selectedOption: string | null;
  timeoutMs?: number;
}): Promise<Decision | null> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key || !args.turn.trim()) return null;
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 2500);
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/systemone", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "typesafe/jev-latest",
        state: {
          message: args.turn.slice(0, 1500),
          question_on_screen: args.hasQuestion,
          option_selected: args.selectedOption,
        },
        questions: {
          intent: {
            type: "choice",
            instructions: "What is the learner asking the exam tutor for in `message`?",
            criteria: INTENTS,
          },
          needs_library: {
            type: "noul",
            instructions:
              "Would answering `message` well require looking up reference material about the exam subject?",
            criteria: {
              true: "A factual or conceptual answer grounded in documentation is needed.",
              false: "Filler, study advice or a reply that needs no reference material.",
            },
          },
        },
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      answers?: Record<string, { choice?: string; confidence?: number; noul?: number }>;
    };
    const choice = json.answers?.intent?.choice;
    if (!choice || !(choice in INTENTS)) return null;
    return {
      intent: choice as AgentIntent,
      intentConfidence: json.answers?.intent?.confidence ?? null,
      needsLibrary: json.answers?.needs_library?.noul ?? null,
      ms: Date.now() - t0,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
