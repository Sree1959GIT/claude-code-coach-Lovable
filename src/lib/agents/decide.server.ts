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

/** Phase 1 — what the learner's eye should be on while the answer starts. */
export type FocusTarget = "scenario" | "stem" | "option" | "none";

export type Decision = {
  intent: AgentIntent;
  intentConfidence: number | null;
  needsLibrary: number | null;
  focus: FocusTarget;
  ms: number;
};

const FOCUS: Record<FocusTarget, string> = {
  scenario: "The background/scenario paragraph above the question.",
  stem: "The question sentence itself — what is actually being asked.",
  option: "A specific answer option (the one selected or named in the message).",
  none: "Nothing on screen in particular — general talk or study advice.",
};

/**
 * Phase 1 — a short spoken opener built from the decision alone, with no model
 * call, so the voice can start speaking before the first model token lands.
 */
export function openerFor(d: {
  intent: AgentIntent;
  focus: FocusTarget;
  selectedOption?: string | null;
}): string {
  if (d.intent === "smalltalk") return "Sure thing.";
  if (d.focus === "option") {
    return d.selectedOption
      ? `Right, let's weigh up option ${d.selectedOption}.`
      : "Right, let's weigh up that option.";
  }
  if (d.focus === "scenario") return "Okay, let's start with the scenario.";
  if (d.focus === "stem") return "Okay, look at what the question is actually asking.";
  if (d.intent === "study_strategy") return "Good question — here's how I'd approach it.";
  return "Good question, let me take you through it.";
}

/** Marker the mentor panel uses to highlight while the opener is spoken. */
export function focusMarker(focus: FocusTarget, selectedOption?: string | null): string {
  if (focus === "option" && selectedOption) return `[[opt:${selectedOption.toUpperCase()}]]`;
  if (focus === "scenario") return "[[scenario]]";
  if (focus === "stem") return "[[stem]]";
  return "[[none]]";
}

const INTENTS: Record<AgentIntent, string> = {
  explain_question: "Wants the question or scenario on screen interpreted or rephrased, without the answer.",
  evaluate_option: "Asks whether a specific answer option (or their chosen answer) is right or why.",
  concept_lookup: "Asks what a concept means, how something works, or how two things differ.",
  study_strategy: "Asks how to study, plan, revise, remember or manage exam time.",
  smalltalk: "Greeting, thanks, acknowledgement or other filler with no real question.",
};

/** L4b — failures are returned (not swallowed) so they can be traced. */
export type DecideResult =
  | ({ ok: true } & Decision)
  | { ok: false; reason: string; status: number | null; ms: number };

export async function decideTurn(args: {
  turn: string;
  hasQuestion: boolean;
  selectedOption: string | null;
  timeoutMs?: number;
}): Promise<DecideResult | null> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!args.turn.trim()) return null;
  const t0 = Date.now();
  if (!key) return { ok: false, reason: "missing_api_key", status: null, ms: 0 };
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
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 200);
      return { ok: false, reason: `http_${res.status}: ${body}`, status: res.status, ms: Date.now() - t0 };
    }
    const json = (await res.json()) as {
      answers?: Record<string, { choice?: string; confidence?: number; noul?: number }>;
    };
    const choice = json.answers?.intent?.choice;
    if (!choice || !(choice in INTENTS)) {
      return { ok: false, reason: `unexpected_choice: ${String(choice)}`, status: 200, ms: Date.now() - t0 };
    }
    return {
      ok: true,
      intent: choice as AgentIntent,
      intentConfidence: json.answers?.intent?.confidence ?? null,
      needsLibrary: json.answers?.needs_library?.noul ?? null,
      ms: Date.now() - t0,
    };
  } catch (e) {
    const aborted = ctrl.signal.aborted;
    return {
      ok: false,
      reason: aborted ? "timeout" : `fetch_error: ${(e as Error)?.message ?? "unknown"}`,
      status: null,
      ms: Date.now() - t0,
    };
  } finally {
    clearTimeout(timer);
  }
}
