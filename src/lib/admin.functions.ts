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
