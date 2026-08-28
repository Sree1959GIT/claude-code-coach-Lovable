/**
 * Enhancement 2.0 — Phase B: agentic question authoring loop.
 * Server-only. Runs Setter → Researcher → Adversary → Reviewer → Setter(revise)
 * and returns validated DRAFT questions. Nothing here publishes content.
 */

import { retrieveChunks, type LibraryMatch } from "./retrieval.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.7-flash";

export type DraftOption = {
  label: string;
  text: string;
  isCorrect: boolean;
  explanation: string | null;
};

export type AuthoredDraft = {
  scenario: string | null;
  stem: string;
  keyConcept: string | null;
  difficulty: "easy" | "medium" | "hard";
  options: DraftOption[];
  citations: { title: string; url: string | null }[];
  rationale: string | null;
  adversaryIssues: string[];
  reviewScore: number;
  reviewNotes: string | null;
  iteration: number;
};

export type SetContext = {
  /** Normalised stems already in the bank or in this batch. */
  existingStems: string[];
  /** Correct-label counts so far, to counter answer-position bias. */
  labelCounts: Record<string, number>;
  /** Distractor phrasings already used, to avoid repeated patterns. */
  usedDistractors: string[];
};

/** B7 — an existing question used to seed the loop in edit mode. */
export type BaseQuestion = {
  scenario: string | null;
  stem: string;
  keyConcept: string | null;
  difficulty: string;
  options: DraftOption[];
};

export type AuthoringArgs = {
  domainTitle: string;
  domainSlug: string;
  domainDescription?: string | null;
  count: number;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  topicHint?: string | null;
  /** Whitelisted hosts an admin configured; research never leaves these. */
  allowedSources: { label: string; host: string; url: string | null }[];
  setContext: SetContext;
  /** Edit mode: revise this live question instead of authoring a new one. */
  baseQuestion?: BaseQuestion | null;
  revisionNotes?: string | null;
};

export const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** B7 — field-level diff between the live question and a proposed revision. */
export type FieldDiff = { field: string; before: string; after: string };

export function diffQuestion(base: BaseQuestion, proposed: BaseQuestion): FieldDiff[] {
  const out: FieldDiff[] = [];
  const cmp = (field: string, before: unknown, after: unknown) => {
    const b = before == null ? "" : String(before);
    const a = after == null ? "" : String(after);
    if (norm(b) !== norm(a)) out.push({ field, before: b, after: a });
  };
  cmp("scenario", base.scenario, proposed.scenario);
  cmp("stem", base.stem, proposed.stem);
  cmp("keyConcept", base.keyConcept, proposed.keyConcept);
  cmp("difficulty", base.difficulty, proposed.difficulty);

  const labels = [...new Set([...base.options.map((o) => o.label), ...proposed.options.map((o) => o.label)])].sort();
  for (const label of labels) {
    const b = base.options.find((o) => o.label === label);
    const p = proposed.options.find((o) => o.label === label);
    cmp(`option ${label} text`, b?.text ?? "(none)", p?.text ?? "(removed)");
    cmp(`option ${label} correct`, b ? String(b.isCorrect) : "(none)", p ? String(p.isCorrect) : "(removed)");
    cmp(`option ${label} explanation`, b?.explanation ?? "", p?.explanation ?? "");
  }
  return out;
}


/* ------------------------------ gateway ------------------------------ */

async function chatJson(system: string, user: string): Promise<unknown> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Authoring agents are rate limited. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Lovable settings.");
    throw new Error(`Authoring call failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = (json.choices?.[0]?.message?.content ?? "")
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("An authoring agent returned malformed JSON.");
  }
}

/* ----------------------------- researcher ----------------------------- */

export type Evidence = {
  passages: LibraryMatch[];
  /** Source labels the Setter is allowed to cite. */
  allowed: string[];
  contextText: string;
};

/** B2 — Researcher: library-first, then only admin-whitelisted sources. */
export async function research(args: AuthoringArgs): Promise<Evidence> {
  const query = [args.domainTitle, args.domainDescription ?? "", args.topicHint ?? ""]
    .filter(Boolean)
    .join(" ")
    .slice(0, 500);

  let passages: LibraryMatch[] = [];
  try {
    passages = await retrieveChunks({ query, matchCount: 8, minSimilarity: 0.1 });
  } catch {
    passages = [];
  }

  const allowed = args.allowedSources.filter((s) => s.host).map((s) => `${s.label} (${s.host})`);
  const contextText = passages
    .map((p, i) => `[${i + 1}] ${p.title}${p.url ? ` — ${p.url}` : ""}\n${p.content}`)
    .join("\n\n---\n\n")
    .slice(0, 14_000);

  return { passages, allowed, contextText };
}

/* ------------------------------- setter ------------------------------- */

const SETTER_SYSTEM = `You are the SME item Setter for the Claude Code Architect certification.
Write scenario-based, single-best-answer multiple choice items that mirror the real exam. Rules:
- Exactly 4 options labelled A, B, C, D; exactly one correct.
- Distractors must be plausible to a knowledgeable candidate, never absurd.
- Never use "all of the above" / "none of the above".
- Every option needs a one-sentence explanation.
- Ground every factual claim in the supplied source material. Do not invent product behaviour.
- Vary which label is correct; avoid reusing distractor phrasings supplied as already-used.
Return ONLY valid JSON.`;

const SHAPE = `{"questions":[{"scenario":string|null,"stem":string,"keyConcept":string,"difficulty":"easy"|"medium"|"hard","rationale":string,"options":[{"label":"A","text":string,"isCorrect":boolean,"explanation":string}]}]}`;

function setterPrompt(args: AuthoringArgs, ev: Evidence): string {
  const { setContext: sc } = args;
  return [
    `Domain: ${args.domainTitle} (${args.domainSlug})`,
    args.domainDescription ? `Domain description: ${args.domainDescription}` : "",
    args.topicHint ? `Focus topic: ${args.topicHint}` : "",
    args.baseQuestion
      ? [
          "EDIT MODE — revise the existing question below rather than writing a new one.",
          "Keep what already works; change only what is weak, unclear or unsupported.",
          `EXISTING QUESTION: ${JSON.stringify(args.baseQuestion).slice(0, 4000)}`,
          args.revisionNotes ? `EDITOR NOTES: ${args.revisionNotes}` : "",
          "Return exactly 1 revised item.",
        ]
          .filter(Boolean)
          .join("\n")
      : `Write ${args.count} item(s) at difficulty: ${args.difficulty}.`,
    "",
    "SET CONTEXT (avoid duplicating these):",
    sc.existingStems.slice(0, 60).map((s) => `- ${s.slice(0, 140)}`).join("\n") || "(bank is empty)",
    `Correct-label distribution so far: ${JSON.stringify(sc.labelCounts)} — balance it.`,
    sc.usedDistractors.length
      ? `Distractor phrasings already used: ${sc.usedDistractors.slice(0, 30).join(" | ").slice(0, 1200)}`
      : "",
    "",
    ev.allowed.length ? `Approved external sources (reference only): ${ev.allowed.join(", ")}` : "",
    "SOURCE MATERIAL:",
    ev.contextText || "(no library material retrieved — stay conservative and general)",
    "",
    `JSON shape: ${SHAPE}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function coerce(raw: unknown): Omit<AuthoredDraft, "citations" | "adversaryIssues" | "reviewScore" | "reviewNotes" | "iteration">[] {
  const list = Array.isArray((raw as { questions?: unknown })?.questions)
    ? ((raw as { questions: unknown[] }).questions as Record<string, unknown>[])
    : [];
  const out: ReturnType<typeof coerce> = [];

  for (const q of list) {
    const stem = typeof q["stem"] === "string" ? q["stem"].trim() : "";
    const opts = Array.isArray(q["options"]) ? (q["options"] as Record<string, unknown>[]) : [];
    const options: DraftOption[] = opts
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
      rationale: typeof q["rationale"] === "string" ? q["rationale"].trim() : null,
    });
  }
  return out;
}

/** B1 — Setter: draft (or revise) items. */
export async function setItems(
  args: AuthoringArgs,
  ev: Evidence,
  revision?: { drafts: AuthoredDraft[]; issues: string[] },
) {
  const user = revision
    ? [
        setterPrompt(args, ev),
        "",
        "REVISE the following drafts to resolve every issue listed. Keep the same JSON shape.",
        JSON.stringify({ drafts: revision.drafts.map(({ scenario, stem, keyConcept, difficulty, options }) => ({ scenario, stem, keyConcept, difficulty, options })) }),
        `ISSUES: ${revision.issues.join(" | ")}`,
      ].join("\n")
    : setterPrompt(args, ev);
  return coerce(await chatJson(SETTER_SYSTEM, user));
}

/* ----------------------------- adversary ----------------------------- */

const ADVERSARY_SYSTEM = `You are the Adversary reviewing certification items.
Attack each item: ambiguous stems, multiple defensible correct answers, giveaway wording,
implausible distractors, factual claims unsupported by the sources, and duplication with the set context.
Return ONLY JSON: {"items":[{"index":number,"issues":[string],"fatal":boolean}]}`;

/** B3 — Adversary: adversarial critique of the drafted set. */
export async function attack(
  drafts: ReturnType<typeof coerce>,
  ev: Evidence,
): Promise<{ index: number; issues: string[]; fatal: boolean }[]> {
  if (drafts.length === 0) return [];
  const raw = await chatJson(
    ADVERSARY_SYSTEM,
    [
      "SOURCE MATERIAL:",
      ev.contextText.slice(0, 8000) || "(none)",
      "",
      "ITEMS:",
      JSON.stringify(drafts.map((d, i) => ({ index: i, ...d }))).slice(0, 14_000),
    ].join("\n"),
  );
  const list = Array.isArray((raw as { items?: unknown })?.items)
    ? ((raw as { items: unknown[] }).items as Record<string, unknown>[])
    : [];
  return list.map((it, i) => ({
    index: typeof it["index"] === "number" ? it["index"] : i,
    issues: Array.isArray(it["issues"]) ? (it["issues"] as unknown[]).map(String) : [],
    fatal: it["fatal"] === true,
  }));
}

/* ------------------------------ reviewer ------------------------------ */

const REVIEWER_SYSTEM = `You are the Reviewer scoring certification items for release readiness.
Score 0-100 on: exam realism, single defensible answer, distractor quality, explanation quality, grounding.
Return ONLY JSON: {"items":[{"index":number,"score":number,"notes":string}]}`;

/** B4 — Reviewer: score each item and leave reviewer notes. */
export async function review(
  drafts: ReturnType<typeof coerce>,
): Promise<{ index: number; score: number; notes: string }[]> {
  if (drafts.length === 0) return [];
  const raw = await chatJson(
    REVIEWER_SYSTEM,
    JSON.stringify(drafts.map((d, i) => ({ index: i, ...d }))).slice(0, 14_000),
  );
  const list = Array.isArray((raw as { items?: unknown })?.items)
    ? ((raw as { items: unknown[] }).items as Record<string, unknown>[])
    : [];
  return list.map((it, i) => ({
    index: typeof it["index"] === "number" ? it["index"] : i,
    score: Math.max(0, Math.min(100, Number(it["score"]) || 0)),
    notes: typeof it["notes"] === "string" ? it["notes"] : "",
  }));
}

/* ---------------------------- orchestration ---------------------------- */

export type AuthoringStep = {
  agent: "researcher" | "setter" | "adversary" | "reviewer";
  status: "ok" | "error";
  detail: string;
  durationMs: number;
};

export type AuthoringResult = {
  drafts: AuthoredDraft[];
  steps: AuthoringStep[];
  evidenceCount: number;
};

/** B5 — run the full loop with one revision pass when the Adversary finds issues. */
export async function runAuthoringLoop(args: AuthoringArgs): Promise<AuthoringResult> {
  const steps: AuthoringStep[] = [];
  const timed = async <T,>(agent: AuthoringStep["agent"], fn: () => Promise<T>, detail: (r: T) => string): Promise<T> => {
    const t0 = Date.now();
    try {
      const r = await fn();
      steps.push({ agent, status: "ok", detail: detail(r), durationMs: Date.now() - t0 });
      return r;
    } catch (err) {
      steps.push({
        agent,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
      });
      throw err;
    }
  };

  const ev = await timed("researcher", () => research(args), (r) => `${r.passages.length} passages`);
  let drafted = await timed("setter", () => setItems(args, ev), (r) => `${r.length} drafts`);

  const issues = await timed("adversary", () => attack(drafted, ev), (r) => `${r.length} critiques`);
  const blocking = issues.filter((i) => i.issues.length > 0);

  if (blocking.length > 0) {
    const revised = await timed(
      "setter",
      () =>
        setItems(args, ev, {
          drafts: drafted as unknown as AuthoredDraft[],
          issues: blocking.flatMap((b) => b.issues),
        }),
      (r) => `${r.length} revised drafts`,
    ).catch(() => drafted);
    if (revised.length > 0) drafted = revised;
  }

  const scores = await timed("reviewer", () => review(drafted), (r) => `${r.length} scored`);

  const citations = ev.passages.map((p) => ({ title: p.title, url: p.url ?? null }));
  const seen = new Set(args.baseQuestion ? [] : args.setContext.existingStems.map(norm));

  const drafts: AuthoredDraft[] = [];
  drafted.forEach((d, i) => {
    if (seen.has(norm(d.stem))) return;
    seen.add(norm(d.stem));
    const score = scores.find((s) => s.index === i);
    drafts.push({
      ...d,
      citations,
      adversaryIssues: issues.find((x) => x.index === i)?.issues ?? [],
      reviewScore: score?.score ?? 0,
      reviewNotes: score?.notes ?? null,
      iteration: blocking.length > 0 ? 2 : 1,
    });
  });

  return {
    drafts: drafts.slice(0, args.baseQuestion ? 1 : args.count),
    steps,
    evidenceCount: ev.passages.length,
  };
}

/* ------------------------ C6 — batch set authoring ------------------------ */

const STOP = new Set([
  "the","a","an","of","to","in","for","and","or","is","are","which","what","that","this","with","on","by","as","be","you","your","it","its","at","from","should","would","most","best",
]);

function tokens(s: string): Set<string> {
  return new Set(
    norm(s)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP.has(t)),
  );
}

/** Jaccard similarity between two stems (0..1). */
export function stemSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}

export type BankItem = { id: string; stem: string; domainTitle: string };
export type DuplicateHit = { questionId: string; stem: string; domainTitle: string; similarity: number };

/** Nearest existing bank question above the threshold, if any. */
export function findNearDuplicate(stem: string, bank: BankItem[], threshold = 0.7): DuplicateHit | null {
  let best: DuplicateHit | null = null;
  for (const q of bank) {
    const sim = stemSimilarity(stem, q.stem);
    if (sim >= threshold && (!best || sim > best.similarity)) {
      best = {
        questionId: q.id,
        stem: q.stem,
        domainTitle: q.domainTitle,
        similarity: Math.round(sim * 100) / 100,
      };
    }
  }
  return best;
}

export type PersistDraftInput = {
  domainId: string;
  runId: string | null;
  userId: string;
  sortOrder: number;
  draft: {
    scenario: string | null;
    stem: string;
    keyConcept: string | null;
    difficulty: string;
    options: DraftOption[];
    citations: { title: string; url: string | null }[];
    rationale: string | null;
    adversaryIssues: string[];
    reviewScore: number;
    reviewNotes: string | null;
    iteration: number;
  };
};

/**
 * Insert one authored item as a DRAFT question plus a pending review row.
 * Shared by the auto-queue path and the per-item accept path.
 */
export async function persistAuthoredDraft(
  supabaseAdmin: any,
  input: PersistDraftInput,
): Promise<{ questionId: string | null; error: string | null }> {
  const d = input.draft;
  const { data: inserted, error } = await supabaseAdmin
    .from("questions")
    .insert({
      domain_id: input.domainId,
      scenario: d.scenario,
      stem: d.stem,
      key_concept: d.keyConcept,
      difficulty: d.difficulty,
      sort_order: input.sortOrder,
      status: "draft",
      origin: "agentic",
      author_id: input.userId,
    })
    .select("id")
    .single();
  if (error) return { questionId: null, error: `Insert failed: ${error.message}` };

  const { error: optErr } = await supabaseAdmin.from("question_options").insert(
    d.options.map((o, idx) => ({
      question_id: inserted.id,
      label: o.label,
      text: o.text,
      is_correct: o.isCorrect,
      explanation: o.explanation,
      sort_order: idx,
    })),
  );
  if (optErr) {
    await supabaseAdmin.from("questions").delete().eq("id", inserted.id);
    return { questionId: null, error: `Options failed: ${optErr.message}` };
  }

  await supabaseAdmin.from("question_drafts").insert({
    domain_id: input.domainId,
    base_question_id: inserted.id,
    run_id: input.runId,
    iteration: d.iteration,
    status: "pending",
    payload: { scenario: d.scenario, stem: d.stem, options: d.options, difficulty: d.difficulty },
    rationale: d.rationale,
    citations: d.citations,
    review_score: d.reviewScore,
    review_notes: d.reviewNotes,
    created_by: input.userId,
  });

  await supabaseAdmin.from("content_reviews").insert({
    question_id: inserted.id,
    status: "pending",
    source: "agentic",
    submitted_by: input.userId,
    notes: [
      `Agentic draft · reviewer ${d.reviewScore}/100`,
      d.adversaryIssues.length ? `adversary: ${d.adversaryIssues.slice(0, 2).join("; ")}` : "adversary: clean",
      d.citations.length ? `sources: ${d.citations.slice(0, 2).map((c) => c.title).join("; ")}` : "ungrounded",
    ].join(" · "),
  });

  return { questionId: inserted.id, error: null };
}
