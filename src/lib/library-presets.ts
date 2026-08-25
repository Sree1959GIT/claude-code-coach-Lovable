/**
 * Stage 8 sub-task 8.6 — library source expansion.
 *
 * Named ingest presets grouping curated docs sets and changelogs. Each preset
 * carries its own tag set so retrieved chunks stay attributable, and can be
 * re-indexed (force re-embed) independently of the base seed corpus.
 *
 * Client-safe: pure data, no server-only imports.
 */

export type PresetDoc = {
  title: string;
  source: string;
  url?: string | null;
  kind?: string;
  tags?: string[];
  content: string;
};

export type IngestPreset = {
  id: string;
  label: string;
  description: string;
  tags: string[];
  docs: PresetDoc[];
};

export const INGEST_PRESETS: IngestPreset[] = [
  {
    id: "claude-code-docs",
    label: "Claude Code docs set",
    description:
      "Working notes on Claude Code: CLAUDE.md project memory, permissions, subagents, hooks and MCP wiring.",
    tags: ["claude-code", "docs", "tooling"],
    docs: [
      {
        title: "Claude Code project memory (CLAUDE.md)",
        source: "Anthropic · Claude Code docs",
        url: "https://docs.anthropic.com/en/docs/claude-code/memory",
        kind: "doc",
        tags: ["claude-code", "claude.md", "memory", "conventions"],
        content: `CLAUDE.md is the durable project memory Claude Code loads at the start of every session in a repository.

Put standing facts in it: how to run the app, how to run tests, directory layout, naming and style conventions, forbidden patterns, and deployment specifics. Anything a new teammate would need on day one belongs here; anything true only for today's task does not.

Memory is layered. A user-level memory file applies across all projects, a project-level CLAUDE.md is committed and shared with the team, and nested CLAUDE.md files in subdirectories scope rules to that part of the tree. More specific files refine, not replace, the broader ones.

Keep it short and imperative. Long narrative memory competes for the same attention budget as the task; bullet-style rules ("run bun test, never npm test") are followed more reliably than prose.

Treat it as living configuration. When Claude repeats a mistake, the fix is usually a memory rule, not a longer prompt. Review the file when conventions change so stale rules do not steer work in the wrong direction.`,
      },
      {
        title: "Permissions, tools and safe autonomy in Claude Code",
        source: "Anthropic · Claude Code docs",
        url: "https://docs.anthropic.com/en/docs/claude-code/settings",
        kind: "doc",
        tags: ["claude-code", "permissions", "tools", "safety"],
        content: `Claude Code asks before it acts. Tool use is gated by a permission model that distinguishes read-only operations from mutating ones.

Reads are cheap and generally allowed: listing files, reading source, searching. Writes, shell commands, and network calls prompt for approval unless an allowlist rule already covers them.

Allowlists live in settings files and can be scoped per project or per user. Grant narrow rules ("allow bun test", "allow git status") rather than blanket permission; broad approval removes the human checkpoint that catches destructive commands.

Deny rules take precedence and are the right tool for protecting secrets, production credentials, and infrastructure directories.

For unattended runs, pair a tight allowlist with a sandbox and an explicit iteration budget. Autonomy is safe in proportion to how narrow the blast radius is, not how capable the model is.`,
      },
      {
        title: "Subagents, hooks and MCP servers",
        source: "Anthropic · Claude Code docs",
        url: "https://docs.anthropic.com/en/docs/claude-code/sub-agents",
        kind: "doc",
        tags: ["claude-code", "subagents", "hooks", "mcp", "architecture"],
        content: `Claude Code extends through three mechanisms: subagents, hooks, and MCP servers.

Subagents are specialised assistants with their own prompt, tool set, and clean context window. Delegating research or verification to a subagent keeps the main thread's context focused: the subagent explores widely and returns a condensed summary. Give each subagent a narrow charter and only the tools it needs.

Hooks are deterministic shell commands bound to lifecycle events — before a tool call, after a file edit, at session end. Use them for guarantees the model should not be trusted to remember: formatting after every write, running a linter, blocking edits to protected paths. A hook is policy; a prompt is a request.

MCP servers expose external systems — issue trackers, databases, documentation, internal APIs — as tools through a standard protocol. Prefer a small number of well-documented MCP tools over many overlapping ones, and describe each tool's parameters and failure modes precisely, because tool selection quality tracks documentation quality.`,
      },
    ],
  },
  {
    id: "model-changelog",
    label: "Model & platform changelog",
    description:
      "Release-note style notes on model families, context windows, extended thinking and pricing levers that show up in exam scenarios.",
    tags: ["changelog", "models", "platform"],
    docs: [
      {
        title: "Claude model family selection",
        source: "Anthropic · Model overview",
        url: "https://docs.anthropic.com/en/docs/about-claude/models",
        kind: "changelog",
        tags: ["models", "opus", "sonnet", "haiku", "selection", "cost"],
        content: `Model choice is an engineering trade-off between capability, latency and cost, and exam scenarios usually test whether you can justify the pick.

Opus-class models are the most capable at long-horizon reasoning, ambiguous refactors and multi-step planning. Use them where a wrong answer is expensive and the volume is low.

Sonnet-class models are the default for production agents: strong reasoning and coding at materially lower cost and latency. Most orchestration, code generation and analysis workloads should start here.

Haiku-class models are optimised for throughput: classification, routing, extraction, summarisation of short inputs, and high-volume checks. Using a small model as a router in front of a larger one is a standard cost pattern.

Mixed-model architectures are normal. A cheap model triages and retrieves, a mid-tier model drafts, and a frontier model reviews only the hard cases. Measure quality per dollar on a real eval set rather than defaulting to the largest model.`,
      },
      {
        title: "Extended thinking, context windows and caching",
        source: "Anthropic · Platform changelog notes",
        url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching",
        kind: "changelog",
        tags: ["extended thinking", "context window", "prompt caching", "batch", "cost"],
        content: `Three platform levers dominate cost and latency planning.

Extended thinking gives the model a visible reasoning budget before it answers. It improves multi-step analysis, planning and math, and adds latency plus output tokens. Enable it selectively per request type; do not switch it on globally for lookups and formatting tasks.

Large context windows let you place entire documents in the prompt, but attention degrades as context grows. Retrieval that puts the right few thousand tokens in context usually beats stuffing the window, and it costs less.

Prompt caching makes a long, stable prefix — system prompt, tool definitions, reference documents — cheap to reuse across requests. Structure prompts so the stable material comes first and the variable turn content last, otherwise the cache never hits. Batch processing trades latency for a large discount on non-interactive workloads.`,
      },
    ],
  },
  {
    id: "agent-patterns",
    label: "Agent architecture patterns",
    description:
      "Reference patterns for building effective agents: workflows vs agents, evaluation, and production guardrails.",
    tags: ["agents", "architecture", "patterns"],
    docs: [
      {
        title: "Workflows versus agents",
        source: "Anthropic Engineering · Building effective agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        kind: "note",
        tags: ["agents", "workflows", "routing", "orchestrator", "patterns"],
        content: `Not every LLM system should be an agent. Workflows orchestrate models through predefined code paths; agents let the model direct its own process and tool use.

Prefer the simplest pattern that works. A single well-prompted call with retrieval solves more problems than teams expect. Add structure only when measurement shows it is needed.

Common workflow patterns: prompt chaining decomposes a task into ordered steps with checks between them; routing classifies an input and sends it to a specialised handler; parallelisation runs independent subtasks or votes across several attempts; orchestrator-workers has a lead model decompose work and dispatch it to workers; evaluator-optimiser loops a generator against a critic until quality passes.

Use an agent when the number of steps cannot be predicted, when the path depends on intermediate results, and when the environment gives reliable feedback the model can act on. Agents cost more and fail in less predictable ways, so they need iteration caps, checkpoints and human stopping points.`,
      },
      {
        title: "Evaluating and operating agents in production",
        source: "Anthropic Engineering",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        kind: "note",
        tags: ["evals", "observability", "guardrails", "production", "testing"],
        content: `An agent without an eval set is unmaintainable: every prompt change is an unmeasured risk.

Build a golden set of representative tasks with graded expectations — required facts, forbidden behaviours, expected tool sequence. Score automatically where you can (exact match, schema validity, tool-call correctness) and use an LLM judge with a rubric where you cannot. Run the set on every prompt, model or tool change.

Instrument the loop. Log each step's inputs, tool calls, outputs, latency and tokens so a bad answer can be traced to the step that caused it. Aggregate token spend per run to catch regressions in loop length.

Guardrails belong in code, not only in prompts: validate tool arguments, enforce allowlists, cap iterations and spend, and require human approval for irreversible actions. Degrade gracefully — return a partial result with an explanation rather than a fabricated one when a dependency fails.`,
      },
    ],
  },
];
