export type LearnResource = {
  title: string;
  source: string;
  /** YouTube video id — when present the card opens an in-app player. */
  videoId?: string;
  /** Deep-link start time in seconds. */
  start?: number;
  /** External doc link — opens in a new tab. */
  url?: string;
  tags: string[];
};

/**
 * Curated Anthropic-first learning resources. Video timestamps deep-link into
 * the section that explains the concept, so the mentor can point at the exact
 * moment being discussed.
 */
export const RESOURCES: LearnResource[] = [
  {
    title: "The prompting playbook",
    source: "Anthropic · YouTube",
    videoId: "G2B0YWuJUgI",
    start: 120,
    tags: ["prompting", "prompt", "system prompt", "few-shot", "xml", "clarity"],
  },
  {
    title: "Prompting for Agents — Code w/ Claude",
    source: "Anthropic · YouTube",
    videoId: "XSZP9GhhuAc",
    start: 300,
    tags: ["prompting", "agents", "tool use", "system prompt", "agent"],
  },
  {
    title: "Effective context engineering for AI agents",
    source: "Anthropic Engineering",
    url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents",
    tags: ["context", "context window", "memory", "compaction", "retrieval"],
  },
  {
    title: "Building agents with the Claude Agent SDK",
    source: "Anthropic · YouTube",
    videoId: "OZ-aLrJ0oVg",
    start: 90,
    tags: ["agents", "agent sdk", "tool use", "orchestration", "subagents"],
  },
  {
    title: "Claude Agent SDK — Full Workshop",
    source: "Anthropic · YouTube",
    videoId: "TqC1qOfiVcQ",
    start: 600,
    tags: ["agent sdk", "deployment", "hooks", "mcp", "agents"],
  },
  {
    title: "Tips for building AI agents",
    source: "Anthropic · YouTube",
    videoId: "LP5OCa20Zpg",
    start: 60,
    tags: ["agents", "safety", "evaluation", "guardrails", "reliability"],
  },
  {
    title: "Building and prototyping with Claude Code",
    source: "Anthropic · YouTube",
    videoId: "DAQJvGjlgVM",
    start: 45,
    tags: ["claude code", "deployment", "workflow", "cli", "prototyping"],
  },
  {
    title: "Introducing Claude Code",
    source: "Anthropic · YouTube",
    videoId: "AJpK3YTTKZ4",
    tags: ["claude code", "overview", "deployment", "workflow"],
  },
  {
    title: "Claude Docs — Tool use & agents",
    source: "docs.claude.com",
    url: "https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview",
    tags: ["tool use", "agents", "function calling", "mcp"],
  },
  {
    title: "Claude Docs — Safety & guardrails",
    source: "docs.claude.com",
    url: "https://docs.claude.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-hallucinations",
    tags: ["safety", "guardrails", "hallucination", "evaluation"],
  },
];

export function thumbnailFor(r: LearnResource): string | null {
  return r.videoId ? `https://i.ytimg.com/vi/${r.videoId}/mqdefault.jpg` : null;
}

/** Rank resources by keyword overlap with the current question context. */
export function matchResources(
  terms: (string | null | undefined)[],
  limit = 3,
): LearnResource[] {
  const hay = terms.filter(Boolean).join(" ").toLowerCase();
  if (!hay) return RESOURCES.slice(0, limit);
  const scored = RESOURCES.map((r) => ({
    r,
    score: r.tags.reduce((n, t) => (hay.includes(t) ? n + t.length : n), 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  const hits = scored.filter((s) => s.score > 0).map((s) => s.r);
  return (hits.length ? hits : RESOURCES).slice(0, limit);
}
