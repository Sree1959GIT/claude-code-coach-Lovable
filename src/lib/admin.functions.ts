/**
 * Stage 6b sub-task 2 — admin learners view.
 *
 * Admin-only server functions. The caller's admin role is verified with the
 * *user-scoped* client (`has_role`) before any privileged read runs.
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

export type Learner = {
  userId: string;
  displayName: string | null;
  joinedAt: string;
  roles: string[];
  attempts: number;
  correct: number;
  accuracy: number;
  masteryTracked: number;
  lastActiveAt: string | null;
};

export const listLearners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Learner[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profilesRes, rolesRes, attemptsRes, masteryRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, created_at"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("question_attempts").select("user_id, is_correct, created_at"),
      supabaseAdmin.from("user_mastery").select("user_id"),
    ]);

    for (const r of [profilesRes, rolesRes, attemptsRes, masteryRes]) {
      if (r.error) throw r.error;
    }

    const rolesBy = new Map<string, string[]>();
    for (const r of rolesRes.data ?? []) {
      const list = rolesBy.get(r.user_id) ?? [];
      list.push(r.role as string);
      rolesBy.set(r.user_id, list);
    }

    const statsBy = new Map<string, { attempts: number; correct: number; last: string | null }>();
    for (const a of attemptsRes.data ?? []) {
      const s = statsBy.get(a.user_id) ?? { attempts: 0, correct: 0, last: null };
      s.attempts += 1;
      if (a.is_correct) s.correct += 1;
      if (!s.last || a.created_at > s.last) s.last = a.created_at;
      statsBy.set(a.user_id, s);
    }

    const masteryBy = new Map<string, number>();
    for (const m of masteryRes.data ?? []) {
      masteryBy.set(m.user_id, (masteryBy.get(m.user_id) ?? 0) + 1);
    }

    return (profilesRes.data ?? [])
      .map((p) => {
        const s = statsBy.get(p.id) ?? { attempts: 0, correct: 0, last: null };
        return {
          userId: p.id,
          displayName: p.display_name,
          joinedAt: p.created_at,
          roles: (rolesBy.get(p.id) ?? []).sort(),
          attempts: s.attempts,
          correct: s.correct,
          accuracy: s.attempts ? Math.round((s.correct / s.attempts) * 100) : 0,
          masteryTracked: masteryBy.get(p.id) ?? 0,
          lastActiveAt: s.last,
        };
      })
      .sort((a, b) => (b.lastActiveAt ?? b.joinedAt).localeCompare(a.lastActiveAt ?? a.joinedAt));
  });

export type ContentDomain = {
  id: string;
  slug: string;
  title: string;
  weight: number;
  sortOrder: number;
  questionCount: number;
  attemptCount: number;
  accuracy: number | null;
  issues: number;
  questions: {
    id: string;
    stem: string;
    difficulty: string;
    optionCount: number;
    hasCorrect: boolean;
    hasExplanation: boolean;
    attempts: number;
    accuracy: number | null;
  }[];
};

export const listContent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ContentDomain[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [domainsRes, questionsRes, optionsRes, attemptsRes] = await Promise.all([
      supabaseAdmin.from("domains").select("id, slug, title, weight, sort_order").order("sort_order"),
      supabaseAdmin.from("questions").select("id, domain_id, stem, difficulty, sort_order").order("sort_order"),
      supabaseAdmin.from("question_options").select("question_id, is_correct, explanation"),
      supabaseAdmin.from("question_attempts").select("question_id, is_correct"),
    ]);
    for (const r of [domainsRes, questionsRes, optionsRes, attemptsRes]) {
      if (r.error) throw r.error;
    }

    const optsBy = new Map<string, { count: number; correct: number; explained: number }>();
    for (const o of optionsRes.data ?? []) {
      const s = optsBy.get(o.question_id) ?? { count: 0, correct: 0, explained: 0 };
      s.count += 1;
      if (o.is_correct) s.correct += 1;
      if (o.explanation && o.explanation.trim()) s.explained += 1;
      optsBy.set(o.question_id, s);
    }

    const attBy = new Map<string, { n: number; ok: number }>();
    for (const a of attemptsRes.data ?? []) {
      const s = attBy.get(a.question_id) ?? { n: 0, ok: 0 };
      s.n += 1;
      if (a.is_correct) s.ok += 1;
      attBy.set(a.question_id, s);
    }

    return (domainsRes.data ?? []).map((d) => {
      const qs = (questionsRes.data ?? []).filter((q) => q.domain_id === d.id);
      let attemptCount = 0;
      let correctCount = 0;
      let issues = 0;

      const questions = qs.map((q) => {
        const o = optsBy.get(q.id) ?? { count: 0, correct: 0, explained: 0 };
        const a = attBy.get(q.id) ?? { n: 0, ok: 0 };
        attemptCount += a.n;
        correctCount += a.ok;
        const hasCorrect = o.correct === 1;
        const hasExplanation = o.explained > 0;
        if (!hasCorrect || o.count < 2 || !hasExplanation) issues += 1;
        return {
          id: q.id,
          stem: q.stem,
          difficulty: q.difficulty,
          optionCount: o.count,
          hasCorrect,
          hasExplanation,
          attempts: a.n,
          accuracy: a.n ? Math.round((a.ok / a.n) * 100) : null,
        };
      });

      return {
        id: d.id,
        slug: d.slug,
        title: d.title,
        weight: Number(d.weight),
        sortOrder: d.sort_order,
        questionCount: qs.length,
        attemptCount,
        accuracy: attemptCount ? Math.round((correctCount / attemptCount) * 100) : null,
        issues,
        questions,
      };
    });
  });

/**
 * Stage 6b sub-task 4 — question authoring.
 * Writes go through the service-role client because questions/options are
 * read-only through the Data API; the caller is verified as admin first.
 */

export type QuestionDraftOption = {
  id?: string;
  label: string;
  text: string;
  isCorrect: boolean;
  explanation: string | null;
};

export type QuestionDraft = {
  id?: string;
  domainId: string;
  scenario: string | null;
  stem: string;
  keyConcept: string | null;
  difficulty: string;
  options: QuestionDraftOption[];
};

function validateDraft(input: QuestionDraft): QuestionDraft {
  if (!input.domainId) throw new Error("Pick a domain.");
  if (!input.stem?.trim()) throw new Error("The question stem is required.");
  const options = (input.options ?? []).filter((o) => o.text?.trim());
  if (options.length < 2) throw new Error("Add at least two answer options.");
  if (options.filter((o) => o.isCorrect).length !== 1) throw new Error("Mark exactly one correct option.");
  return { ...input, options };
}

export const saveQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: QuestionDraft) => validateDraft(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const row = {
      domain_id: data.domainId,
      scenario: data.scenario?.trim() || null,
      stem: data.stem.trim(),
      key_concept: data.keyConcept?.trim() || null,
      difficulty: data.difficulty,
    };

    let questionId = data.id;
    if (questionId) {
      const { error } = await supabaseAdmin.from("questions").update(row).eq("id", questionId);
      if (error) throw error;
      const { error: delErr } = await supabaseAdmin.from("question_options").delete().eq("question_id", questionId);
      if (delErr) throw delErr;
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("questions")
        .insert(row)
        .select("id")
        .single();
      if (error) throw error;
      questionId = inserted.id;
    }

    const { error: optErr } = await supabaseAdmin.from("question_options").insert(
      data.options.map((o, i) => ({
        question_id: questionId!,
        label: o.label?.trim() || String.fromCharCode(65 + i),
        text: o.text.trim(),
        is_correct: o.isCorrect,
        explanation: o.explanation?.trim() || null,
        sort_order: i,
      })),
    );
    if (optErr) throw optErr;

    return { id: questionId! };
  });

export const deleteQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: aErr } = await supabaseAdmin.from("question_attempts").delete().eq("question_id", data.id);
    if (aErr) throw aErr;
    const { error: mErr } = await supabaseAdmin.from("user_mastery").delete().eq("question_id", data.id);
    if (mErr) throw mErr;
    const { error: oErr } = await supabaseAdmin.from("question_options").delete().eq("question_id", data.id);
    if (oErr) throw oErr;
    const { error } = await supabaseAdmin.from("questions").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getQuestion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<QuestionDraft> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: q, error: qErr }, { data: opts, error: oErr }] = await Promise.all([
      supabaseAdmin
        .from("questions")
        .select("id, domain_id, scenario, stem, key_concept, difficulty")
        .eq("id", data.id)
        .single(),
      supabaseAdmin
        .from("question_options")
        .select("id, label, text, is_correct, explanation, sort_order")
        .eq("question_id", data.id)
        .order("sort_order"),
    ]);
    if (qErr) throw qErr;
    if (oErr) throw oErr;
    return {
      id: q.id,
      domainId: q.domain_id,
      scenario: q.scenario,
      stem: q.stem,
      keyConcept: q.key_concept,
      difficulty: q.difficulty,
      options: (opts ?? []).map((o) => ({
        id: o.id,
        label: o.label,
        text: o.text,
        isCorrect: o.is_correct,
        explanation: o.explanation,
      })),
    };
  });

/**
 * Stage 6b sub-task 6 — review queue.
 * Admin-only listing plus approve / reject resolution for drafted questions.
 */

export type ReviewItem = {
  id: string;
  questionId: string;
  status: string;
  source: string;
  notes: string | null;
  createdAt: string;
  reviewedAt: string | null;
  stem: string;
  domainTitle: string;
  optionCount: number;
  hasCorrect: boolean;
  hasExplanation: boolean;
};

export const listReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReviewItem[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: reviews, error } = await supabaseAdmin
      .from("content_reviews")
      .select("id, question_id, status, source, notes, created_at, reviewed_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const rows = reviews ?? [];
    if (rows.length === 0) return [];

    const questionIds = [...new Set(rows.map((r) => r.question_id))];
    const [questionsRes, optionsRes, domainsRes] = await Promise.all([
      supabaseAdmin.from("questions").select("id, stem, domain_id").in("id", questionIds),
      supabaseAdmin.from("question_options").select("question_id, is_correct, explanation").in("question_id", questionIds),
      supabaseAdmin.from("domains").select("id, title"),
    ]);
    for (const r of [questionsRes, optionsRes, domainsRes]) {
      if (r.error) throw r.error;
    }

    const domainTitle = new Map((domainsRes.data ?? []).map((d) => [d.id, d.title as string]));
    const questionById = new Map((questionsRes.data ?? []).map((q) => [q.id, q]));
    const optsBy = new Map<string, { count: number; correct: number; explained: number }>();
    for (const o of optionsRes.data ?? []) {
      const s = optsBy.get(o.question_id) ?? { count: 0, correct: 0, explained: 0 };
      s.count += 1;
      if (o.is_correct) s.correct += 1;
      if (o.explanation && o.explanation.trim()) s.explained += 1;
      optsBy.set(o.question_id, s);
    }

    return rows.map((r) => {
      const q = questionById.get(r.question_id);
      const o = optsBy.get(r.question_id) ?? { count: 0, correct: 0, explained: 0 };
      return {
        id: r.id,
        questionId: r.question_id,
        status: r.status,
        source: r.source,
        notes: r.notes,
        createdAt: r.created_at,
        reviewedAt: r.reviewed_at,
        stem: q?.stem ?? "(question deleted)",
        domainTitle: (q && domainTitle.get(q.domain_id)) ?? "—",
        optionCount: o.count,
        hasCorrect: o.correct === 1,
        hasExplanation: o.explained > 0,
      };
    });
  });

export const submitForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { questionId: string; notes?: string | null }) => {
    if (!input.questionId) throw new Error("Missing question.");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: exErr } = await supabaseAdmin
      .from("content_reviews")
      .select("id")
      .eq("question_id", data.questionId)
      .eq("status", "pending")
      .maybeSingle();
    if (exErr) throw exErr;
    if (existing) return { id: existing.id };

    const { data: inserted, error } = await supabaseAdmin
      .from("content_reviews")
      .insert({
        question_id: data.questionId,
        status: "pending",
        source: "admin",
        submitted_by: context.userId,
        notes: data.notes?.trim() || null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: inserted.id };
  });

export const resolveReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: "approved" | "rejected"; notes?: string | null }) => {
    if (!input.id) throw new Error("Missing review.");
    if (input.status !== "approved" && input.status !== "rejected") throw new Error("Invalid decision.");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("content_reviews")
      .update({
        status: data.status,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        ...(data.notes?.trim() ? { notes: data.notes.trim() } : {}),
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
