import type { Database } from "@/integrations/supabase/types";

/** A single file inside a stored codebase example. */
export type CodebaseFile = {
  name: string;
  language: string;
  content: string;
};

/** Raw row as stored in the database. */
export type CodebaseRow = Database["public"]["Tables"]["codebases"]["Row"];

/** A codebase example with its `files` payload parsed into a typed array. */
export type Codebase = Omit<CodebaseRow, "files"> & {
  files: CodebaseFile[];
};

export const CODEBASE_LANGUAGES = ["python", "javascript"] as const;
export type CodebaseLanguage = (typeof CODEBASE_LANGUAGES)[number];

export const CODEBASE_DIFFICULTIES = [
  "beginner",
  "intermediate",
  "advanced",
] as const;
export type CodebaseDifficulty = (typeof CODEBASE_DIFFICULTIES)[number];

function isCodebaseFile(value: unknown): value is CodebaseFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Record<string, unknown>;
  return (
    typeof file.name === "string" &&
    typeof file.language === "string" &&
    typeof file.content === "string"
  );
}

/** Safely coerce the jsonb `files` column into a typed file array. */
export function parseCodebaseFiles(value: unknown): CodebaseFile[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isCodebaseFile);
}

/** Normalise a raw database row into a typed codebase. */
export function toCodebase(row: CodebaseRow): Codebase {
  return { ...row, files: parseCodebaseFiles(row.files) };
}
