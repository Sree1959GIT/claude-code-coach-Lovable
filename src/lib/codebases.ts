import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { normalizeAdvice, type CodeAdvice } from "./advice";

/** A single file inside a stored codebase example. */
export type CodebaseFile = {
  name: string;
  language: string;
  content: string;
};

/** Raw row as stored in the database. */
export type CodebaseRow = Database["public"]["Tables"]["codebases"]["Row"];

/** A codebase example with its `files` payload parsed into a typed array. */
export type Codebase = Omit<CodebaseRow, "files" | "advice"> & {
  files: CodebaseFile[];
  /** Phase E7 — structured advice breakdown matrices. */
  advice: CodeAdvice;
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
  return {
    ...row,
    files: parseCodebaseFiles(row.files),
    advice: normalizeAdvice(row.advice),
  };
}

/**
 * Phase E2 — turn a free-form question `key_concept` into a canonical
 * concept tag ("Agent Loop" → "agent_loop").
 */
export function toConceptTag(value: string | null | undefined): string | null {
  if (!value) return null;
  const tag = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return tag.length > 0 ? tag : null;
}

/**
 * Phase E2 — look up a pre-built example by concept tag. Returns `null`
 * when nothing is cached for that concept; no generation ever happens here.
 */
export async function fetchCodebaseByConcept(
  conceptTag: string,
): Promise<Codebase | null> {
  const { data, error } = await supabase
    .from("codebases")
    .select("*")
    .eq("concept_tag", conceptTag)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? toCodebase(data as CodebaseRow) : null;
}

/**
 * Phase E3 — background "More Codebases" queue. Fetches up to `limit`
 * additional cached examples: first any other rows sharing the concept tag,
 * then related rows from other concepts. Read-only and non-blocking; the
 * caller keeps showing the primary example while this resolves.
 */
export async function fetchMoreCodebases(
  conceptTag: string | null,
  options: { excludeIds?: string[]; limit?: number } = {},
): Promise<Codebase[]> {
  const limit = options.limit ?? 3;
  const exclude = new Set(options.excludeIds ?? []);
  const collected: Codebase[] = [];

  const push = (rows: CodebaseRow[] | null) => {
    for (const row of rows ?? []) {
      if (exclude.has(row.id) || collected.length >= limit) continue;
      exclude.add(row.id);
      collected.push(toCodebase(row));
    }
  };

  if (conceptTag) {
    const { data, error } = await supabase
      .from("codebases")
      .select("*")
      .eq("concept_tag", conceptTag)
      .order("created_at", { ascending: true })
      .limit(limit + exclude.size);
    if (error) throw error;
    push(data as CodebaseRow[] | null);
  }

  if (collected.length < limit) {
    const query = supabase
      .from("codebases")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(limit + exclude.size + 3);
    if (conceptTag) query.neq("concept_tag", conceptTag);
    const { data, error } = await query;
    if (error) throw error;
    push(data as CodebaseRow[] | null);
  }

  return collected.slice(0, limit);
}
