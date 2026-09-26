/**
 * D3/D4 — shared option list for the question runners.
 * Single mode: pick one (radio). Multiple mode: "Select all that apply" checkboxes.
 * Both require the explicit Submit button in the parent. After reveal, the
 * grade banner shows a third "partly right" state with colour, icon and words.
 */
import { Check, CircleDot, X } from "lucide-react";
import { gradeAnswer, resultLabel, type AnswerMode } from "@/lib/answer-mode";

type Opt = { id: string; label: string; text: string; is_correct: boolean; explanation: string | null };

export function AnswerOptions({
  options,
  mode,
  picked,
  onChange,
  revealed,
  focusLabel,
}: {
  options: Opt[];
  mode: AnswerMode;
  picked: string[];
  onChange: (ids: string[]) => void;
  revealed: boolean;
  focusLabel?: string | null;
}) {
  const multi = mode === "multiple";
  const grade = revealed ? gradeAnswer(options, picked) : null;

  function toggle(id: string) {
    if (!multi) return onChange([id]);
    onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  }

  return (
    <div>
      {multi && (
        <p className="mb-2 text-sm font-medium text-foreground">
          Select all that apply
          <span className="ml-2 text-xs text-muted-foreground">
            ({options.filter((o) => o.is_correct).length} correct)
          </span>
        </p>
      )}
      <ul className="space-y-1.5" role={multi ? "group" : "radiogroup"}>
        {options.map((opt) => {
          const isSelected = picked.includes(opt.id);
          const showCorrect = revealed && opt.is_correct;
          const showWrong = revealed && isSelected && !opt.is_correct;
          const missed = revealed && multi && opt.is_correct && !isSelected;
          return (
            <li key={opt.id}>
              <button
                type="button"
                role={multi ? "checkbox" : "radio"}
                aria-checked={isSelected}
                disabled={revealed}
                onClick={() => toggle(opt.id)}
                className={`flex w-full items-start gap-3 border px-3 py-2.5 text-left transition-colors ${
                  showCorrect
                    ? missed
                      ? "border-warning bg-warning/10"
                      : "border-success bg-success/10"
                    : showWrong
                      ? "border-destructive bg-destructive/10"
                      : isSelected
                        ? "border-primary bg-secondary"
                        : "border-border hover:bg-secondary"
                } ${focusLabel === opt.label ? "mentor-focus" : ""}`}
              >
                {multi && (
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border ${
                      isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </span>
                )}
                <span className={`font-mono text-xs font-bold ${showCorrect ? "text-success" : "text-primary"}`}>
                  {opt.label}
                </span>
                <span className={`flex-1 text-sm leading-relaxed ${showCorrect ? "font-semibold text-success" : ""}`}>
                  {opt.text}
                  {missed && <span className="ml-2 text-xs font-normal text-warning">Missed</span>}
                </span>
              </button>
              {revealed && (opt.is_correct || isSelected) && opt.explanation && (
                <div className="mt-1 border-l-2 border-primary/40 bg-secondary/30 px-3 py-1.5 font-mono text-xs leading-relaxed text-muted-foreground">
                  {opt.explanation}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {grade && (
        <div
          role="status"
          className={`mt-3 flex items-center gap-2 border px-3 py-2 text-sm font-medium ${
            grade.result === "correct"
              ? "border-success bg-success/10 text-success"
              : grade.result === "partial"
                ? "border-warning bg-warning/10 text-warning"
                : "border-destructive bg-destructive/10 text-destructive"
          }`}
        >
          {grade.result === "correct" ? (
            <Check className="h-4 w-4" />
          ) : grade.result === "partial" ? (
            <CircleDot className="h-4 w-4" />
          ) : (
            <X className="h-4 w-4" />
          )}
          {resultLabel(grade)}
        </div>
      )}
    </div>
  );
}
