/**
 * Stage 8 sub-task 8.5 — explanation enrichment job.
 * Server-only. Drafts grounded, cited explanations for options that have none.
 */

import { retrieveChunks, type LibraryMatch } from "./retrieval.server";
import { routedCompletion, type MembershipTier } from "./model-routing.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";


export type EnrichOptionInput = {
  optionId: string;
  label: string;
  text: string;
  isCorrect: boolean;
};

export type EnrichQuestionInput = {
  questionId: string;
  stem: string;
  scenario: string | null;
  domainTitle: string;
  options: EnrichOptionInput[];
  /** Only these options need an explanation. */
  missing: string[];
};

export type EnrichedExplanation = {
  optionId: string;
  label: string;
  explanation: string;
};

export type EnrichedQuestion = {
  questionId: string;
  stem: string;
  domainTitle: string;
  citations: { title: string; url: string | null }[];
  explanations: EnrichedExplanation[];
};

const SYSTEM = `You write answer explanations for the Claude Code Architect certification.
Rules:
- One or two sentences per option, factual and specific.
- For the correct option, say why it is the best answer; for a distractor, say precisely why it fails.
- Ground every claim in the supplied source material; never invent product behaviour.
- If the source material does not cover a point, stay conservative and general.
Return ONLY valid JSON, no markdown fences.`;

function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

async function grounding(q: EnrichQuestionInput): Promise<LibraryMatch[]> {
  const query = [q.domainTitle, q.scenario ?? "", q.stem].filter(Boolean).join(" ").slice(0, 500);
  try {
    return await retrieveChunks({ query, matchCount: 5, minSimilarity: 0.1 });
  } catch {
    return [];
  }
}

function buildUserPrompt(q: EnrichQuestionInput, context: string): string {
  const options = q.options
    .map((o) => `${o.label}. ${o.text} [${o.isCorrect ? "CORRECT" : "distractor"}]${q.missing.includes(o.optionId) ? " <-- needs explanation" : ""}`)
    .join("\n");
  return [
    `Domain: ${q.domainTitle}`,
    q.scenario ? `Scenario: ${q.scenario}` : "",
    `Question: ${q.stem}`,
    "",
    "Options:",
    options,
    "",
    "SOURCE MATERIAL:",
    context || "(no library material retrieved — keep claims conservative)",
    "",
    'JSON shape: {"explanations":[{"label":"A","explanation":string}]}',
    "Only include labels marked as needing an explanation.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function enrichQuestionExplanations(
  q: EnrichQuestionInput,
  opts?: { tier?: MembershipTier },
): Promise<EnrichedQuestion> {
  const matches = await grounding(q);
  const context = matches
    .map((m, i) => `[${i + 1}] ${m.title}${m.url ? ` — ${m.url}` : ""}\n${m.content}`)
    .join("\n\n---\n\n")
    .slice(0, 10_000);

  // Phase F1: cache-first, tier-aware routing.
  const routed = await routedCompletion({
    task: "enrich_explanation",
    tier: opts?.tier ?? "plus",
    label: "Enrichment",
    jsonMode: true,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: buildUserPrompt(q, context) },
    ],
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(routed.text));
  } catch {
    throw new Error("Enrichment returned malformed JSON. Try again.");
  }



  const raw = Array.isArray((parsed as { explanations?: unknown })?.explanations)
    ? ((parsed as { explanations: unknown[] }).explanations as Record<string, unknown>[])
    : [];

  const byLabel = new Map(q.options.map((o) => [o.label.trim().toUpperCase(), o]));
  const explanations: EnrichedExplanation[] = [];
  for (const r of raw) {
    const label = typeof r["label"] === "string" ? r["label"].trim().toUpperCase() : "";
    const text = typeof r["explanation"] === "string" ? r["explanation"].trim() : "";
    const option = byLabel.get(label);
    if (!option || !text) continue;
    if (!q.missing.includes(option.optionId)) continue;
    explanations.push({ optionId: option.optionId, label: option.label, explanation: text });
  }

  return {
    questionId: q.questionId,
    stem: q.stem,
    domainTitle: q.domainTitle,
    citations: matches.map((m) => ({ title: m.title, url: m.url ?? null })),
    explanations,
  };
}
