/**
 * Phase E4 — code multi-agent generation loop.
 *
 * Research (find the gap) → SME (write the example) → Verifier (check it runs)
 * → Documentation (explain it). Server-only. This module produces a *draft*
 * codebase plus a step-by-step trace; persistence and the retry/quality gate
 * arrive in E5, so nothing here writes to `codebases`.
 */

import { checkSyntax } from "./execution/diagnostics";
import type { CodebaseFile } from "./codebases";
import { retrieveChunks } from "./retrieval.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.7-flash";

export type CodegenLanguage = "python" | "javascript";
export type CodegenDifficulty = "beginner" | "intermediate" | "advanced";

export type CodegenAgent = "research" | "sme" | "verifier" | "documentation";

export type ResearchBrief = {
  gap: string;
  learningGoals: string[];
  mustCover: string[];
  misconceptions: string[];
};

export type CodegenStepOutput = {
  brief?: ResearchBrief;
  citations?: string[];
  title?: string;
  files?: string[];
  ok?: boolean;
  notes?: string[];
};

export type CodegenStep = {
  agent: CodegenAgent;
  status: "ok" | "error";
  summary: string;
  durationMs: number;
  output?: CodegenStepOutput;
  error?: string;
};

export type CodegenDraft = {
  conceptTag: string;
  title: string;
  description: string;
  language: CodegenLanguage;
  difficulty: CodegenDifficulty;
  files: CodebaseFile[];
  /** Documentation agent output: line-level walkthrough + misconceptions. */
  walkthrough: string;
  /** Verifier verdict; false means E5 should retry or discard. */
  verified: boolean;
  verifierNotes: string[];
  citations: string[];
};

export type CodegenResult = {
  steps: CodegenStep[];
  draft: CodegenDraft | null;
  error: string | null;
};

export type CodegenArgs = {
  conceptTag: string;
  conceptLabel: string;
  language: CodegenLanguage;
  difficulty: CodegenDifficulty;
  /** Concept tags already cached, so Research can aim at a real gap. */
  existingTags?: string[];
};

/* ---------------------------------------------------------------- gateway */

function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

async function callModel(args: {
  system: string;
  user: string;
  json: boolean;
  label: string;
}): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      ...(args.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new Error(`${args.label} is rate limited. Try again in a moment.`);
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Lovable settings.");
    throw new Error(`${args.label} failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

async function callJson<T>(args: { system: string; user: string; label: string }): Promise<T> {
  const raw = await callModel({ ...args, json: true });
  try {
    return JSON.parse(stripFences(raw)) as T;
  } catch {
    throw new Error(`${args.label} returned malformed JSON.`);
  }
}

/* ------------------------------------------------------------- 1. research */

async function researchAgent(args: CodegenArgs): Promise<{
  brief: ResearchBrief;
  citations: string[];
  context: string;
}> {
  let matches: Awaited<ReturnType<typeof retrieveChunks>> = [];
  try {
    matches = await retrieveChunks({
      query: `${args.conceptLabel} ${args.conceptTag.replace(/_/g, " ")}`,
      matchCount: 6,
      minSimilarity: 0.1,
    });
  } catch {
    matches = [];
  }

  const context = matches
    .map((m, i) => `[${i + 1}] ${m.title}\n${m.content}`)
    .join("\n\n---\n\n")
    .slice(0, 10_000);
  const citations = Array.from(new Set(matches.map((m) => m.title)));

  const brief = await callJson<ResearchBrief>({
    label: "Research agent",
    system:
      "You are the Research agent for a Claude Code Architect certification tutor. " +
      "You decide what a runnable code example must teach. Return ONLY JSON, no fences.",
    user: [
      `Concept: ${args.conceptLabel} (tag: ${args.conceptTag})`,
      `Target language: ${args.language}. Difficulty: ${args.difficulty}.`,
      args.existingTags?.length
        ? `Concepts already covered by cached examples: ${args.existingTags.slice(0, 60).join(", ")}`
        : "No cached examples exist yet.",
      "",
      "SOURCE MATERIAL:",
      context || "(no library material retrieved — stay conservative and generic)",
      "",
      'JSON shape: {"gap":string,"learningGoals":string[],"mustCover":string[],"misconceptions":string[]}',
    ].join("\n"),
  });

  return {
    brief: {
      gap: String(brief?.gap ?? "").slice(0, 800),
      learningGoals: (brief?.learningGoals ?? []).slice(0, 6).map(String),
      mustCover: (brief?.mustCover ?? []).slice(0, 8).map(String),
      misconceptions: (brief?.misconceptions ?? []).slice(0, 6).map(String),
    },
    citations,
    context,
  };
}

/* ------------------------------------------------------------------ 2. SME */

type SmeOutput = {
  title?: string;
  description?: string;
  files?: { name?: string; language?: string; content?: string }[];
};

function coerceFiles(raw: SmeOutput, language: CodegenLanguage): CodebaseFile[] {
  const ext = language === "python" ? ".py" : ".js";
  return (raw.files ?? [])
    .map((f, i) => ({
      name:
        typeof f?.name === "string" && f.name.trim()
          ? f.name.trim().replace(/[^\w.\-/]/g, "_")
          : `example_${i + 1}${ext}`,
      language: f?.language === "python" || f?.language === "javascript" ? f.language : language,
      content: typeof f?.content === "string" ? f.content.replace(/\r\n/g, "\n") : "",
    }))
    .filter((f) => f.content.trim().length > 0)
    .slice(0, 4);
}

async function smeAgent(
  args: CodegenArgs,
  research: { brief: ResearchBrief; context: string },
  repairNote?: string,
): Promise<{ title: string; description: string; files: CodebaseFile[] }> {
  const raw = await callJson<SmeOutput>({
    label: "SME agent",
    system:
      "You are the SME agent: a senior engineer writing SHORT, self-contained, runnable teaching examples. " +
      "Rules: no network calls, no third-party packages, no input(), deterministic output, " +
      "print the key results so a learner sees what happened, under 80 lines per file. " +
      "Return ONLY JSON, no fences.",
    user: [
      `Concept: ${args.conceptLabel}. Language: ${args.language}. Difficulty: ${args.difficulty}.`,
      `Gap to close: ${research.brief.gap}`,
      `Must cover: ${research.brief.mustCover.join("; ")}`,
      `Learning goals: ${research.brief.learningGoals.join("; ")}`,
      repairNote ? `The previous attempt failed verification: ${repairNote}. Fix it.` : "",
      "",
      "SOURCE MATERIAL:",
      research.context || "(none)",
      "",
      'JSON shape: {"title":string,"description":string,"files":[{"name":string,"language":"python"|"javascript","content":string}]}',
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const files = coerceFiles(raw, args.language);
  if (!files.length) throw new Error("SME agent returned no usable files.");

  return {
    title: (typeof raw.title === "string" && raw.title.trim()) || args.conceptLabel,
    description:
      (typeof raw.description === "string" && raw.description.trim()) ||
      `Runnable ${args.language} example for ${args.conceptLabel}.`,
    files,
  };
}

/* ------------------------------------------------------------- 3. verifier */

export type VerifierVerdict = { ok: boolean; notes: string[] };

const FORBIDDEN: { pattern: RegExp; note: string }[] = [
  { pattern: /\b(requests|urllib|httpx)\b/, note: "network access is not available in the sandbox" },
  { pattern: /\bfetch\s*\(/, note: "network access is not available in the sandbox" },
  { pattern: /\binput\s*\(/, note: "interactive input blocks the 10s sandbox run" },
  { pattern: /\bwhile\s+True\s*:/, note: "unbounded loop will hit the execution timeout" },
  { pattern: /\bwhile\s*\(\s*true\s*\)/i, note: "unbounded loop will hit the execution timeout" },
  { pattern: /\brequire\s*\(/, note: "module loading is unavailable in the isolated worker" },
];

/**
 * Static verification the server can perform on its own: syntax scan plus the
 * sandbox constraints the browser runners enforce. E5 layers real execution
 * and fail-safe retries on top of this verdict.
 */
export function verifyFiles(files: CodebaseFile[]): VerifierVerdict {
  const notes: string[] = [];

  for (const file of files) {
    const lang = file.language === "python" ? "python" : "javascript";
    for (const issue of checkSyntax(file.content, lang)) {
      notes.push(`${file.name}:${issue.line} — ${issue.message}`);
    }
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(file.content)) notes.push(`${file.name} — ${rule.note}`);
    }
    if (!/print\s*\(|console\.log\s*\(/.test(file.content)) {
      notes.push(`${file.name} — produces no visible output for the learner`);
    }
    if (file.content.split("\n").length > 120) {
      notes.push(`${file.name} — too long for a teaching example (>120 lines)`);
    }
  }

  return { ok: notes.length === 0, notes };
}

/* -------------------------------------------------------- 4. documentation */

async function documentationAgent(args: {
  conceptLabel: string;
  files: CodebaseFile[];
  brief: ResearchBrief;
}): Promise<string> {
  const code = args.files
    .map((f) => `--- ${f.name} (${f.language}) ---\n${f.content}`)
    .join("\n\n")
    .slice(0, 12_000);

  const text = await callModel({
    label: "Documentation agent",
    json: false,
    system:
      "You are the Documentation agent. Explain a teaching code example to a certification candidate: " +
      "a short purpose paragraph, a numbered line-by-line walkthrough of the important lines, " +
      "the design tradeoffs, and a 'Common misconceptions' list. Plain markdown, no code fences around whole files.",
    user: [
      `Concept: ${args.conceptLabel}`,
      `Learning goals: ${args.brief.learningGoals.join("; ")}`,
      `Known misconceptions: ${args.brief.misconceptions.join("; ")}`,
      "",
      code,
    ].join("\n"),
  });

  return text.trim();
}

/* ------------------------------------------------------------------- loop */

const now = () => Date.now();

/** Phase E5 — how many SME attempts the quality filter will spend. */
export const MAX_CODEGEN_ATTEMPTS = 3;

/**
 * Run the full four-agent loop with the Phase E5 quality filter:
 * SME → Verifier is retried up to `maxAttempts` times, each retry carrying the
 * verifier's complaints back to the SME. Broken attempts are discarded, never
 * returned as a usable draft. Never throws: a failed stage is recorded in
 * `steps` and surfaced through `error`.
 */
export async function runCodegenLoop(
  args: CodegenArgs & {
    maxAttempts?: number;
    /** Phase E6 — called as soon as each agent step completes, for live UI. */
    onStep?: (step: CodegenStep, all: CodegenStep[]) => void | Promise<void>;
  },
): Promise<CodegenResult> {
  const steps: CodegenStep[] = [];
  const emit = async (step: CodegenStep) => {
    steps.push(step);
    try {
      await args.onStep?.(step, steps);
    } catch {
      // Progress reporting must never break the generation loop.
    }
  };
  const maxAttempts = Math.min(Math.max(args.maxAttempts ?? MAX_CODEGEN_ATTEMPTS, 1), 5);

  // 1. Research
  let research: Awaited<ReturnType<typeof researchAgent>>;
  let t = now();
  try {
    research = await researchAgent(args);
    await emit({
      agent: "research",
      status: "ok",
      summary: research.brief.gap || "Gap identified",
      durationMs: now() - t,
      output: { brief: research.brief, citations: research.citations },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Research failed";
    await emit({ agent: "research", status: "error", summary: message, durationMs: now() - t, error: message });
    return { steps, draft: null, error: message };
  }

  // 2 + 3. SME → Verifier, retried until the example passes the quality filter.
  let sme: Awaited<ReturnType<typeof smeAgent>> | null = null;
  let verdict: VerifierVerdict = { ok: false, notes: ["No example was produced."] };
  let lastError: string | null = null;
  let repairNote: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    t = now();
    let candidate: Awaited<ReturnType<typeof smeAgent>>;
    try {
      candidate = await smeAgent(args, research, repairNote);
      await emit({
        agent: "sme",
        status: "ok",
        summary: `Attempt ${attempt}/${maxAttempts} — ${candidate.files.length} file(s) written`,
        durationMs: now() - t,
        output: { title: candidate.title, files: candidate.files.map((f) => f.name) },
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : "SME generation failed";
      await emit({
        agent: "sme",
        status: "error",
        summary: `Attempt ${attempt}/${maxAttempts} — ${lastError}`,
        durationMs: now() - t,
        error: lastError,
      });
      repairNote = lastError;
      continue;
    }

    t = now();
    const attemptVerdict = verifyFiles(candidate.files);
    await emit({
      agent: "verifier",
      status: attemptVerdict.ok ? "ok" : "error",
      summary: attemptVerdict.ok
        ? `Attempt ${attempt}/${maxAttempts} — passes verification`
        : `Attempt ${attempt}/${maxAttempts} — ${attemptVerdict.notes.length} issue(s), discarding`,
      durationMs: now() - t,
      output: attemptVerdict,
      ...(attemptVerdict.ok ? {} : { error: attemptVerdict.notes[0] }),
    });

    sme = candidate;
    verdict = attemptVerdict;
    if (attemptVerdict.ok) {
      lastError = null;
      break;
    }
    lastError = `Example failed verification: ${attemptVerdict.notes.slice(0, 3).join("; ")}`;
    repairNote = attemptVerdict.notes.slice(0, 5).join("; ");
    sme = null; // discard the broken attempt
  }

  if (!sme || !verdict.ok) {
    const message =
      lastError ?? `No example passed verification after ${maxAttempts} attempt(s).`;
    return { steps, draft: null, error: message };
  }

  // 4. Documentation
  let walkthrough = "";
  t = now();
  try {
    walkthrough = await documentationAgent({
      conceptLabel: args.conceptLabel,
      files: sme.files,
      brief: research.brief,
    });
    await emit({
      agent: "documentation",
      status: "ok",
      summary: `${walkthrough.length} characters of explanation`,
      durationMs: now() - t,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Documentation failed";
    await emit({
      agent: "documentation",
      status: "error",
      summary: message,
      durationMs: now() - t,
      error: message,
    });
  }

  return {
    steps,
    draft: {
      conceptTag: args.conceptTag,
      title: sme.title,
      description: sme.description,
      language: args.language,
      difficulty: args.difficulty,
      files: sme.files,
      walkthrough,
      verified: verdict.ok,
      verifierNotes: verdict.notes,
      citations: research.citations,
    },
    error: null,
  };
}

/**
 * Phase E5 — the save gate. A draft only reaches the `codebases` table when it
 * re-passes verification here; a broken script is discarded with a reason.
 */
export async function persistVerifiedDraft(
  draft: CodegenDraft,
): Promise<{ saved: boolean; id: string | null; reason: string | null }> {
  const verdict = verifyFiles(draft.files);
  if (!draft.verified || !verdict.ok) {
    return {
      saved: false,
      id: null,
      reason: `Discarded — ${(verdict.notes[0] ?? draft.verifierNotes[0]) ?? "failed verification"}`,
    };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("codebases")
    .insert({
      concept_tag: draft.conceptTag,
      language: draft.language,
      difficulty: draft.difficulty,
      title: draft.title,
      description: draft.description,
      files: draft.files,
    })
    .select("id")
    .single();

  if (error) return { saved: false, id: null, reason: error.message };
  return { saved: true, id: data?.id ?? null, reason: null };
}

/* ------------------------------------------------- Phase E6 — job tracking */

export type CodeGenJobStatus = "queued" | "running" | "succeeded" | "failed";

/** Create the tracking row for a run, so the UI can poll it while agents work. */
export async function createCodeGenJob(args: {
  userId: string;
  conceptTag: string;
  conceptLabel: string;
  language: CodegenLanguage;
  difficulty: CodegenDifficulty;
}): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("code_gen_jobs")
      .insert({
        created_by: args.userId,
        concept_tag: args.conceptTag,
        concept_label: args.conceptLabel,
        language: args.language,
        difficulty: args.difficulty,
        status: "queued",
        steps: [],
      })
      .select("id")
      .single();
    if (error) return null;
    return data?.id ?? null;
  } catch {
    return null;
  }
}

/** Patch a tracking row. Never throws — telemetry must not break a run. */
export async function updateCodeGenJob(
  jobId: string | null,
  patch: {
    status?: CodeGenJobStatus;
    currentAgent?: CodegenAgent | null;
    steps?: CodegenStep[];
    attempts?: number;
    error?: string | null;
    savedCodebaseId?: string | null;
  },
): Promise<void> {
  if (!jobId) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("code_gen_jobs")
      .update({
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.currentAgent !== undefined ? { current_agent: patch.currentAgent } : {}),
        ...(patch.steps ? { steps: patch.steps as unknown as never } : {}),
        ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
        ...(patch.savedCodebaseId !== undefined
          ? { saved_codebase_id: patch.savedCodebaseId }
          : {}),
      })
      .eq("id", jobId);
  } catch {
    // ignore
  }
}

/** The agent that logically runs after the one that just finished. */
export function nextAgentAfter(step: CodegenStep): CodegenAgent | null {
  if (step.agent === "research") return "sme";
  if (step.agent === "sme") return "verifier";
  if (step.agent === "verifier") return step.status === "ok" ? "documentation" : "sme";
  return null;
}
