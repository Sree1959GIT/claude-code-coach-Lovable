/**
 * Phase D3/D5/D6 — Study Canvas multi-file reader: tabs, read-only syntax-
 * highlighted pane (Python + JavaScript), copy utilities, run controls
 * (10s timeout, cancel, console pane), plus pre-run syntax validation and
 * diagnostic runtime error display with line numbers and stack traces.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Copy, Play, Square, Terminal } from "lucide-react";
import { toast } from "sonner";
import { TOKEN_CLASS, tokenizeLine, type LineState, type Token } from "@/lib/syntax-highlight";
import {
  checkSyntax,
  parseDiagnostic,
  type Diagnostic,
  type SyntaxIssue,
} from "@/lib/execution/diagnostics";
import {
  DEFAULT_TIMEOUT_MS,
  getExecutionProvider,
  type ExecutionResult,
} from "@/lib/execution";

export type CanvasLanguage = "python" | "javascript";

export type CanvasFile = {
  name: string;
  language: CanvasLanguage;
  content: string;
};

const LANG_BADGE: Record<CanvasLanguage, string> = {
  python: "PY",
  javascript: "JS",
};

type ConsoleLine = { stream: "stdout" | "stderr"; text: string };

type RunState =
  | { phase: "idle" }
  | { phase: "running"; startedAt: number }
  | { phase: "done"; result: ExecutionResult };

export function StudyCanvasTabs({ files }: { files: CanvasFile[] }) {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState("");
  const [runState, setRunState] = useState<RunState>({ phase: "idle" });
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [syntaxIssues, setSyntaxIssues] = useState<SyntaxIssue[]>([]);
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);


  const current = files[Math.min(active, Math.max(0, files.length - 1))];
  const lines = useMemo(
    () => (current ? current.content.replace(/\n$/, "").split("\n") : []),
    [current],
  );

  // Highlight every line, threading multi-line string/comment state forward.
  const highlighted = useMemo<Token[][]>(() => {
    if (!current) return [];
    let state: LineState = { block: null };
    return lines.map((line) => {
      const res = tokenizeLine(line, current.language, state);
      state = res.state;
      return res.tokens;
    });
  }, [lines, current]);

  // Phase D6 — lines flagged by a runtime error or the pre-run syntax check.
  const errorLines = useMemo(() => {
    const map = new Map<number, string>();
    for (const issue of syntaxIssues) map.set(issue.line, issue.message);
    if (diagnostic) for (const n of diagnostic.lines) map.set(n, diagnostic.message);
    return map;
  }, [syntaxIssues, diagnostic]);

  // Clear diagnostics when switching files.
  useEffect(() => {
    setSyntaxIssues([]);
    setDiagnostic(null);
  }, [current?.name]);


  useEffect(() => {
    function onSelectionChange() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !panelRef.current) {
        setSelection("");
        return;
      }
      const node = sel.anchorNode;
      if (node && panelRef.current.contains(node)) {
        setSelection(sel.toString());
      } else {
        setSelection("");
      }
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  if (files.length === 0) {
    return (
      <div className="p-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        No_Files_Loaded
      </div>
    );
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next =
      e.key === "ArrowRight"
        ? (active + 1) % files.length
        : (active - 1 + files.length) % files.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  async function copyFile() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current.content);
      toast.success(`Copied ${current.name}`);
    } catch {
      toast.error("Copy failed — clipboard unavailable");
    }
  }

  async function copySelection() {
    if (!selection) return;
    try {
      await navigator.clipboard.writeText(selection);
      toast.success("Copied selection");
    } catch {
      toast.error("Copy failed — clipboard unavailable");
    }
  }

  // Auto-scroll the console as output streams in.
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ block: "end" });
  }, [consoleLines, runState.phase]);

  async function runActiveFile() {
    if (!current || runState.phase === "running") return;

    // Phase D6 — pre-run syntax validation gate.
    const issues = checkSyntax(current.content, current.language);
    setSyntaxIssues(issues);
    setDiagnostic(null);
    if (issues.length > 0) {
      setConsoleLines([]);
      setRunState({ phase: "idle" });
      toast.warning(
        `Syntax check failed — ${issues.length} issue${issues.length > 1 ? "s" : ""} found`,
      );
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = Date.now();
    setConsoleLines([]);
    setRunState({ phase: "running", startedAt });
    try {
      const provider = getExecutionProvider(current.language);
      const result = await provider.run({
        code: current.content,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        signal: controller.signal,
        onOutput: (chunk) =>
          setConsoleLines((prev) => [
            ...prev,
            { stream: chunk.stream, text: chunk.text },
          ]),
      });
      setRunState({ phase: "done", result });
      const detail = result.error ?? result.stderr;
      setDiagnostic(
        !result.ok && !result.cancelled && !result.timedOut && detail
          ? parseDiagnostic(detail, current.language, lines.length)
          : null,
      );
      if (result.cancelled) toast("Run cancelled");
      else if (result.timedOut) toast.error(result.error ?? "Timed out");
      else if (!result.ok) toast.error("Run failed — see console");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRunState({
        phase: "done",
        result: {
          ok: false,
          value: null,
          stdout: "",
          stderr: "",
          error: message,
          durationMs: Date.now() - startedAt,
          timedOut: false,
          cancelled: false,
        },
      });
      setDiagnostic(parseDiagnostic(message, current.language, lines.length));
      toast.error(message);
    } finally {
      abortRef.current = null;
    }
  }


  function cancelRun() {
    abortRef.current?.abort();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        role="tablist"
        aria-label="Canvas files"
        onKeyDown={onKeyDown}
        className="flex shrink-0 overflow-x-auto border-b border-border bg-muted/30"
      >
        {files.map((f, i) => {
          const isActive = i === active;
          return (
            <button
              key={f.name}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              id={`canvas-tab-${i}`}
              aria-selected={isActive}
              aria-controls={`canvas-panel-${i}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActive(i)}
              className={`flex shrink-0 items-center gap-2 border-r border-border px-3 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                isActive
                  ? "border-b-2 border-b-primary bg-card text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="truncate normal-case tracking-normal">{f.name}</span>
              <span className="border border-border px-1 py-0.5 text-[9px] text-muted-foreground">
                {LANG_BADGE[f.language]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-1.5">
        <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {current?.name}
        </div>
        <div className="flex items-center gap-2">
          {runState.phase === "running" ? (
            <button
              onClick={cancelRun}
              aria-label="Cancel running code"
              className="inline-flex items-center gap-1.5 border border-border bg-background px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-destructive transition-colors hover:border-destructive"
            >
              <Square className="h-3 w-3" /> Cancel
            </button>
          ) : (
            <button
              onClick={runActiveFile}
              disabled={!current}
              aria-label="Run active file"
              className="inline-flex items-center gap-1.5 border border-border bg-background px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-foreground transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play className="h-3 w-3" /> Run
            </button>
          )}
          <button
            onClick={copySelection}
            disabled={!selection}
            aria-label="Copy selected text"
            className="inline-flex items-center gap-1.5 border border-border bg-background px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-foreground transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Copy className="h-3 w-3" /> Copy_Selection
          </button>
          <button
            onClick={copyFile}
            aria-label="Copy entire file"
            className="inline-flex items-center gap-1.5 border border-border bg-background px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-foreground transition-colors hover:border-primary"
          >
            <Copy className="h-3 w-3" /> Copy_File
          </button>
        </div>
      </div>

      <div
        ref={panelRef}
        role="tabpanel"
        id={`canvas-panel-${active}`}
        aria-labelledby={`canvas-tab-${active}`}
        className="min-h-0 flex-1 overflow-auto bg-card"
      >
        <pre className="min-w-full font-mono text-[11px] leading-relaxed">
          <code className="block">
            {highlighted.map((tokens, i) => {
              const errorMessage = errorLines.get(i + 1);
              return (
                <span
                  key={i}
                  className={`flex ${errorMessage ? "bg-code-error-bg" : ""}`}
                  title={errorMessage}
                >
                  <span
                    aria-hidden="true"
                    className={`sticky left-0 w-10 shrink-0 select-none border-r border-border px-2 text-right ${
                      errorMessage
                        ? "bg-code-error-bg font-semibold text-destructive"
                        : "bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="whitespace-pre px-3">
                    {tokens.length === 0
                      ? " "
                      : tokens.map((t, j) => (
                          <span key={j} className={TOKEN_CLASS[t.kind]}>
                            {t.value}
                          </span>
                        ))}
                  </span>
                </span>
              );
            })}


          </code>
        </pre>
      </div>

      {/* Phase D5 — console results pane */}
      <div className="flex h-36 shrink-0 flex-col border-t border-border bg-muted/30">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Terminal className="h-3 w-3" />
            Console · {current ? current.language : ""}
          </span>
          <span>
            {runState.phase === "idle" && "Idle · 10s limit"}
            {runState.phase === "running" && "Running…"}
            {runState.phase === "done" &&
              (() => {
                const r = runState.result;
                const status = r.cancelled
                  ? "Cancelled"
                  : r.timedOut
                    ? "Timed_Out"
                    : r.ok
                      ? "OK"
                      : "Error";
                return `${status} · ${r.durationMs}ms`;
              })()}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
          {runState.phase === "idle" && consoleLines.length === 0 && syntaxIssues.length === 0 && (
            <p className="select-none text-[10px] uppercase tracking-widest text-muted-foreground">
              No output yet — press Run to execute the active file.
            </p>
          )}
          {/* Phase D6 — pre-run syntax warnings */}
          {syntaxIssues.length > 0 && (
            <div className="mb-1 border border-destructive/40 p-2">
              <p className="mb-1 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-destructive">
                <AlertTriangle className="h-3 w-3" /> Syntax_Check · Run_Blocked
              </p>
              {syntaxIssues.map((issue, i) => (
                <pre key={i} className="whitespace-pre-wrap text-destructive">
                  {`line ${issue.line} · ${issue.message}`}
                </pre>
              ))}
            </div>
          )}

          {consoleLines.map((line, i) => (
            <pre
              key={i}
              className={`whitespace-pre-wrap ${
                line.stream === "stderr" ? "text-destructive" : "text-foreground"
              }`}
            >
              {line.text.replace(/\n$/, "")}
            </pre>
          ))}
          {runState.phase === "done" && (
            <div className="mt-1 space-y-0.5">
              {runState.result.value !== null && (
                <pre className="whitespace-pre-wrap text-primary">
                  {"⇒ "}
                  {runState.result.value}
                </pre>
              )}
              {runState.result.error && (
                <pre className="whitespace-pre-wrap text-destructive">
                  {runState.result.error}
                </pre>
              )}
            </div>
          )}
          <div ref={consoleEndRef} />
        </div>
      </div>
    </div>
  );
}

/** Placeholder sample set so the shell renders immediately; replaced in Phase E. */
export const SAMPLE_CANVAS_FILES: CanvasFile[] = [
  {
    name: "agent_loop.py",
    language: "python",
    content: `"""Minimal tool-calling agent loop."""

def run_agent(prompt, tools, max_steps=5):
    messages = [{"role": "user", "content": prompt}]
    for step in range(max_steps):
        reply = model.respond(messages, tools=tools)
        if not reply.tool_calls:
            return reply.content
        for call in reply.tool_calls:
            result = tools[call.name](**call.args)
            messages.append({"role": "tool", "content": result})
    raise RuntimeError("step budget exhausted")
`,
  },
  {
    name: "context.js",
    language: "javascript",
    content: `// Trim a message history to fit a token budget.

export function trimContext(messages, budget) {
  const kept = [];
  let used = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const cost = estimateTokens(messages[i]);
    if (used + cost > budget) break;
    used += cost;
    kept.unshift(messages[i]);
  }

  return { messages: kept, tokens: used };
}

function estimateTokens(message) {
  return Math.ceil(message.content.length / 4);
}
`,
  },
];
