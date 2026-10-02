/**
 * P3.2 — per-exam isolation helper. Returns the question ids belonging to an
 * exam (via domains.exam_id), or null when no exam is given (no filtering).
 */
type Db = { from: (t: string) => any };

export async function examQuestionIds(db: Db, examId: string | null | undefined): Promise<Set<string> | null> {
  if (!examId) return null;
  const { data: domains, error } = await db.from("domains").select("id").eq("exam_id", examId);
  if (error) throw error;
  const ids = (domains ?? []).map((d: { id: string }) => d.id);
  if (ids.length === 0) return new Set();
  const { data: qs, error: qErr } = await db.from("questions").select("id").in("domain_id", ids);
  if (qErr) throw qErr;
  return new Set((qs ?? []).map((q: { id: string }) => q.id));
}

export function examIdInput(d: unknown): { examId: string | null } {
  const v = (d as { examId?: unknown } | undefined)?.examId;
  return { examId: typeof v === "string" && v ? v : null };
}
