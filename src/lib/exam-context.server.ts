/**
 * G3 — de-hardcoded exam wording (server side).
 *
 * Prompts used to name one certification in their system text. They now ask
 * this module for the active exam's label, so the same agents work for any
 * exam in the `exams` table. The lookup is cached in module memory because it
 * changes about once a quarter and every agent call would otherwise pay for it.
 */

const FALLBACK_LABEL = "the target certification exam";
const TTL_MS = 5 * 60 * 1000;

let cached: { label: string; at: number } | null = null;

async function loadLabel(): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("exams")
      .select("name, short_name")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!data?.name) return FALLBACK_LABEL;
    const short = (data as { short_name?: string | null }).short_name;
    return short ? `${data.name} (${short})` : data.name;
  } catch {
    return FALLBACK_LABEL;
  }
}

/** Human label for the exam the tutor is preparing learners for. */
export async function examLabel(): Promise<string> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.label;
  const label = await loadLabel();
  cached = { label, at: now };
  return label;
}

/** Replace the {{EXAM}} placeholder in a prompt template. */
export function withExam(template: string, label: string): string {
  return template.replaceAll("{{EXAM}}", label);
}
