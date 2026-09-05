# Phase D6 — Diagnostic Error Display & Pre-Run Syntax Hooks

_Status: completed 2026-09-05_

## What was built

### 1. Diagnostics module — `src/lib/execution/diagnostics.ts` (new)
- `checkSyntax(code, language): SyntaxIssue[]` — dependency-free scanner for
  unmatched brackets, mismatched pairs, unterminated quotes, unterminated
  block/triple-quoted strings. Comments and string bodies are skipped so
  punctuation inside them never trips the check. Issues carry a 1-based line.
- `parseDiagnostic(error, language, totalLines): Diagnostic` — extracts failing
  line numbers and readable frames:
  - Python: `File "<exec>", line N` frames from the Pyodide traceback
    (bootstrap frames filtered out); message taken from the last traceback line.
  - JavaScript: `at ... (blob:...:LINE:COL)` V8 frames; message taken from the
    first line. Line numbers are clamped to the file length.

### 2. UI wiring — `src/components/StudyCanvasTabs.tsx`
- Pre-run gate: `runActiveFile()` runs `checkSyntax` first. On issues, execution
  is blocked, a Sonner **warning** toast fires, and the console pane shows a
  `Syntax_Check · Run_Blocked` block listing `line N · message`.
- Runtime diagnostics: after a failed run (not cancelled / not timed out) the
  error or stderr is parsed and stored in `diagnostic` state.
- Reader pane: failing lines get a `bg-code-error-bg` row background, a bold
  destructive gutter number, and a `title` tooltip with the message.
- Console pane: a `Stack_Trace` section lists the affected line numbers and each
  parsed frame beneath the raw error text.
- Diagnostics reset on file/tab switch and on every new run.

### 3. Design tokens — `src/styles.css`
- `--code-error-bg` added for light (`oklch(0.94 0.05 25)`) and dark
  (`oklch(0.32 0.08 25)`), exposed as `--color-code-error-bg` so
  `bg-code-error-bg` works in both themes.

## Verification
- `bunx tsgo --noEmit` — clean.
- Parser/scanner exercised directly: Python traceback → line 3 +
  `ZeroDivisionError`; V8 stack → lines 4 and 7; unbalanced Python snippet →
  two `Unclosed '('` issues; JS snippet with `(` inside a comment → no issues.

## Phase D7 handoff requirements (next task)

**Setup `code_executions` schema: database telemetry log table mapping
timestamp, language, success/failure metrics, and output sizes (owner-scoped
with RLS).**

Expected shape:
- `public.code_executions` — `id uuid pk`, `user_id uuid not null references
  auth.users(id) on delete cascade`, `created_at timestamptz default now()`,
  `language text`, `provider_id text`, `ok boolean`, `timed_out boolean`,
  `cancelled boolean`, `duration_ms int`, `stdout_bytes int`, `stderr_bytes int`,
  `error_message text`, `file_name text`.
- Migration order is non-negotiable: `CREATE TABLE` → `GRANT SELECT, INSERT ON
  public.code_executions TO authenticated;` + `GRANT ALL ... TO service_role;`
  → `ENABLE ROW LEVEL SECURITY` → owner-scoped policies on `auth.uid() = user_id`
  (no `anon` grant).
- Writes go through a `createServerFn` in a client-safe module (e.g.
  `src/lib/executions.functions.ts`) with `.middleware([requireSupabaseAuth])`;
  never log raw source code — only sizes and status metrics.
- Call the logger from `StudyCanvasTabs.runActiveFile()` after each run,
  fire-and-forget so a telemetry failure never breaks the canvas.
