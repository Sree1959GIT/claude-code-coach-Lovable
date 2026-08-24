/**
 * Stage 8 sub-task 8.4 — distractor quality audit.
 *
 * Server-only. Joins question options with attempt selections and flags:
 *  - distractors never chosen (dead options) on questions with enough attempts
 *  - distractors chosen more often than the correct answer (over-attractive)
 *  - options missing an explanation
 */

export type DistractorFlag = "never_chosen" | "over_chosen" | "missing_explanation";

export type DistractorOption = {
  optionId: string;
  label: string;
  text: string;
  isCorrect: boolean;
  picks: number;
  share: number;
  flags: DistractorFlag[];
};

export type DistractorQuestion = {
  questionId: string;
  stem: string;
  domainId: string;
  domainTitle: string;
  attempts: number;
  correctShare: number;
  options: DistractorOption[];
  flags: DistractorFlag[];
};

export type DistractorAudit = {
  scannedAt: string;
  minAttempts: number;
  overChosenShare: number;
  questions: number;
  audited: number;
  totals: Record<DistractorFlag, number>;
  items: DistractorQuestion[];
};

const MAX_ITEMS = 80;

export async function auditDistractors(
  minAttempts = 5,
  overChosenShare = 0.4,
): Promise<DistractorAudit> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [questionsRes, optionsRes, domainsRes, attemptsRes] = await Promise.all([
    supabaseAdmin.from("questions").select("id, domain_id, stem"),
    supabaseAdmin
      .from("question_options")
      .select("id, question_id, label, text, is_correct, explanation, sort_order")
      .order("sort_order"),
    supabaseAdmin.from("domains").select("id, title"),
    supabaseAdmin.from("question_attempts").select("question_id, selected_option_id"),
  ]);
  for (const r of [questionsRes, optionsRes, domainsRes, attemptsRes]) {
    if (r.error) throw r.error;
  }

  const domainTitle = new Map((domainsRes.data ?? []).map((d) => [d.id, d.title]));

  const picksByOption = new Map<string, number>();
  const attemptsByQuestion = new Map<string, number>();
  for (const a of attemptsRes.data ?? []) {
    attemptsByQuestion.set(a.question_id, (attemptsByQuestion.get(a.question_id) ?? 0) + 1);
    if (a.selected_option_id) {
      picksByOption.set(a.selected_option_id, (picksByOption.get(a.selected_option_id) ?? 0) + 1);
    }
  }

  const optionsBy = new Map<string, typeof optionsRes.data>();
  for (const o of optionsRes.data ?? []) {
    const list = optionsBy.get(o.question_id) ?? [];
    list!.push(o);
    optionsBy.set(o.question_id, list!);
  }

  const totals: Record<DistractorFlag, number> = {
    never_chosen: 0,
    over_chosen: 0,
    missing_explanation: 0,
  };

  const items: DistractorQuestion[] = [];
  let audited = 0;

  for (const q of questionsRes.data ?? []) {
    const opts = optionsBy.get(q.id) ?? [];
    if (opts.length === 0) continue;
    const attempts = attemptsByQuestion.get(q.id) ?? 0;
    const enough = attempts >= minAttempts;
    if (enough) audited += 1;

    let correctPicks = 0;
    const options: DistractorOption[] = opts.map((o) => {
      const picks = picksByOption.get(o.id) ?? 0;
      if (o.is_correct) correctPicks += picks;
      const share = attempts > 0 ? picks / attempts : 0;
      const flags: DistractorFlag[] = [];
      if (!o.explanation || o.explanation.trim().length === 0) flags.push("missing_explanation");
      if (!o.is_correct && enough) {
        if (picks === 0) flags.push("never_chosen");
        else if (share >= overChosenShare) flags.push("over_chosen");
      }
      flags.forEach((f) => {
        totals[f] += 1;
      });
      return {
        optionId: o.id,
        label: o.label,
        text: o.text,
        isCorrect: o.is_correct,
        picks,
        share: Math.round(share * 1000) / 1000,
        flags,
      };
    });

    const qFlags = Array.from(new Set(options.flatMap((o) => o.flags)));
    if (qFlags.length === 0) continue;

    items.push({
      questionId: q.id,
      stem: q.stem,
      domainId: q.domain_id,
      domainTitle: domainTitle.get(q.domain_id) ?? "—",
      attempts,
      correctShare: attempts > 0 ? Math.round((correctPicks / attempts) * 1000) / 1000 : 0,
      options,
      flags: qFlags,
    });
  }

  items.sort((a, b) => b.flags.length - a.flags.length || b.attempts - a.attempts);

  return {
    scannedAt: new Date().toISOString(),
    minAttempts,
    overChosenShare,
    questions: (questionsRes.data ?? []).length,
    audited,
    totals,
    items: items.slice(0, MAX_ITEMS),
  };
}
