/**
 * Phase D3 (part 1) — Study Canvas multi-file reader shell.
 *
 * Layout only: a tab strip plus a read-only, line-numbered pane. No syntax
 * highlighting, copy utilities or execution yet (later D3/D4–D7 steps).
 */

import { useMemo, useRef, useState } from "react";

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

  const current = files[Math.min(active, Math.max(0, files.length - 1))];
  const lines = useMemo(
    () => (current ? current.content.replace(/\n$/, "").split("\n") : []),
    [current],
  );

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

      <div
        role="tabpanel"
        id={`canvas-panel-${active}`}
        aria-labelledby={`canvas-tab-${active}`}
        className="min-h-0 flex-1 overflow-auto bg-card"
      >
        <pre className="min-w-full font-mono text-[11px] leading-relaxed">
          <code className="block">
            {lines.map((line, i) => (
              <span key={i} className="flex">
                <span
                  aria-hidden="true"
                  className="sticky left-0 w-10 shrink-0 select-none border-r border-border bg-muted/30 px-2 text-right text-muted-foreground"
                >
                  {i + 1}
                </span>
                <span className="whitespace-pre px-3">{line || " "}</span>
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
