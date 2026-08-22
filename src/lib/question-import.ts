/**
 * Stage 8 sub-task 1 — bulk question import parsing + validation.
 *
 * Pure and dependency-free so both the admin UI (dry-run preview) and the
 * server function (actual insert) parse identically.
 *
 * CSV columns (header row required, case-insensitive):
 *   domain, stem, correct, option_a..option_f
 *   optional: scenario, key_concept, difficulty, exp_a..exp_f
 *
 * JSON: array of
 *   { domain, stem, correct?, scenario?, keyConcept?, difficulty?,
 *     options: [{ label?, text, isCorrect?, explanation? }] }
 */

export const IMPORT_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const IMPORT_OPTION_LABELS = ["A", "B", "C", "D", "E", "F"] as const;

export type ImportOption = {
  label: string;
  text: string;
  isCorrect: boolean;
  explanation: string | null;
};

export type ImportRow = {
  /** 1-based row number in the source payload. */
  row: number;
  domainSlug: string;
  scenario: string | null;
  stem: string;
  keyConcept: string | null;
  difficulty: string;
  options: ImportOption[];
};

export type ImportIssue = { row: number; message: string };

export type ParsedImport = {
  rows: ImportRow[];
  issues: ImportIssue[];
};

export const IMPORT_CSV_TEMPLATE = [
  "domain,stem,scenario,key_concept,difficulty,option_a,option_b,option_c,option_d,correct,exp_a,exp_b,exp_c,exp_d",
  'prompting-fundamentals,"Which prompt structure is most reliable?","A team drafts a system prompt.",prompt-structure,medium,"Role then task then constraints","Task only","Constraints only","Examples only",A,"Ordering gives the model stable context.","Too little context.","No task.","Examples alone underspecify."',
].join("\n");

/** RFC4180-ish CSV splitter: handles quoted fields, escaped quotes and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const nullable = (v: unknown): string | null => clean(v) || null;

function normalizeDifficulty(value: string, row: number, issues: ImportIssue[]): string {
  const d = clean(value).toLowerCase();
  if (!d) return "medium";
  if ((IMPORT_DIFFICULTIES as readonly string[]).includes(d)) return d;
  issues.push({ row, message: `Unknown difficulty "${value}", defaulting to medium.` });
  return "medium";
}

function buildRow(
  raw: {
    domain: string;
    stem: string;
    scenario?: string;
    keyConcept?: string;
    difficulty?: string;
    options: { label?: string; text: string; isCorrect?: boolean; explanation?: string | null }[];
    correct?: string;
  },
  rowNumber: number,
  issues: ImportIssue[],
): ImportRow | null {
  const before = issues.length;
  const domainSlug = clean(raw.domain).toLowerCase();
  const stem = clean(raw.stem);
  if (!domainSlug) issues.push({ row: rowNumber, message: "Missing domain slug." });
  if (!stem) issues.push({ row: rowNumber, message: "Missing question stem." });

  const correctLabel = clean(raw.correct).toUpperCase();
  const options: ImportOption[] = raw.options
    .map((o, i) => ({
      label: (clean(o.label) || IMPORT_OPTION_LABELS[i] || String(i + 1)).toUpperCase(),
      text: clean(o.text),
      isCorrect: o.isCorrect === true,
      explanation: nullable(o.explanation),
    }))
    .filter((o) => o.text);

  if (correctLabel) {
    for (const o of options) o.isCorrect = o.label === correctLabel;
  }

  if (options.length < 2) issues.push({ row: rowNumber, message: "At least two answer options are required." });
  const correctCount = options.filter((o) => o.isCorrect).length;
  if (options.length >= 2 && correctCount !== 1) {
    issues.push({
      row: rowNumber,
      message:
        correctCount === 0
          ? "No correct option marked (set the `correct` column to an option label)."
          : `${correctCount} options marked correct — exactly one is required.`,
    });
  }

  const difficulty = normalizeDifficulty(clean(raw.difficulty), rowNumber, issues);

  // Only difficulty produces a non-fatal warning; anything else invalidates the row.
  const fatal = issues.slice(before).some((i) => !i.message.startsWith("Unknown difficulty"));
  if (fatal) return null;

  return {
    row: rowNumber,
    domainSlug,
    scenario: nullable(raw.scenario),
    stem,
    keyConcept: nullable(raw.keyConcept),
    difficulty,
    options,
  };
}

export function parseQuestionImport(text: string, format: "csv" | "json"): ParsedImport {
  const issues: ImportIssue[] = [];
  const rows: ImportRow[] = [];
  const payload = text.trim();
  if (!payload) return { rows, issues: [{ row: 0, message: "Nothing to import." }] };

  if (format === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch (e) {
      return { rows, issues: [{ row: 0, message: `Invalid JSON: ${(e as Error).message}` }] };
    }
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { questions?: unknown }).questions)
        ? ((parsed as { questions: unknown[] }).questions)
        : null;
    if (!list) return { rows, issues: [{ row: 0, message: "Expected a JSON array of questions." }] };

    list.forEach((item, i) => {
      const q = (item ?? {}) as Record<string, unknown>;
      const built = buildRow(
        {
          domain: clean(q['domain'] ?? q['domain_slug']),
          stem: clean(q['stem']),
          scenario: clean(q['scenario']),
          keyConcept: clean(q['keyConcept'] ?? q['key_concept']),
          difficulty: clean(q['difficulty']),
          correct: clean(q['correct']),
          options: (Array.isArray(q['options']) ? (q['options'] as unknown[]) : []).map((o) => {
            const opt = (o ?? {}) as Record<string, unknown>;
            return {
              label: clean(opt['label']),
              text: clean(opt['text']),
              isCorrect: opt['isCorrect'] === true || opt['is_correct'] === true,
              explanation: clean(opt['explanation']),
            };
          }),
        },
        i + 1,
        issues,
      );
      if (built) rows.push(built);
    });
    return { rows, issues };
  }

  const grid = parseCsv(payload);
  if (grid.length < 2) return { rows, issues: [{ row: 0, message: "CSV needs a header row plus at least one row." }] };

  const header = grid[0].map((h) => clean(h).toLowerCase().replace(/\s+/g, "_"));
  const idx = (name: string) => header.indexOf(name);
  if (idx("domain") === -1 || idx("stem") === -1) {
    return { rows, issues: [{ row: 0, message: "CSV header must include `domain` and `stem`." }] };
  }

  const at = (cells: string[], name: string) => {
    const i = idx(name);
    return i === -1 ? "" : clean(cells[i]);
  };

  grid.slice(1).forEach((cells, i) => {
    const options = IMPORT_OPTION_LABELS.map((label) => ({
      label,
      text: at(cells, `option_${label.toLowerCase()}`),
      explanation: at(cells, `exp_${label.toLowerCase()}`),
    })).filter((o) => o.text);

    const built = buildRow(
      {
        domain: at(cells, "domain"),
        stem: at(cells, "stem"),
        scenario: at(cells, "scenario"),
        keyConcept: at(cells, "key_concept"),
        difficulty: at(cells, "difficulty"),
        correct: at(cells, "correct"),
        options,
      },
      i + 1,
      issues,
    );
    if (built) rows.push(built);
  });

  return { rows, issues };
}
