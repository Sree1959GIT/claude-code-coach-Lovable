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

    const ids = session.metadata?.question_ids as string[] | undefined;
    if (!ids || ids.length === 0) throw new Error("Session has no questions");

    const { data: rawQuestions, error: qErr } = await supabase
      .from("questions")
      .select("*, options:question_options(*)")
      .in("id", ids) as unknown as Promise<{
        data: (Question & { options: QuestionOption[] })[] | null;
        error: Error | null;
      }>;
    if (qErr) throw qErr;

    const byId = new Map(
      (rawQuestions ?? []).map((q) => [
        q.id,
        {
          ...q,
          options: q.options.sort((a, b) => a.sort_order - b.sort_order),
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

