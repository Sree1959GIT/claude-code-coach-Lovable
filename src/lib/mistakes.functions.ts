import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchDomains } from "./study";

export type MissedItem = {
  questionId: string;
  domainId: string;
  domainTitle: string;
  domainSlug: string;
  stem: string;
  difficulty: string;
  misses: number;
  attempts: number;
  lastMissedAt: string;
  lastAttemptCorrect: boolean;
  selectedLabel: string | null;
  correctLabel: string | null;
  explanation: string | null;
};

export type MistakeBank = {
  items: MissedItem[];
  totalMisses: number;
  openCount: number;
  recoveredCount: number;
};

export const getMistakeBank = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MistakeBank> => {
    const { supabase, userId } = context;

    const { data: attempts, error } = await supabase
      .from("question_attempts")
      .select("question_id, selected_option_id, is_correct, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const rows = attempts ?? [];
    const missedIds = Array.from(
      new Set(rows.filter((a) => !a.is_correct).map((a) => a.question_id)),
    );
    if (missedIds.length === 0) {
      return { items: [], totalMisses: 0, openCount: 0, recoveredCount: 0 };
    }

    const [questionsRes, domains] = await Promise.all([
      supabase
        .from("questions")
        .select(
          "id, domain_id, stem, difficulty, options:question_options(id, label, is_correct, explanation)",
        )
        .in("id", missedIds),
      fetchDomains(),
    ]);
    if (questionsRes.error) throw questionsRes.error;

    const domainById = new Map(domains.map((d) => [d.id, d]));
    const questionById = new Map(
      (questionsRes.data ?? []).map((q: any) => [q.id, q]),
    );

    const items: MissedItem[] = [];
    let totalMisses = 0;

    for (const id of missedIds) {
      const q = questionById.get(id);
      if (!q) continue;
      const qAttempts = rows.filter((a) => a.question_id === id);
      const misses = qAttempts.filter((a) => !a.is_correct);
      const lastMiss = misses[misses.length - 1]!;
      const last = qAttempts[qAttempts.length - 1]!;
      const opts = (q.options ?? []) as any[];
      const correctOpt = opts.find((o) => o.is_correct);
      const selected = opts.find((o) => o.id === lastMiss.selected_option_id);
      const domain = domainById.get(q.domain_id);
      totalMisses += misses.length;
      items.push({
        questionId: id,
        domainId: q.domain_id,
        domainTitle: domain?.title ?? "—",
        domainSlug: domain?.slug ?? "",
        stem: q.stem,
        difficulty: q.difficulty,
        misses: misses.length,
        attempts: qAttempts.length,
        lastMissedAt: lastMiss.created_at,
        lastAttemptCorrect: !!last.is_correct,
        selectedLabel: selected?.label ?? null,
        correctLabel: correctOpt?.label ?? null,
        explanation: correctOpt?.explanation ?? null,
      });
    }

    items.sort(
      (a, b) =>
        Number(a.lastAttemptCorrect) - Number(b.lastAttemptCorrect) ||
        b.misses - a.misses ||
        (a.lastMissedAt < b.lastMissedAt ? 1 : -1),
    );

    return {
      items,
      totalMisses,
      openCount: items.filter((i) => !i.lastAttemptCorrect).length,
      recoveredCount: items.filter((i) => i.lastAttemptCorrect).length,
    };
  });

/**
 * Stage 7 sub-task 10 — mistake re-test.
 * Builds a session from the user's open mistake-bank items only.
 */
export const startMistakeRetest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        targetCount: z.number().int().min(1).max(60).default(10),
        domainSlug: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: attempts, error } = await supabase
      .from("question_attempts")
      .select("question_id, is_correct, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const rows = attempts ?? [];
    const lastByQuestion = new Map<string, boolean>();
    const missCount = new Map<string, number>();
    for (const a of rows) {
      lastByQuestion.set(a.question_id, !!a.is_correct);
      if (!a.is_correct)
        missCount.set(a.question_id, (missCount.get(a.question_id) ?? 0) + 1);
    }

    let openIds = Array.from(missCount.keys()).filter(
      (id) => lastByQuestion.get(id) === false,
    );

    if (data.domainSlug) {
      const domains = await fetchDomains();
      const domain = domains.find((d) => d.slug === data.domainSlug);
      if (domain) {
        const { data: scoped, error: sErr } = await supabase
          .from("questions")
          .select("id")
          .eq("domain_id", domain.id)
          .in("id", openIds);
        if (sErr) throw sErr;
        const allowed = new Set((scoped ?? []).map((q) => q.id));
        openIds = openIds.filter((id) => allowed.has(id));
      }
    }

    openIds.sort((a, b) => (missCount.get(b) ?? 0) - (missCount.get(a) ?? 0));
    const selected = openIds.slice(0, data.targetCount);

    if (selected.length === 0) {
      return { sessionId: null as string | null, count: 0 };
    }

    const { data: session, error: insErr } = await supabase
      .from("practice_sessions")
      .insert({
        user_id: userId,
        mode: "retest",
        domain_id: null,
        target_count: selected.length,
        time_limit_ms: null,
        metadata: { question_ids: selected },
      })
      .select()
      .single();
    if (insErr) throw insErr;

    return { sessionId: session.id as string, count: selected.length };
  });
