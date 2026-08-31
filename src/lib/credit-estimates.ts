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
    status: "next",
    baseLow: 180,
    baseHigh: 320,
    options: [
      { id: "s5-vector", label: "Vector store + embeddings", hint: "pgvector schema + embedding pipeline", low: 40, high: 70, default: true },
      { id: "s5-ingest", label: "Document ingestion", hint: "Chunking, dedupe, refresh jobs", low: 35, high: 65, default: true },
      { id: "s5-cite", label: "Citation-grounded answers", hint: "Retrieval + inline source markers", low: 35, high: 65, default: true },
      { id: "s5-auth-docs", label: "Authenticated source fetching", hint: "Credentialed access to gated material", low: 30, high: 70 },
      { id: "s5-admin", label: "Library admin viewer", hint: "Browse and re-index chunks", low: 25, high: 50 },
    ],
  },
  {
    id: "stage6",
    code: "06",
    name: "Multi-Agent Backbone + Admin",
    summary: "Research agents, content update jobs, admin panel, scheduled runs.",
    status: "planned",
    baseLow: 200,
    baseHigh: 380,
    options: [
      { id: "s6-orchestrator", label: "Agent orchestrator", hint: "Task graph + retries + logging", low: 50, high: 90, default: true },
      { id: "s6-admin", label: "Admin panel", hint: "Role-gated content and user management", low: 40, high: 75, default: true },
      { id: "s6-cron", label: "Scheduled jobs", hint: "Cron endpoints + run history", low: 25, high: 50, default: true },
      { id: "s6-review", label: "Human review queue", hint: "Approve agent-generated questions", low: 35, high: 70 },
      { id: "s6-eval", label: "Agent eval harness", hint: "Golden set + regression scoring", low: 40, high: 80 },
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
