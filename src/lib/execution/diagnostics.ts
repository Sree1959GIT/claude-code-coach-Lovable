/**
 * Phase D6 — diagnostics for the Study Canvas.
 *
 * Two jobs:
 *  1. Pre-run syntax validation: a lightweight unmatched bracket / quote scan
 *     that blocks execution before a provider is ever spun up.
 *  2. Runtime error parsing: pull line numbers out of Python tracebacks and
 *     JavaScript stack traces so the reader pane can flag the failing lines.
 */

import type { CanvasLanguage } from "@/components/StudyCanvasTabs";

export type SyntaxIssue = { line: number; message: string };

const OPEN: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSE: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

/**
 * Scan for unmatched brackets and unterminated quotes. Comments and string
 * bodies are skipped so punctuation inside them never trips the check.
 */
export function checkSyntax(code: string, language: CanvasLanguage): SyntaxIssue[] {
  const issues: SyntaxIssue[] = [];
  const stack: { ch: string; line: number }[] = [];
  const lines = code.split("\n");

  let blockComment = false; // JS /* */
  let pyDoc: string | null = null; // """ or '''

  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln]!;
    let i = 0;
    while (i < line.length) {
      const rest = line.slice(i);
      const ch = line[i]!;

      if (blockComment) {
        const end = rest.indexOf("*/");
        if (end === -1) break;
        blockComment = false;
        i += end + 2;
        continue;
      }
      if (pyDoc) {
        const end = rest.indexOf(pyDoc);
        if (end === -1) break;
        i += end + 3;
        pyDoc = null;
        continue;
      }

      if (language === "python" && ch === "#") break;
      if (language === "javascript" && rest.startsWith("//")) break;
      if (language === "javascript" && rest.startsWith("/*")) {
        blockComment = true;
        i += 2;
        continue;
      }
      if (language === "python" && (rest.startsWith('"""') || rest.startsWith("'''"))) {
        pyDoc = rest.slice(0, 3);
        i += 3;
        continue;
      }

      if (ch === '"' || ch === "'" || (language === "javascript" && ch === "`")) {
        let j = i + 1;
        let closed = false;
        while (j < line.length) {
          if (line[j] === "\\") {
            j += 2;
            continue;
          }
          if (line[j] === ch) {
            closed = true;
            j++;
            break;
          }
          j++;
        }
        if (!closed && ch !== "`") {
          issues.push({ line: ln + 1, message: `Unterminated string starting with ${ch}` });
        }
        i = closed ? j : line.length;
        continue;
      }

      if (OPEN[ch]) {
        stack.push({ ch, line: ln + 1 });
      } else if (CLOSE[ch]) {
        const top = stack.pop();
        if (!top) {
          issues.push({ line: ln + 1, message: `Unmatched closing '${ch}'` });
        } else if (top.ch !== CLOSE[ch]) {
          issues.push({
            line: ln + 1,
            message: `Mismatched '${ch}' — expected '${OPEN[top.ch]}' opened on line ${top.line}`,
          });
        }
      }
      i++;
    }
  }

  if (blockComment) issues.push({ line: lines.length, message: "Unterminated block comment" });
  if (pyDoc) issues.push({ line: lines.length, message: "Unterminated triple-quoted string" });
  for (const open of stack) {
    issues.push({ line: open.line, message: `Unclosed '${open.ch}'` });
  }

  return issues.sort((a, b) => a.line - b.line);
}

export type Diagnostic = {
  /** 1-based lines in the user's file that the error points at. */
  lines: number[];
  /** Cleaned, line-numbered stack frames for the console pane. */
  frames: string[];
  message: string;
};

/**
 * Parse a runtime error string into failing line numbers plus readable frames.
 * Python tracebacks report `File "<exec>", line N`; V8 stacks report
 * `at ... (blob:...:LINE:COL)` or `<anonymous>:LINE:COL`.
 */
export function parseDiagnostic(
  error: string,
  language: CanvasLanguage,
  totalLines: number,
): Diagnostic {
  const lines: number[] = [];
  const frames: string[] = [];
  const raw = error.split("\n");

  const add = (n: number) => {
    if (Number.isFinite(n) && n >= 1 && n <= totalLines && !lines.includes(n)) lines.push(n);
  };

  if (language === "python") {
    for (const l of raw) {
      const m = /File "([^"]*)", line (\d+)/.exec(l);
      if (m) {
        const file = m[1]!;
        const n = Number(m[2]);
        // Frames inside Pyodide's own bootstrap are noise.
        if (/exec|string|stdin|<unknown>/.test(file)) {
          add(n);
          frames.push(`line ${n} · ${file}`);
        }
        continue;
      }
      if (l.trim()) frames.push(l.trim());
    }
  } else {
    for (const l of raw) {
      const m = /:(\d+):(\d+)\)?$/.exec(l.trim());
      if (m && /\bat\b/.test(l)) {
        // Blob-worker eval offsets are 1:1 with the snippet for top-level code.
        const n = Number(m[1]);
        add(n);
        frames.push(`line ${n}:${m[2]} · ${l.trim().replace(/^at\s+/, "")}`);
        continue;
      }
      if (l.trim()) frames.push(l.trim());
    }
  }

  // Python puts the exception on the last line; V8 puts it first.
  const nonEmpty = raw.map((l) => l.trim()).filter(Boolean);
  const message =
    (language === "python" ? nonEmpty[nonEmpty.length - 1] : nonEmpty[0]) ?? error;
  return { lines, frames, message };
}
