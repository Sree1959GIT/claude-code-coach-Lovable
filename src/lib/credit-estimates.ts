export type EstimateOption = {
  id: string;
  label: string;
  hint: string;
  /** Credit delta applied to the stage base range when selected. */
  low: number;
  high: number;
  /** Selected by default. */
  default?: boolean;
};

export type Stage = {
  id: string;
  code: string;
  name: string;
  summary: string;
  status: "done" | "next" | "planned";
  baseLow: number;
  baseHigh: number;
  options: EstimateOption[];
};

/**
 * Ranges are build-credit estimates. Actual usage-based cost depends on
 * complexity and how many iterations a stage needs. Plan-mode messages
 * cost 1 credit each and are counted separately.
 */
export const STAGES: Stage[] = [
  {
    id: "stage1",
    code: "01",
    name: "Landing Page + Auth",
    summary: "Marketing page, theming, email/password + Google auth, analytics events.",
    status: "done",
    baseLow: 90,
    baseHigh: 150,
    options: [
      { id: "s1-dark", label: "Light + dark mode", hint: "Token set + persisted toggle", low: 10, high: 20, default: true },
      { id: "s1-google", label: "Google OAuth", hint: "Provider config + callback handling", low: 10, high: 20, default: true },
      { id: "s1-analytics", label: "Event analytics", hint: "Page views and CTA tracking", low: 10, high: 25, default: true },
      { id: "s1-copy", label: "Custom illustrations / generated art", hint: "Image generation passes", low: 15, high: 35, default: true },
    ],
  },
  {
    id: "stage2",
    code: "02",
    name: "Study Hub + Exam UI + Analytics",
    summary: "Question bank schema, domain hub, exam runner, charts dashboard.",
    status: "done",
    baseLow: 120,
    baseHigh: 200,
    options: [
      { id: "s2-schema", label: "Question bank schema + seed", hint: "Domains, questions, options, attempts", low: 20, high: 35, default: true },
      { id: "s2-runner", label: "Exam-anatomy runner", hint: "Scenario layout, instant feedback", low: 25, high: 45, default: true },
      { id: "s2-charts", label: "Charts dashboard", hint: "Accuracy, cadence, domain heatmap", low: 20, high: 40, default: true },
      { id: "s2-import", label: "Bulk question import tooling", hint: "CSV/JSON ingestion + validation", low: 25, high: 50, default: true },
    ],
  },
  {
    id: "stage3",
    code: "03",
    name: "SME Voice Mentor",
    summary: "Streaming mentor, TTS narration, live talk, highlight sync, references.",
    status: "done",
    baseLow: 150,
    baseHigh: 260,
    options: [
      { id: "s3-stream", label: "SSE streaming responses", hint: "Server route + client reader", low: 25, high: 45, default: true },
      { id: "s3-tts", label: "Text-to-speech narration", hint: "Gateway TTS + audio playback", low: 25, high: 45, default: true },
      { id: "s3-live", label: "Live two-way voice", hint: "Continuous mic + turn handling", low: 30, high: 60, default: true },
      { id: "s3-highlight", label: "Highlight sync while speaking", hint: "Marker parsing + blink states", low: 20, high: 40, default: true },
      { id: "s3-video", label: "Video reference modal", hint: "Curated links + timestamped playback", low: 20, high: 45, default: true },
    ],
  },
  {
    id: "stage4",
    code: "04",
    name: "Adaptive Learning Engine",
    summary: "FSRS scheduling, mastery tracking, weak-area drills, timed exam simulator.",
    status: "done",
    baseLow: 150,
    baseHigh: 260,
    options: [
      { id: "s4-fsrs", label: "FSRS-4.5 scheduler", hint: "Stability, difficulty, due dates", low: 30, high: 55, default: true },
      { id: "s4-sessions", label: "Session engine", hint: "Adaptive / weak-area / exam modes", low: 30, high: 55, default: true },
      { id: "s4-timer", label: "Timed exam simulator", hint: "65 Q / 90 min with persistence", low: 20, high: 40, default: true },
      { id: "s4-analytics2", label: "Analytics v2", hint: "Mastery curves, streaks, distribution", low: 25, high: 45, default: true },
    ],
  },
  {
    id: "stage5",
    code: "05",
    name: "RAG Library",
    summary: "Ingest Anthropic docs and course material, vector search, cited answers.",
    status: "done",
    baseLow: 180,
    baseHigh: 320,
    options: [
      { id: "s5-vector", label: "Vector store + embeddings", hint: "pgvector schema + embedding pipeline", low: 40, high: 70, default: true },
      { id: "s5-ingest", label: "Document ingestion", hint: "Chunking, dedupe, refresh jobs", low: 35, high: 65, default: true },
      { id: "s5-cite", label: "Citation-grounded answers", hint: "Retrieval + inline source markers", low: 35, high: 65, default: true },
      { id: "s5-auth-docs", label: "Authenticated source fetching", hint: "Credentialed access to gated material — not built yet", low: 30, high: 70 },
      { id: "s5-admin", label: "Library admin viewer", hint: "Browse and re-index chunks", low: 25, high: 50, default: true },
    ],
  },
  {
    id: "stage6",
    code: "06",
    name: "Multi-Agent Backbone + Admin",
    summary: "Research agents, content update jobs, admin panel, scheduled runs.",
    status: "done",
    baseLow: 200,
    baseHigh: 380,
    options: [
      { id: "s6-orchestrator", label: "Agent orchestrator", hint: "Task graph + retries + logging", low: 50, high: 90, default: true },
      { id: "s6-admin", label: "Admin panel", hint: "Role-gated content and user management", low: 40, high: 75, default: true },
      { id: "s6-cron", label: "Scheduled jobs", hint: "Cron endpoints + run history", low: 25, high: 50, default: true },
      { id: "s6-review", label: "Human review queue", hint: "Approve agent-generated questions", low: 35, high: 70, default: true },
      { id: "s6-eval", label: "Agent eval harness", hint: "Golden set + regression scoring", low: 40, high: 80, default: true },
    ],
  },
  {
    id: "stage7",
    code: "07",
    name: "Exam Readiness",
    summary: "Readiness score, mock exams, score reports, streaks, mistake bank.",
    status: "done",
    baseLow: 90,
    baseHigh: 160,
    options: [
      { id: "s7-readiness", label: "Readiness model + trend", hint: "Blueprint-weighted score over time", low: 20, high: 40, default: true },
      { id: "s7-mock", label: "Full mock exam", hint: "90-minute weighted simulator", low: 20, high: 40, default: true },
      { id: "s7-report", label: "Score reports + study plan", hint: "Printable report, per-domain plan", low: 20, high: 40, default: true },
      { id: "s7-mistakes", label: "Mistake bank + re-test", hint: "Missed questions with retry loop", low: 15, high: 30, default: true },
      { id: "s7-goals", label: "Daily goals, streaks, exam-day card", hint: "Cadence nudges and checklist", low: 15, high: 30, default: true },
    ],
  },
  {
    id: "stage8",
    code: "08",
    name: "Content Scale-Up",
    summary: "Bulk import, AI generation, duplicate and distractor audits, calibration.",
    status: "done",
    baseLow: 80,
    baseHigh: 150,
    options: [
      { id: "s8-generate", label: "AI question generation", hint: "Gateway generation into review", low: 20, high: 40, default: true },
      { id: "s8-dupes", label: "Duplicate detection", hint: "Embedding similarity across the bank", low: 15, high: 30, default: true },
      { id: "s8-distractor", label: "Distractor + explanation audit", hint: "Quality flags and enrichment", low: 20, high: 40, default: true },
      { id: "s8-citation", label: "Citation coverage report", hint: "Per-domain grounded percentage", low: 15, high: 25, default: true },
      { id: "s8-calibration", label: "Difficulty calibration", hint: "Recompute difficulty from live accuracy", low: 15, high: 30, default: true },
    ],
  },
  {
    id: "phaseABC",
    code: "A–C",
    name: "Agentic Authoring",
    summary: "Draft lifecycle, SME/Researcher/Adversary/Reviewer loop, authoring workspace and review queue.",
    status: "done",
    baseLow: 20,
    baseHigh: 30,
    options: [
      { id: "abc-data", label: "Draft lifecycle + sources registry", hint: "A1–A4 status, origin, question_drafts", low: 8, high: 12, default: true },
      { id: "abc-loop", label: "Agent loop (SME → Reviewer)", hint: "B1–B7 including edit/revision mode", low: 14, high: 20, default: true },
      { id: "abc-ui", label: "Authoring UI + roles + hardening", hint: "C1–C9 workspace, diffs, batch, roles", low: 18, high: 26, default: true },
    ],
  },
  {
    id: "phaseDE",
    code: "D–E",
    name: "CodeCanvas",
    summary: "Floating code workspace with in-browser execution, cached codebases and agentic generation.",
    status: "next",
    baseLow: 10,
    baseHigh: 16,
    options: [
      { id: "de-shell", label: "Floating window shell + tabs", hint: "D1–D3 drag, resize, persist, syntax view", low: 6, high: 10, default: true },
      { id: "de-exec", label: "WASM execution + results", hint: "D4–D7 Pyodide/JS worker, timeout, logs", low: 8, high: 14, default: true },
      { id: "de-content", label: "Cached codebases + generation loop", hint: "E1–E9 schema, cache, agents, advice data", low: 16, high: 24, default: true },
    ],
  },
  {
    id: "phaseF",
    code: "F",
    name: "Cost, BYOK & Observability",
    summary: "Cost-aware routing, generation cost logging, BYOK keys and per-user budgets.",
    status: "planned",
    baseLow: 8,
    baseHigh: 12,
    options: [
      { id: "f-routing", label: "Cost-aware routing + logging", hint: "F1–F3 cheap-first, cache stats dashboard", low: 6, high: 10, default: true },
      { id: "f-byok", label: "BYOK keys + budgets", hint: "F4–F6 encrypted keys, limits, rate limits", low: 6, high: 10, default: true },
    ],
  },
  {
    id: "phaseG",
    code: "G",
    name: "Content Scale-Up Remainder",
    summary: "Import error reporting, source manager, chunk quality, blueprint coverage.",
    status: "planned",
    baseLow: 6,
    baseHigh: 10,
    options: [
      { id: "g-import-errors", label: "Import error report UI", hint: "Row-level failure surfacing", low: 2, high: 3, default: true },
      { id: "g-sources", label: "Library source manager", hint: "Add/remove URLs, last-crawl tracking", low: 2, high: 3, default: true },
      { id: "g-auth-fetch", label: "Authenticated source fetching", hint: "Credentialed access to gated material", low: 2, high: 4 },
      { id: "g-chunks", label: "Chunk quality pass + coverage report", hint: "Strip boilerplate, blueprint coverage", low: 4, high: 6, default: true },
    ],
  },
  {
    id: "phaseH",
    code: "H",
    name: "Polish & Launch",
    summary: "Mobile, accessibility, loading states, SEO, onboarding, security scan, publish.",
    status: "planned",
    baseLow: 12,
    baseHigh: 18,
    options: [
      { id: "h-mobile", label: "Mobile + accessibility pass", hint: "Three-frame layout, focus, ARIA", low: 4, high: 6, default: true },
      { id: "h-states", label: "Loading states + error boundaries", hint: "Every route covered", low: 2, high: 3, default: true },
      { id: "h-seo", label: "SEO + onboarding", hint: "Route metadata, OG images, first-run flow", low: 4, high: 6, default: true },
      { id: "h-launch", label: "Security scan + publish", hint: "RLS re-verify, dependency scan, smoke test", low: 4, high: 6, default: true },
    ],
  },
];


export type Complexity = "lean" | "standard" | "polished";

export const COMPLEXITY: Record<Complexity, { label: string; hint: string; factor: number }> = {
  lean: { label: "Lean", hint: "Ship the core, accept rough edges", factor: 0.8 },
  standard: { label: "Standard", hint: "Normal build with a few iterations", factor: 1 },
  polished: { label: "Polished", hint: "Design passes, edge cases, more review loops", factor: 1.3 },
};

export function stageEstimate(
  stage: Stage,
  selected: Set<string>,
  complexity: Complexity,
  iterations: number,
) {
  let low = stage.baseLow;
  let high = stage.baseHigh;
  for (const opt of stage.options) {
    if (selected.has(opt.id)) {
      low += opt.low;
      high += opt.high;
    }
  }
  const factor = COMPLEXITY[complexity].factor;
  // Each extra iteration round costs roughly 8-14% of the stage build.
  const iterFactor = 1 + Math.max(0, iterations - 1) * 0.11;
  return {
    low: Math.round(low * factor * iterFactor),
    high: Math.round(high * factor * iterFactor),
  };
}

export function defaultSelection(): Set<string> {
  const s = new Set<string>();
  for (const stage of STAGES) {
    for (const opt of stage.options) if (opt.default) s.add(opt.id);
  }
  return s;
}
