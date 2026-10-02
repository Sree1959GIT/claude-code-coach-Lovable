/**
 * L5 — mentor answers through the learner's own Ollama (browser-side).
 * The chosen model name lives in this browser only. When Ollama can't be
 * reached, callers fall back to the cloud mentor.
 */

export const LOCAL_MENTOR_KEY = "ccaf.local_mentor_model";
const OLLAMA = "http://localhost:11434";

export function getLocalMentorModel(): string | null {
  try {
    return localStorage.getItem(LOCAL_MENTOR_KEY) || null;
  } catch {
    return null;
  }
}
export function setLocalMentorModel(model: string | null) {
  try {
    if (model) localStorage.setItem(LOCAL_MENTOR_KEY, model);
    else localStorage.removeItem(LOCAL_MENTOR_KEY);
  } catch {
    /* storage blocked */
  }
}

type Ctx = {
  stem?: string;
  scenario?: string | null;
  key_concept?: string | null;
  domain?: string;
  options?: { label: string; text: string }[];
  selectedOption?: string | null;
  /** P4.3 — exam label and Jev decision, matching the cloud mentor. */
  examName?: string | null;
  intent?: string | null;
  focus?: string | null;
} | null;

function systemPrompt(ctx: Ctx): string {
  const q = ctx?.stem
    ? `\n\nQuestion on screen (never reveal or hint which option is correct):\n${ctx.scenario ? `Scenario: ${ctx.scenario}\n` : ""}Stem: ${ctx.stem}\n${(ctx.options ?? []).map((o) => `${o.label}. ${o.text}`).join("\n")}${ctx.key_concept ? `\nKey concept: ${ctx.key_concept}` : ""}${ctx.selectedOption ? `\nLearner picked: ${ctx.selectedOption}` : ""}`
    : "";
  const exam = ctx?.examName ? ` for the ${ctx.examName} exam` : "";
  const focusHint =
    ctx?.focus === "scenario" ? "\nStart from the scenario paragraph."
    : ctx?.focus === "stem" ? "\nStart from what the question sentence is actually asking."
    : ctx?.focus === "option" ? "\nStart from the answer option the learner picked or named."
    : "";
  const intentHint = ctx?.intent ? `\nThe learner's turn is: ${ctx.intent.replace(/_/g, " ")}.` : "";
  return `You are a warm, concise exam tutor${exam}.${intentHint}${focusHint}
Teach the concept so the learner can decide; never give away the answer.
Format exactly: start with "[[brief]]" followed by one or two short spoken sentences, then "[[written]]" followed by the full written answer (plain prose, short paragraphs).${q}`;
}

/**
 * Streams answer text from Ollama. Returns false (without calling onDelta)
 * when Ollama isn't reachable, so the caller can use the cloud instead.
 */
export async function streamLocalMentor(args: {
  model: string;
  messages: { role: "user" | "assistant"; content: string }[];
  context: Ctx;
  onDelta: (text: string) => void;
  signal?: AbortSignal;
}): Promise<boolean> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST",
      signal: args.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: args.model,
        stream: true,
        keep_alive: "30m",
        messages: [{ role: "system", content: systemPrompt(args.context) }, ...args.messages.slice(-12)],
      }),
    });
  } catch {
    return false;
  }
  if (!res.ok || !res.body) return false;
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line) as { message?: { content?: string } };
        if (j.message?.content) args.onDelta(j.message.content);
      } catch {
        /* partial line */
      }
    }
  }
  return true;
}
