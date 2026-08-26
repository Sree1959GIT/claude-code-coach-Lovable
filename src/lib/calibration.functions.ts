/**
 * Stage 8 sub-task 8.8 — difficulty calibration.
 *
 * Admin-only server functions that recompute each question's difficulty from
 * live attempt accuracy and (optionally) store the calibrated value back onto
 * the question row.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw error;
  if (!isAdmin) throw new Error("Forbidden");
}

export type CalibrationRow = {
  questionId: string;
  stem: string;
  authored: string;
  calibrated: string | null;
  suggested: string;
  accuracy: number | null;
  samples: number;
  changed: boolean;
  enoughData: boolean;
};

export type CalibrationResult = {
  rows: CalibrationRow[];
  scanned: number;
  withData: number;
  changes: number;
  applied: number;
};

/** Accuracy → difficulty band. Lower accuracy means a harder question. */
function bandFor(accuracy: number): string {
  if (accuracy >= 0.8) return "easy";
  if (accuracy >= 0.55) return "medium";
  return "hard";
}

export const calibrateDifficulty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const parsed = (input ?? {}) as { minSamples?: number; apply?: boolean };
    return {
      minSamples: Math.min(Math.max(Number(parsed.minSamples ?? 5), 1), 100),
      apply: Boolean(parsed.apply),
    };
  })
  .handler(async ({ data, context }): Promise<CalibrationResult> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const [{ data: questions, error: qErr }, { data: attempts, error: aErr }] = await Promise.all([
      admin
        .from("questions")
        .select("id, stem, difficulty, calibrated_difficulty, sort_order")
        .order("sort_order"),
      admin.from("question_attempts").select("question_id, user_id, is_correct, created_at"),
    ]);
    if (qErr) throw qErr;
    if (aErr) throw aErr;

    // First attempt per (user, question) is the honest signal for difficulty.
    const first = new Map<string, { correct: boolean; at: number }>();
    for (const a of (attempts ?? []) as any[]) {
      const key = `${a.question_id}:${a.user_id}`;
      const at = new Date(a.created_at).getTime();
      const prev = first.get(key);
      if (!prev || at < prev.at) first.set(key, { correct: Boolean(a.is_correct), at });
    }

    const stats = new Map<string, { total: number; correct: number }>();
    for (const [key, v] of first) {
      const qid = key.split(":")[0]!;
      const b = stats.get(qid) ?? { total: 0, correct: 0 };
      b.total += 1;
      if (v.correct) b.correct += 1;
      stats.set(qid, b);
    }

    const rows: CalibrationRow[] = [];
    const updates: {
      id: string;
      calibrated_difficulty: string;
      calibration_accuracy: number;
      calibration_samples: number;
      calibrated_at: string;
    }[] = [];

    for (const q of (questions ?? []) as any[]) {
      const b = stats.get(q.id);
      const samples = b?.total ?? 0;
      const accuracy = samples ? (b!.correct / samples) : null;
      const enoughData = samples >= data.minSamples && accuracy !== null;
      const suggested = enoughData ? bandFor(accuracy!) : (q.calibrated_difficulty ?? q.difficulty);
      const changed = enoughData && suggested !== (q.calibrated_difficulty ?? q.difficulty);

      rows.push({
        questionId: q.id,
        stem: q.stem,
        authored: q.difficulty,
        calibrated: q.calibrated_difficulty ?? null,
        suggested,
        accuracy: accuracy === null ? null : Math.round(accuracy * 1000) / 1000,
        samples,
        changed,
        enoughData,
      });

      if (enoughData) {
        updates.push({
          id: q.id,
          calibrated_difficulty: suggested,
          calibration_accuracy: Math.round(accuracy! * 1000) / 1000,
          calibration_samples: samples,
          calibrated_at: new Date().toISOString(),
        });
      }
    }

    let applied = 0;
    if (data.apply) {
      for (const u of updates) {
        const { id, ...patch } = u;
        const { error } = await admin.from("questions").update(patch).eq("id", id);
        if (error) throw error;
        applied += 1;
      }
    }

    return {
      rows: rows.sort((a, b) => (a.accuracy ?? 2) - (b.accuracy ?? 2)),
      scanned: rows.length,
      withData: rows.filter((r) => r.enoughData).length,
      changes: rows.filter((r) => r.changed).length,
      applied,
    };
  });
