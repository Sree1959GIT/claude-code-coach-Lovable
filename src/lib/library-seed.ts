/**
 * Sub-task 5: seed corpus for the RAG library.
 *
 * Curated study notes distilled from Anthropic's public docs, engineering
 * posts, and Code w/ Claude sessions. Each note carries the source link (and
 * video timestamp when relevant) so retrieved chunks can be cited back to the
 * original material.
 */

import type { IngestDoc } from "./ingest.server";

export const SEED_LIBRARY: IngestDoc[] = [
  {
    title: "Prompting fundamentals for Claude",
    source: "Anthropic · The prompting playbook",
    url: "https://www.youtube.com/watch?v=G2B0YWuJUgI&t=120s",
    kind: "note",
    tags: ["prompting", "system prompt", "few-shot", "xml", "clarity"],
    content: `Effective Claude prompts are explicit, structured, and grounded in the task's real context.

Be clear and direct. Claude does not infer unstated constraints. State the goal, the audience, the output format, and what must not happen. Vague prompts produce plausible but unusable output; a prompt that names the deliverable ("return a JSON array of five objects with keys id and rationale") removes ambiguity.

Use the system prompt for role and durable rules. Put the persona, tone, safety boundaries, and standing constraints in the system prompt, and keep the turn-by-turn user message focused on the immediate request. System-prompt content persists across the conversation, so it is the right place for policy that must never be dropped.

Structure long prompts with XML tags. Wrapping distinct blocks — <instructions>, <context>, <examples>, <output_format> — lets Claude parse boundaries reliably. This matters most when a prompt mixes reference documents with instructions: without delimiters the model can mistake document text for a command, which is also a prompt-injection risk.

Use few-shot examples to specify behaviour that is hard to describe. Two to five examples that demonstrate edge cases, tone, and exact formatting will outperform a paragraph of description. Examples should be diverse and should include at least one hard or ambiguous case with the desired handling.

Let Claude think before answering. For multi-step reasoning, ask for a scratchpad section before the final answer, then have the model emit the answer in a clearly delimited block. Extended thinking helps most on analysis, planning, and math; it adds latency and cost on simple lookups.

Prefill and stop sequences control shape. Prefilling the assistant turn with the opening of the expected structure (for example an opening brace) forces format compliance. Stop sequences prevent trailing commentary.

Iterate empirically. Write a small eval set of representative inputs with graded expected behaviour, change one variable at a time, and measure. Prompt quality is an empirical question, not a stylistic one.`,
  },
  {
    title: "Prompting for agents and tool use",
    source: "Anthropic · Prompting for Agents (Code w/ Claude)",
    url: "https://www.youtube.com/watch?v=XSZP9GhhuAc&t=300s",
    kind: "note",
    tags: ["prompting", "agents", "tool use", "system prompt", "orchestration"],
    content: `Agent prompts differ from single-turn prompts: the model acts in a loop, so the prompt must describe how to decide, not just what to say.

Give the agent a job description. State the objective, the definition of done, the tools it may use, the resources it may read or write, and the conditions under which it must stop and ask a human. Ambiguity in the stopping condition is the most common cause of runaway agents.

Write tool descriptions like API documentation for a new teammate. Each tool needs a precise name, a one-line purpose, parameter semantics with units and formats, expected return shape, failure modes, and guidance on when to prefer it over a sibling tool. Most "the agent picked the wrong tool" failures are documentation failures, not model failures.

Keep the tool surface small. Overlapping tools force the model to disambiguate on every step. Consolidate near-duplicates and prefer a few well-scoped, composable tools over dozens of narrow ones.

Plan then act. Ask the agent to produce an explicit plan before its first tool call, and to re-plan when a tool result contradicts its assumptions. Instruct it to verify its work — re-read the file it wrote, re-run the test — rather than assuming success.

Handle errors in the prompt. Tell the agent what to do on a tool error: retry with backoff for transient failures, change approach after repeated failures, and surface the problem to the user rather than fabricating a result.

Budget the loop. Cap iterations and tool calls, and require a summary of progress when the budget is exhausted. Long-horizon agents should checkpoint state so the work is resumable.`,
  },
  {
    title: "Context engineering for AI agents",
    source: "Anthropic Engineering",
    url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents",
    kind: "note",
    tags: ["context", "context window", "memory", "compaction", "retrieval"],
    content: `Context engineering is the discipline of curating what occupies the model's limited attention budget at each step. Prompt engineering asks "what do I write"; context engineering asks "what set of tokens should be present at this turn".

Treat context as a finite resource. Attention degrades as context grows — the effect often called context rot. More tokens is not more capability; irrelevant material actively competes with the signal. Aim for the smallest set of high-signal tokens that makes the correct action likely.

Right-size the system prompt. Avoid two failure modes: brittle hardcoded if/else logic for every case, and vague high-level guidance that assumes shared context. Target the altitude in between — concrete heuristics organised under clear headings.

Prefer just-in-time retrieval over pre-loading. Rather than stuffing every document into context, give the agent identifiers (file paths, URLs, record ids) and tools to fetch content when needed. Progressive disclosure lets the agent discover structure incrementally, and metadata such as folder layout or naming conventions is itself a signal.

Compact long conversations. When approaching the window limit, summarise the transcript into a compact record of decisions, open questions, and artefacts, then restart with that summary plus the few most recent messages. Tune compaction to preserve decisions and drop redundant tool output.

Use structured note-taking as external memory. Persisting a to-do list or progress file outside the context window lets an agent carry state across compactions and sessions at near-zero token cost.

Split work across sub-agents. Specialised sub-agents explore with their own clean context windows and return condensed summaries to the orchestrator, keeping the main thread's context focused on synthesis.`,
  },
  {
    title: "Building agents with the Claude Agent SDK",
    source: "Anthropic · Claude Agent SDK",
    url: "https://www.youtube.com/watch?v=OZ-aLrJ0oVg&t=90s",
    kind: "note",
    tags: ["agents", "agent sdk", "tool use", "orchestration", "subagents", "mcp"],
    content: `The Claude Agent SDK packages the agent loop — gather context, take action, verify work, repeat — so applications do not reimplement it.

The core loop. The agent receives a goal, gathers context through search and file tools, chooses an action, executes it, observes the result, and verifies against the definition of done. Verification is what separates a reliable agent from a plausible-looking one: run the test, diff the file, re-query the record.

Tools and MCP. Built-in tools cover file access, shell, and search. The Model Context Protocol connects external systems — databases, ticketing, internal APIs — through a standard server interface, so the same tool definitions work across clients. MCP servers should scope their permissions narrowly.

Subagents. Delegate bounded investigations to subagents with their own context windows and restricted tool sets. The orchestrator receives a summary, not the whole transcript, which preserves the main context budget and allows parallel exploration.

Hooks and permissions. Hooks fire deterministic code at lifecycle points — before a tool call, after a response — for logging, validation, secret redaction, or blocking dangerous operations. Permission modes decide which actions run automatically and which require human approval; destructive operations should stay behind approval by default.

Memory files. A project-level instructions file gives the agent durable conventions — build commands, code style, architectural rules — that survive session boundaries.

Deployment. Agents run headless in CI, as a service, or interactively. Production deployments need budget caps, structured logging of tool calls, and an audit trail of what the agent changed.`,
  },
  {
    title: "Evaluating and safeguarding agents",
    source: "Anthropic · Tips for building AI agents",
    url: "https://www.youtube.com/watch?v=LP5OCa20Zpg&t=60s",
    kind: "note",
    tags: ["safety", "evaluation", "guardrails", "reliability", "hallucination"],
    content: `Reliability comes from evaluation and constraint, not from prompt wording alone.

Build evals before scaling. Start with a small set of real tasks with graded outcomes. Measure end-state correctness — did the record actually change, does the test pass — rather than whether the transcript looks reasonable. Add every production failure to the eval set.

Grade with rubrics and LLM judges carefully. An LLM judge needs an explicit rubric, examples of each score, and periodic human spot-checks for drift. Deterministic checks are preferable wherever the outcome is machine-verifiable.

Reduce hallucination structurally. Ground answers in retrieved documents, require citations to specific passages, allow the model to answer "I don't know", and verify claims against the source before acting on them. Ask for direct quotes first, then reasoning over those quotes.

Defend against prompt injection. Treat all fetched content — web pages, tool output, user files — as untrusted data, never as instructions. Delimit it clearly, and never let retrieved text expand the agent's permissions. Sensitive actions must require a fresh authorisation path independent of document content.

Constrain blast radius. Least-privilege credentials, allow-lists for destructive operations, dry-run modes, spend and iteration caps, and human approval gates for irreversible steps. Log every tool call with inputs and outputs.

Monitor in production. Track tool-error rates, loop lengths, cost per task, and human-intervention frequency. Regressions usually appear in these operational metrics before users report them.`,
  },
  {
    title: "Claude Code workflows and deployment",
    source: "Anthropic · Building with Claude Code",
    url: "https://www.youtube.com/watch?v=DAQJvGjlgVM&t=45s",
    kind: "note",
    tags: ["claude code", "workflow", "cli", "deployment", "prototyping", "hooks"],
    content: `Claude Code is an agentic coding tool that works in the terminal against a real repository.

Explore, plan, code, commit. Ask Claude to read the relevant files and explain the current behaviour before proposing changes. Have it produce a plan, confirm the plan, then implement. Small, verifiable steps beat one large diff.

Project memory. A committed instructions file at the repo root records build and test commands, directory conventions, style rules, and things never to touch. It is loaded on every session, so it is the cheapest way to prevent repeated mistakes.

Test-driven agentic work. Ask for failing tests first, confirm they fail for the right reason, then let the agent implement until they pass. This gives the agent a machine-checkable definition of done.

Headless and CI use. Claude Code runs non-interactively for batch tasks — triage, migrations, lint fixes — with output piped into the surrounding pipeline. Scope credentials tightly in automation.

Hooks and permissions. Pre- and post-tool hooks enforce formatting, block edits to protected paths, and log activity. Keep destructive shell commands behind explicit approval.

Multi-instance patterns. Run separate instances or git worktrees for parallel workstreams, one writing code and another reviewing, to keep contexts clean and avoid conflicting edits.`,
  },
  {
    title: "Tool use and function calling in depth",
    source: "docs.claude.com · Tool use overview",
    url: "https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview",
    kind: "doc",
    tags: ["tool use", "function calling", "agents", "mcp", "json schema"],
    content: `Tool use lets Claude call functions you define and incorporate the results into its response.

Definition shape. Each tool has a name, a description, and a JSON Schema input specification. The description is the primary control surface: describe purpose, when to use and when not to use, parameter meaning with units and formats, and what the result looks like. Detailed descriptions measurably improve selection accuracy.

The request flow. You send messages plus tool definitions; Claude may return a tool_use block with a name and input. Your application executes the tool and returns a tool_result block referencing the same tool_use id. Claude then continues, possibly calling more tools, until it produces a final answer. Results must be returned in the same order and with matching ids.

Parallel and sequential calls. Independent lookups can be issued in parallel in one turn; dependent steps must be sequential because each depends on the prior result. Prompts should say when parallelism is acceptable.

Controlling tool choice. Tool choice can be automatic, forced to any tool, forced to a specific tool, or disabled. Forcing a tool is useful for structured extraction where a schema-conforming object is always required.

Errors. Return errors as tool results with an error flag and an actionable message rather than throwing away the turn; the model can then retry or change approach. Validate all tool inputs server-side — the model's output is untrusted input to your system.

MCP. The Model Context Protocol standardises tool servers so the same integrations work across clients, with the server owning authentication and scope.`,
  },
  {
    title: "Reducing hallucinations and strengthening guardrails",
    source: "docs.claude.com · Reduce hallucinations",
    url: "https://docs.claude.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-hallucinations",
    kind: "doc",
    tags: ["hallucination", "guardrails", "safety", "citations", "evaluation", "rag"],
    content: `Hallucination is reduced by grounding, permission to abstain, and verification.

Allow uncertainty. Explicitly permit "I don't have enough information to answer" and reward it in evaluation. Models fabricate most often when the prompt implies an answer is mandatory.

Ground in provided documents. Supply source material in the context, instruct the model to answer only from it, and require quoted evidence for each claim. A useful pattern: first extract verbatim quotes relevant to the question, then compose the answer strictly from those quotes, then cite them.

Cite precisely. Citations should point at a passage or chunk identifier, not a whole document, so a reviewer can check the claim in seconds.

Verify with a second pass. Ask the model to review its own answer against the sources and flag unsupported statements, or run a separate verification call with the answer and sources as input. For high-stakes output, add deterministic checks — numbers recomputed, identifiers looked up.

Use retrieval well. Chunk documents at paragraph granularity with overlap, embed and index them, retrieve top-k for the query, and pass only the retrieved passages. Retrieval quality bounds answer quality; if the right passage is not retrieved, no prompt fixes the answer.

Guardrails beyond the prompt. Constrain output formats with schemas, validate before use, keep untrusted content clearly delimited as data, and route sensitive actions through explicit approval.`,
  },
];
