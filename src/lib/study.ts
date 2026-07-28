import { supabase } from "@/integrations/supabase/client";

export type Domain = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  weight: number;
  sort_order: number;
};

export type QuestionOption = {
  id: string;
  question_id: string;
  label: string;
  text: string;
  is_correct: boolean;
  explanation: string | null;
  sort_order: number;
};

export type Question = {
  id: string;
  domain_id: string;
  scenario: string | null;
  stem: string;
  key_concept: string | null;
  difficulty: string;
  sort_order: number;
};

export type QuestionWithOptions = Question & { options: QuestionOption[] };

export type Attempt = {
  id: string;
  user_id: string;
  question_id: string;
  selected_option_id: string | null;
  is_correct: boolean;
  time_ms: number;
  created_at: string;
};

export async function fetchDomains(): Promise<Domain[]> {
  const { data, error } = await supabase
    .from("domains")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data as Domain[];
}

export async function fetchDomainBySlug(slug: string): Promise<Domain | null> {
  const { data, error } = await supabase
    .from("domains")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data as Domain | null;
}

export async function fetchDomainQuestions(
  domainId: string,
): Promise<QuestionWithOptions[]> {
  const { data, error } = await supabase
    .from("questions")
    .select("*, options:question_options(*)")
    .eq("domain_id", domainId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((q) => ({
    ...q,
    options: (q.options as QuestionOption[]).sort(
      (a, b) => a.sort_order - b.sort_order,
    ),
  })) as QuestionWithOptions[];
}

export async function recordAttempt(input: {
  userId: string;
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  timeMs: number;
}) {
  const { error } = await supabase.from("question_attempts").insert({
    user_id: input.userId,
    question_id: input.questionId,
    selected_option_id: input.selectedOptionId,
    is_correct: input.isCorrect,
    time_ms: input.timeMs,
  });
  if (error) throw error;
}

export async function fetchMyAttempts(): Promise<Attempt[]> {
  const { data, error } = await supabase
    .from("question_attempts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data as Attempt[];
}

export async function fetchMyDomainProgress(): Promise<
  Record<string, { attempted: number; correct: number; total: number }>
> {
  const [{ data: qs, error: qErr }, { data: attempts, error: aErr }] =
    await Promise.all([
      supabase.from("questions").select("id, domain_id"),
      supabase
        .from("question_attempts")
        .select("question_id, is_correct")
        .order("created_at", { ascending: false }),
    ]);
  if (qErr) throw qErr;
  if (aErr) throw aErr;

  const qToDomain = new Map<string, string>();
  const totals: Record<string, number> = {};
  (qs ?? []).forEach((q) => {
    qToDomain.set(q.id as string, q.domain_id as string);
    totals[q.domain_id as string] = (totals[q.domain_id as string] ?? 0) + 1;
  });

  // Latest attempt per question wins (attempts are sorted DESC).
  const latestByQ = new Map<string, boolean>();
  (attempts ?? []).forEach((a) => {
    const qid = a.question_id as string;
    if (!latestByQ.has(qid)) latestByQ.set(qid, a.is_correct as boolean);
  });

  const out: Record<
    string,
    { attempted: number; correct: number; total: number }
  > = {};
  Object.keys(totals).forEach((d) => {
    out[d] = { attempted: 0, correct: 0, total: totals[d] };
  });
  latestByQ.forEach((correct, qid) => {
    const d = qToDomain.get(qid);
    if (!d) return;
    out[d].attempted += 1;
    if (correct) out[d].correct += 1;
  });
  return out;
}
