/**
 * Phase D3 — Study Canvas multi-file reader: tabs, read-only syntax-highlighted
 * pane (Python + JavaScript), copy file / copy selection with toast feedback.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { TOKEN_CLASS, tokenizeLine, type LineState, type Token } from "@/lib/syntax-highlight";

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

export function StudyCanvasTabs({ files }: { files: CanvasFile[] }) {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState("");

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
            {highlighted.map((tokens, i) => (
              <span key={i} className="flex">
                <span
                  aria-hidden="true"
                  className="sticky left-0 w-10 shrink-0 select-none border-r border-border bg-muted/30 px-2 text-right text-muted-foreground"
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
            ))}

          </code>
        </pre>
      </div>

      <div className="shrink-0 border-t border-border bg-muted/30 px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        Run_Controls · Pending_D4
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
