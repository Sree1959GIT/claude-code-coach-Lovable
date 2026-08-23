/**
 * Stage 8 sub-task 8.2 — AI question generator (draft).
 * Server-only. Grounds generation in retrieved library chunks and returns
 * validated draft questions; persistence happens in generate.functions.ts.
 */

import { retrieveChunks, type LibraryMatch } from "./retrieval.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

export type GeneratedOption = {
  label: string;
  text: string;
  isCorrect: boolean;
  explanation: string | null;
};

export type GeneratedQuestion = {
  scenario: string | null;
  stem: string;
  keyConcept: string | null;
  difficulty: "easy" | "medium" | "hard";
  options: GeneratedOption[];
  citations: string[];
};

export type GenerateArgs = {
  domainTitle: string;
  domainSlug: string;
  domainDescription?: string | null;
  count: number;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  topicHint?: string | null;
};

const SYSTEM = `You are an exam-item writer for the Claude Code Architect certification.
Write scenario-based, single-best-answer multiple choice questions that mirror a
professional certification exam. Rules:
- Exactly 4 options labelled A, B, C, D; exactly one is correct.
- Distractors must be plausible and defensible, never absurd.
- Never say "all of the above" or "none of the above".
- Every option gets a one-sentence explanation of why it is right or wrong.
- Ground the item in the supplied source material; do not invent product behaviour.
Return ONLY valid JSON, no markdown fences.`;

function buildUserPrompt(args: GenerateArgs, context: string): string {
  return [
    `Domain: ${args.domainTitle} (${args.domainSlug})`,
    args.domainDescription ? `Domain description: ${args.domainDescription}` : "",
    args.topicHint ? `Focus topic: ${args.topicHint}` : "",
    `Write ${args.count} question(s) at difficulty: ${args.difficulty}.`,
    "",
    "SOURCE MATERIAL:",
    context || "(no library material retrieved — rely on general Claude Code knowledge and keep claims conservative)",
    "",
    `JSON shape:
{"questions":[{"scenario":string|null,"stem":string,"keyConcept":string,"difficulty":"easy"|"medium"|"hard","options":[{"label":"A","text":string,"isCorrect":boolean,"explanation":string}]}]}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

function coerceQuestions(raw: unknown, citations: string[]): GeneratedQuestion[] {
  const list = Array.isArray((raw as { questions?: unknown })?.questions)
    ? ((raw as { questions: unknown[] }).questions as Record<string, unknown>[])
    : [];
  const out: GeneratedQuestion[] = [];

  for (const q of list) {
    const stem = typeof q["stem"] === "string" ? q["stem"].trim() : "";
    const opts = Array.isArray(q["options"]) ? (q["options"] as Record<string, unknown>[]) : [];
    const options: GeneratedOption[] = opts
      .map((o, i) => ({
        label: (typeof o["label"] === "string" && o["label"].trim()) || String.fromCharCode(65 + i),
        text: typeof o["text"] === "string" ? o["text"].trim() : "",
        isCorrect: o["isCorrect"] === true,
        explanation: typeof o["explanation"] === "string" ? o["explanation"].trim() : null,
      }))
      .filter((o) => o.text.length > 0);

    if (!stem || options.length < 3) continue;
    if (options.filter((o) => o.isCorrect).length !== 1) continue;

    const difficulty = ["easy", "medium", "hard"].includes(String(q["difficulty"]))
      ? (q["difficulty"] as "easy" | "medium" | "hard")
      : "medium";

    out.push({
      scenario: typeof q["scenario"] === "string" && q["scenario"].trim() ? q["scenario"].trim() : null,
      stem,
      keyConcept: typeof q["keyConcept"] === "string" && q["keyConcept"].trim() ? q["keyConcept"].trim() : null,
      difficulty,
      options,
      citations,
    });
  }
  return out;
}

/** Retrieve grounding passages for a domain-focused generation request. */
async function grounding(args: GenerateArgs): Promise<LibraryMatch[]> {
  const query = [args.domainTitle, args.domainDescription ?? "", args.topicHint ?? ""]
    .filter(Boolean)
    .join(" ")
    .slice(0, 500);
  try {
    return await retrieveChunks({ query, matchCount: 6, minSimilarity: 0.1 });
  } catch {
    return [];
  }
}

export async function generateQuestionDrafts(args: GenerateArgs): Promise<GeneratedQuestion[]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const matches = await grounding(args);
  const context = matches
    .map((m, i) => `[${i + 1}] ${m.title}${m.url ? ` — ${m.url}` : ""}\n${m.content}`)
    .join("\n\n---\n\n")
    .slice(0, 12_000);
  const citations = Array.from(new Set(matches.map((m) => m.title)));

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildUserPrompt(args, context) },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Generator is rate limited. Try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Lovable settings.");
    throw new Error(`Generation failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(content));
  } catch {
    throw new Error("Generator returned malformed JSON. Try again.");
  }

  return coerceQuestions(parsed, citations).slice(0, args.count);
}
