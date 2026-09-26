/**
 * D1–D4 — answer modes and grading.
 * single: exactly one correct option, radio-style.
 * multiple: one or more correct options, checkbox-style, explicit submit.
 * Grading yields three states: correct, partial (some right, none wrong), incorrect.
 */

export type AnswerMode = "single" | "multiple";
export type AnswerResult = "correct" | "partial" | "incorrect";

export type Gradable = { id: string; is_correct: boolean };

export type Grade = {
  result: AnswerResult;
  /** 0..1 credit. Partial = share of correct options picked. */
  score: number;
  correctPicked: number;
  correctTotal: number;
  wrongPicked: number;
};

export function asAnswerMode(v: unknown): AnswerMode {
  return v === "multiple" ? "multiple" : "single";
}

export function gradeAnswer(options: Gradable[], selectedIds: string[]): Grade {
  const picked = new Set(selectedIds);
  const correctTotal = options.filter((o) => o.is_correct).length;
  let correctPicked = 0;
  let wrongPicked = 0;
  for (const o of options) {
    if (!picked.has(o.id)) continue;
    if (o.is_correct) correctPicked += 1;
    else wrongPicked += 1;
  }
  if (correctTotal > 0 && correctPicked === correctTotal && wrongPicked === 0) {
    return { result: "correct", score: 1, correctPicked, correctTotal, wrongPicked };
  }
  if (correctPicked > 0 && wrongPicked === 0) {
    return {
      result: "partial",
      score: Math.round((correctPicked / correctTotal) * 100) / 100,
      correctPicked,
      correctTotal,
      wrongPicked,
    };
  }
  return { result: "incorrect", score: 0, correctPicked, correctTotal, wrongPicked };
}

export function resultLabel(g: Grade): string {
  if (g.result === "correct") return "Correct";
  if (g.result === "partial") return `Partly right — ${g.correctPicked} of ${g.correctTotal}`;
  return "Incorrect";
}
