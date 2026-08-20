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
