/**
 * G1 — exam entity.
 *
 * The app was hard-coded to one certification: five fixed domains, a 65
 * question / 90 minute / 70% mock exam. Those facts now live in the `exams`
 * table, with domains hanging off an exam. This module is the read path.
 *
 * The constants below stay as a last-resort fallback so a slow or failed
 * exam lookup never blanks a screen.
 */

import { supabase } from "@/integrations/supabase/client";

export type Exam = {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  description: string | null;
  /** Percentage, 0-100. */
  passMark: number;
  questionCount: number;
  durationMinutes: number;
  status: string;
  isDefault: boolean;
};

export const FALLBACK_EXAM: Exam = {
  id: "",
  slug: "ccaf",
  name: "Claude Code Architect Foundation",
  shortName: "CCAF",
  description: null,
  passMark: 70,
  questionCount: 65,
  durationMinutes: 90,
  status: "ready",
  isDefault: true,
};

type ExamRow = {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  description: string | null;
  pass_mark: number | string;
  question_count: number;
  duration_minutes: number;
  status: string;
  is_default: boolean;
};

const EXAM_COLUMNS =
  "id, slug, name, short_name, description, pass_mark, question_count, duration_minutes, status, is_default";

function mapExam(row: ExamRow): Exam {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortName: row.short_name,
    description: row.description,
    passMark: Number(row.pass_mark) || FALLBACK_EXAM.passMark,
    questionCount: row.question_count || FALLBACK_EXAM.questionCount,
    durationMinutes: row.duration_minutes || FALLBACK_EXAM.durationMinutes,
    status: row.status,
    isDefault: row.is_default,
  };
}

/** The exam every screen defaults to until an exam switcher exists (G2). */
export async function fetchActiveExam(): Promise<Exam> {
  const { data, error } = await supabase
    .from("exams")
    .select(EXAM_COLUMNS)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? mapExam(data as unknown as ExamRow) : FALLBACK_EXAM;
}

export async function fetchExams(): Promise<Exam[]> {
  const { data, error } = await supabase
    .from("exams")
    .select(EXAM_COLUMNS)
    .order("is_default", { ascending: false })
    .order("name");

  if (error) throw error;
  return (data ?? []).map((row) => mapExam(row as unknown as ExamRow));
}

/** Pass mark as a 0-1 ratio, which is how the scoring code expects it. */
export function passRatio(exam: Pick<Exam, "passMark">): number {
  const pct = Number(exam.passMark);
  if (!Number.isFinite(pct) || pct <= 0) return FALLBACK_EXAM.passMark / 100;
  return pct > 1 ? pct / 100 : pct;
}

export type ExamDomain = {
  id: string;
  slug: string;
  title: string;
  weight: number;
};

/** Blueprint rows for an exam. Empty is a valid state: a new exam has none. */
export async function fetchExamDomains(examId: string): Promise<ExamDomain[]> {
  if (!examId) return [];
  const { data, error } = await supabase
    .from("domains")
    .select("id, slug, title, weight")
    .eq("exam_id", examId)
    .order("sort_order");

  if (error) throw error;
  return (data ?? []) as ExamDomain[];
}
