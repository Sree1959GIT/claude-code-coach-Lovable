import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Question, QuestionOption } from "./study";
import {
  buildAttemptsMap,
  buildExamSample,
  buildMasteryMap,
  nextAdaptive,
  nextWeakArea,
  splitPool,
} from "./adaptive";
import { fetchDomains } from "./study";
import { initialState, scheduleNext } from "./fsrs";

export type SessionQuestion = {
  id: string;
  domain_id: string;
  scenario: string | null;
  stem: string;
  key_concept: string | null;
  difficulty: string;
  options: QuestionOption[];
};

export type SessionDetail = {
  id: string;
  mode: string;
  domain_id: string | null;
  target_count: number;
  time_limit_ms: number | null;
  started_at: string;
  ended_at: string | null;
  metadata: { question_ids: string[] };
  questions: SessionQuestion[];
};


export const startSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        mode: z.enum(["adaptive", "weak", "exam"]),
        domainId: z.string().uuid().nullable().optional(),
        targetCount: z.number().int().min(1).max(200).default(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: rawQuestions, error: qErr }, domains] = await Promise.all([
      supabase
        .from("questions")
        .select("*, options:question_options(*)")
        .order("sort_order") as unknown as Promise<{
          data: (Question & { options: QuestionOption[] })[] | null;
          error: Error | null;
        }>,
      fetchDomains(),
    ]);
    if (qErr) throw qErr;

    const questions = (rawQuestions ?? []).map((q) => ({
      ...q,
      options: q.options.sort((a, b) => a.sort_order - b.sort_order),
    }));

    let pool = questions;
    if (data.domainId) {
      pool = questions.filter((q) => q.domain_id === data.domainId);
    }

    let selected: typeof questions = [];
    let timeLimitMs: number | null = null;

    if (data.mode === "exam") {
      const target = data.targetCount;
      timeLimitMs =
        target >= 60
          ? 90 * 60 * 1000
          : Math.max(2, target) * 1.5 * 60 * 1000;
      selected = buildExamSample(pool, domains, target);
    } else {
      const { data: masteryRows, error: mErr } = await supabase
        .from("user_mastery")
        .select(
          "question_id, status, due_at, stability, difficulty, reps, lapses, last_attempt_at, last_attempt_correct",
        )
        .eq("user_id", userId);
      if (mErr) throw mErr;
      const mastery = buildMasteryMap(masteryRows ?? []);

      const seen = new Set<string>();
      if (data.mode === "adaptive") {
        const split = splitPool(pool, mastery);
        for (let i = 0; i < data.targetCount; i++) {
          const q = nextAdaptive(split, seen);
          if (!q) break;
          selected.push(q);
          seen.add(q.id);
        }
      } else {
        const { data: attempts, error: aErr } = await supabase
          .from("question_attempts")
          .select("question_id, is_correct, time_ms")
          .eq("user_id", userId);
        if (aErr) throw aErr;
        const attemptsMap = buildAttemptsMap(attempts ?? []);
        for (let i = 0; i < data.targetCount; i++) {
          const q = nextWeakArea(pool, mastery, attemptsMap, seen);
          if (!q) break;
          selected.push(q);
          seen.add(q.id);
        }
      }
    }

    const { data: session, error: sErr } = await supabase
      .from("practice_sessions")
      .insert({
        user_id: userId,
        mode: data.mode,
        domain_id: data.domainId ?? null,
        target_count: selected.length,
        time_limit_ms: timeLimitMs,
        metadata: { question_ids: selected.map((q) => q.id) },
      })
      .select()
      .single();
    if (sErr) throw sErr;

    return {
      sessionId: session.id,
      mode: data.mode,
      targetCount: selected.length,
      timeLimitMs,
      questions: selected.map((q) => ({
        id: q.id,
        domain_id: q.domain_id,
        scenario: q.scenario,
        stem: q.stem,
        key_concept: q.key_concept,
        difficulty: q.difficulty,
        options: q.options.map((o) => ({
          id: o.id,
          question_id: o.question_id,
          label: o.label,
          text: o.text,
          is_correct: o.is_correct,
          explanation: o.explanation,
          sort_order: o.sort_order,
        })),
      })) as SessionQuestion[],
    };
  });


export const recordSessionAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        sessionId: z.string().uuid(),
        questionId: z.string().uuid(),
        selectedOptionId: z.string().uuid(),
        isCorrect: z.boolean(),
        timeMs: z.number().int().min(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify session ownership
    const { data: session, error: sErr } = await supabase
      .from("practice_sessions")
      .select("*")
      .eq("id", data.sessionId)
      .eq("user_id", userId)
      .single();
    if (sErr || !session) throw new Error("Session not found or access denied");

    // Insert attempt
    const { error: aErr } = await supabase.from("question_attempts").insert({
      user_id: userId,
      question_id: data.questionId,
      selected_option_id: data.selectedOptionId,
      is_correct: data.isCorrect,
      time_ms: data.timeMs,
    });
    if (aErr) throw aErr;

    // Update mastery via FSRS
    const { data: mastery, error: mErr } = await supabase
      .from("user_mastery")
      .select("*")
      .eq("user_id", userId)
      .eq("question_id", data.questionId)
      .single();
    if (mErr && mErr.code !== "PGRST116") throw mErr; // PGRST116 = no rows

    const previous = mastery
      ? {
          status: mastery.status as
            | "new"
            | "learning"
            | "review"
            | "mastered"
            | "lapsed",
          dueAt: new Date(mastery.due_at ?? Date.now()),
          stability: Number(mastery.stability),
          difficulty: Number(mastery.difficulty),
          reps: mastery.reps,
          lapses: mastery.lapses,
          lastAttemptAt: mastery.last_attempt_at
            ? new Date(mastery.last_attempt_at)
            : undefined,
          lastAttemptCorrect: mastery.last_attempt_correct ?? undefined,
        }
      : initialState();

    const next = scheduleNext(previous, data.isCorrect);
    const upsert = {
      user_id: userId,
      question_id: data.questionId,
      status: next.status,
      due_at: next.dueAt.toISOString(),
      stability: next.stability,
      difficulty: next.difficulty,
      reps: next.reps,
      lapses: next.lapses,
      last_attempt_at: next.lastAttemptAt?.toISOString() ?? null,
      last_attempt_correct: next.lastAttemptCorrect ?? null,
    };

    if (mastery) {
      const { error: uErr } = await supabase
        .from("user_mastery")
        .update(upsert)
        .eq("id", mastery.id)
        .eq("user_id", userId);
      if (uErr) throw uErr;
    } else {
      const { error: iErr } = await supabase.from("user_mastery").insert(upsert);
      if (iErr) throw iErr;
    }

    return { ok: true };
  });

export const endSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("practice_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", data.sessionId)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const getMasteryOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_mastery")
      .select("*")
      .eq("user_id", userId);
    if (error) throw error;
    return data ?? [];
  });

export const getSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: session, error } = await supabase
      .from("practice_sessions")
      .select("*")
      .eq("id", data.sessionId)
      .eq("user_id", userId)
      .single();
    if (error || !session) throw new Error("Session not found");

    const ids = (session.metadata as { question_ids?: string[] } | null)?.question_ids;
    if (!ids || ids.length === 0) throw new Error("Session has no questions");

    const { data: rawQuestions, error: qErr } = (await supabase
      .from("questions")
      .select("*, options:question_options(*)")
      .in("id", ids)) as {
      data: (Question & { options: QuestionOption[] })[] | null;
      error: Error | null;
    };
    if (qErr) throw qErr;

    const byId = new Map(
      (rawQuestions ?? []).map((q: Question & { options: QuestionOption[] }) => [
        q.id,
        {
          ...q,
          options: (q.options as QuestionOption[]).sort(
            (a: QuestionOption, b: QuestionOption) => a.sort_order - b.sort_order,
          ),
        },
      ]),
    );

    const ordered = ids
      .map((id) => byId.get(id))
      .filter((q): q is NonNullable<typeof q> => !!q) as SessionQuestion[];


    return {
      id: session.id,
      mode: session.mode,
      domain_id: session.domain_id,
      target_count: session.target_count,
      time_limit_ms: session.time_limit_ms,
      started_at: session.started_at,
      ended_at: session.ended_at,
      metadata: session.metadata as { question_ids: string[] },
      questions: ordered.map((q) => ({
        id: q.id,
        domain_id: q.domain_id,
        scenario: q.scenario,
        stem: q.stem,
        key_concept: q.key_concept,
        difficulty: q.difficulty,
        options: q.options.map((o) => ({
          id: o.id,
          question_id: o.question_id,
          label: o.label,
          text: o.text,
          is_correct: o.is_correct,
          explanation: o.explanation,
          sort_order: o.sort_order,
        })),
      })) as SessionQuestion[],
    } as SessionDetail;
  });


/**
 * Stage 7 sub-task 5 — post-exam score report.
 * Blueprint-weighted breakdown of one finished session plus a remediation plan.
 */

export type ReportDomain = {
  domainId: string;
  slug: string;
  title: string;
  weight: number;
  total: number;
  correct: number;
  accuracy: number;
  avgTimeMs: number;
};

export type ReportQuestion = {
  id: string;
  stem: string;
  domainTitle: string;
  domainSlug: string;
  difficulty: string;
  isCorrect: boolean;
  timeMs: number;
  selectedLabel: string | null;
  correctLabel: string | null;
  explanation: string | null;
};

export type SessionReport = {
  sessionId: string;
  mode: string;
  startedAt: string;
  endedAt: string | null;
  timeLimitMs: number | null;
  answered: number;
  planned: number;
  correct: number;
  accuracy: number;
  weightedScore: number;
  passed: boolean;
  passMark: number;
  totalTimeMs: number;
  domains: ReportDomain[];
  missed: ReportQuestion[];
};

export const getSessionReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<SessionReport> => {
    const { supabase, userId } = context;
    const PASS = 0.7;

    const { data: session, error } = await supabase
      .from("practice_sessions")
      .select("*")
      .eq("id", data.sessionId)
      .eq("user_id", userId)
      .single();
    if (error || !session) throw new Error("Session not found");

    const ids =
      (session.metadata as { question_ids?: string[] } | null)?.question_ids ?? [];
    if (ids.length === 0) throw new Error("Session has no questions");

    const [questionsRes, attemptsRes, domains] = await Promise.all([
      supabase
        .from("questions")
        .select("id, domain_id, stem, difficulty, options:question_options(id, label, is_correct, explanation)")
        .in("id", ids),
      supabase
        .from("question_attempts")
        .select("question_id, selected_option_id, is_correct, time_ms, created_at")
        .eq("user_id", userId)
        .in("question_id", ids)
        .gte("created_at", session.started_at)
        .order("created_at"),
      fetchDomains(),
    ]);
    if (questionsRes.error) throw questionsRes.error;
    if (attemptsRes.error) throw attemptsRes.error;

    const domainById = new Map(domains.map((d) => [d.id, d]));
    const questionById = new Map((questionsRes.data ?? []).map((q: any) => [q.id, q]));

    // Last attempt per question inside this session window.
    const attemptByQuestion = new Map<string, any>();
    for (const a of attemptsRes.data ?? []) attemptByQuestion.set(a.question_id, a);

    const perDomain = new Map<string, { total: number; correct: number; time: number }>();
    const missed: ReportQuestion[] = [];
    let correct = 0;
    let totalTimeMs = 0;

    for (const id of ids) {
      const attempt = attemptByQuestion.get(id);
      if (!attempt) continue;
      const q = questionById.get(id);
      const domainId = q?.domain_id ?? "";
      const bucket = perDomain.get(domainId) ?? { total: 0, correct: 0, time: 0 };
      bucket.total += 1;
      bucket.time += attempt.time_ms ?? 0;
      totalTimeMs += attempt.time_ms ?? 0;
      if (attempt.is_correct) {
        bucket.correct += 1;
        correct += 1;
      } else if (q) {
        const opts = (q.options ?? []) as any[];
        const correctOpt = opts.find((o) => o.is_correct);
        const selected = opts.find((o) => o.id === attempt.selected_option_id);
        missed.push({
          id,
          stem: q.stem,
          domainTitle: domainById.get(domainId)?.title ?? "—",
          domainSlug: domainById.get(domainId)?.slug ?? "",
          difficulty: q.difficulty,
          isCorrect: false,
          timeMs: attempt.time_ms ?? 0,
          selectedLabel: selected?.label ?? null,
          correctLabel: correctOpt?.label ?? null,
          explanation: correctOpt?.explanation ?? null,
        });
      }
      perDomain.set(domainId, bucket);
    }

    const reportDomains: ReportDomain[] = domains
      .filter((d) => perDomain.has(d.id))
      .map((d) => {
        const b = perDomain.get(d.id)!;
        return {
          domainId: d.id,
          slug: d.slug,
          title: d.title,
          weight: Number(d.weight),
          total: b.total,
          correct: b.correct,
          accuracy: b.total ? b.correct / b.total : 0,
          avgTimeMs: b.total ? Math.round(b.time / b.total) : 0,
        };
      });

    const weightSum = reportDomains.reduce((s, d) => s + d.weight, 0);
    const weightedScore = weightSum
      ? reportDomains.reduce((s, d) => s + d.weight * d.accuracy, 0) / weightSum
      : 0;

    const answered = reportDomains.reduce((s, d) => s + d.total, 0);

    return {
      sessionId: session.id,
      mode: session.mode,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      timeLimitMs: session.time_limit_ms,
      answered,
      planned: ids.length,
      correct,
      accuracy: answered ? correct / answered : 0,
      weightedScore,
      passed: weightedScore >= PASS,
      passMark: PASS,
      totalTimeMs,
      domains: reportDomains,
      missed,
    };
  });
