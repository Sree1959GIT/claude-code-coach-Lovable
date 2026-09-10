/**
 * Phase G5 — Coverage parity report.
 *
 * Compares the live question bank against the certification exam blueprint
 * weights, so gaps (under/over-served domains) are visible at a glance.
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

export type ParityRow = {
  domainId: string;
  slug: string;
  title: string;
  /** Blueprint share of the exam, 0-100. */
  blueprintPct: number;
  /** Share of the current bank held by this domain, 0-100. */
  actualPct: number;
  /** Signed parity points: actualPct - blueprintPct. */
  deltaPct: number;
  questions: number;
  published: number;
  /** Questions the blueprint expects at the target bank size. */
  target: number;
  /** target - published (positive = shortfall). */
  gap: number;
  easy: number;
  medium: number;
  hard: number;
  cited: number;
  citedPct: number;
  state: "short" | "parity" | "over";
};

export type ParityReport = {
  targetBankSize: number;
  totalQuestions: number;
  totalPublished: number;
  totalGap: number;
  /** Mean absolute parity deviation across domains, in points. */
  meanDeviation: number;
  rows: ParityRow[];
};

export const getCoverageParity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const parsed = (input ?? {}) as { targetBankSize?: number };
    const n = Number(parsed.targetBankSize ?? 0);
    return { targetBankSize: Number.isFinite(n) && n > 0 ? Math.min(Math.max(Math.round(n), 65), 5000) : 0 };
  })
  .handler(async ({ data, context }): Promise<ParityReport> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const [{ data: domains, error: dErr }, { data: questions, error: qErr }, { data: cites, error: cErr }] =
      await Promise.all([
        admin.from("domains").select("id, slug, title, weight, sort_order").order("sort_order"),
        admin.from("questions").select("id, domain_id, difficulty, status"),
        admin.from("question_citations").select("question_id"),
      ]);
    if (dErr) throw dErr;
    if (qErr) throw qErr;
    if (cErr) throw cErr;

    const citedIds = new Set<string>((cites ?? []).map((c: any) => c.question_id as string));
    const qRows = (questions ?? []) as {
      id: string;
      domain_id: string;
      difficulty: string | null;
      status: string | null;
    }[];

    const totalQuestions = qRows.length;
    const totalPublished = qRows.filter((q) => (q.status ?? "published") === "published").length;
    const targetBankSize = data.targetBankSize || Math.max(totalPublished, 65);

    const dRows = (domains ?? []) as { id: string; slug: string; title: string; weight: number }[];
    const weightTotal = dRows.reduce((s, d) => s + (Number(d.weight) || 0), 0) || dRows.length || 1;

    const rows: ParityRow[] = dRows.map((d) => {
      const mine = qRows.filter((q) => q.domain_id === d.id);
      const published = mine.filter((q) => (q.status ?? "published") === "published");
      const blueprintPct = ((Number(d.weight) || 0) / weightTotal) * 100;
      const actualPct = totalPublished ? (published.length / totalPublished) * 100 : 0;
      const target = Math.round((blueprintPct / 100) * targetBankSize);
      const deltaPct = Math.round((actualPct - blueprintPct) * 10) / 10;
      const cited = published.filter((q) => citedIds.has(q.id)).length;
      const count = (band: string) => mine.filter((q) => (q.difficulty ?? "") === band).length;

      return {
        domainId: d.id,
        slug: d.slug,
        title: d.title,
        blueprintPct: Math.round(blueprintPct * 10) / 10,
        actualPct: Math.round(actualPct * 10) / 10,
        deltaPct,
        questions: mine.length,
        published: published.length,
        target,
        gap: target - published.length,
        easy: count("easy"),
        medium: count("medium"),
        hard: count("hard"),
        cited,
        citedPct: published.length ? Math.round((cited / published.length) * 1000) / 10 : 0,
        state: deltaPct <= -3 ? "short" : deltaPct >= 3 ? "over" : "parity",
      };
    });

    const meanDeviation = rows.length
      ? Math.round((rows.reduce((s, r) => s + Math.abs(r.deltaPct), 0) / rows.length) * 10) / 10
      : 0;

    return {
      targetBankSize,
      totalQuestions,
      totalPublished,
      totalGap: rows.reduce((s, r) => s + Math.max(0, r.gap), 0),
      meanDeviation,
      rows,
    };
  });
