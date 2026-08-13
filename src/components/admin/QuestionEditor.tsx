/**
 * Stage 6b sub-task 4 — question authoring form.
 * Create or edit a question plus its options; writes go through admin-only
 * server functions that verify the caller's role before touching content.
 */

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  saveQuestion,
  deleteQuestion,
  getQuestion,
  type QuestionDraft,
  type QuestionDraftOption,
} from "@/lib/admin.functions";

const DIFFICULTIES = ["easy", "medium", "hard"];

const input =
  "mt-1 w-full border border-border bg-background px-2 py-1.5 font-mono text-[11px] outline-none focus:border-primary";
const label = "font-mono text-[10px] uppercase tracking-widest text-muted-foreground";

function blankOption(i: number): QuestionDraftOption {
  return { label: String.fromCharCode(65 + i), text: "", isCorrect: false, explanation: null };
}

function blankDraft(domainId: string): QuestionDraft {
  return {
    domainId,
    scenario: null,
    stem: "",
    keyConcept: null,
    difficulty: "medium",
    options: [0, 1, 2, 3].map(blankOption),
  };
}

export function QuestionEditor({
  domains,
  questionId,
  defaultDomainId,
  onClose,
}: {
  domains: { id: string; title: string }[];
  questionId?: string;
  defaultDomainId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveQuestion);
  const remove = useServerFn(deleteQuestion);
  const load = useServerFn(getQuestion);

  const [draft, setDraft] = useState<QuestionDraft>(() => blankDraft(defaultDomainId));
  const [loading, setLoading] = useState(Boolean(questionId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!questionId) return;
    setLoading(true);
    load({ data: { id: questionId } })
      .then((d) => {
        if (alive) setDraft(d);
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [questionId, load]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin-content"] });
  };

  const saveMut = useMutation({
    mutationFn: () => save({ data: draft }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => remove({ data: { id: questionId! } }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const patchOption = (i: number, patch: Partial<QuestionDraftOption>) =>
    setDraft((d) => ({ ...d, options: d.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));

  if (loading) return <p className="mt-4 font-mono text-xs text-muted-foreground">Loading question…</p>;

  return (
    <div className="mt-4 border border-primary/50 bg-background p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-xs font-bold uppercase tracking-widest">
          {questionId ? "Edit_Question" : "New_Question"}
        </h3>
        <button type="button" onClick={onClose} className={label}>
          Close
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <span className={label}>Domain</span>
          <select
            value={draft.domainId}
            onChange={(e) => setDraft({ ...draft, domainId: e.target.value })}
            className={input}
          >
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Difficulty</span>
          <select
            value={draft.difficulty}
            onChange={(e) => setDraft({ ...draft, difficulty: e.target.value })}
            className={input}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Key concept</span>
          <input
            value={draft.keyConcept ?? ""}
            onChange={(e) => setDraft({ ...draft, keyConcept: e.target.value })}
            className={input}
          />
        </div>
      </div>

      <div className="mt-3">
        <span className={label}>Scenario (optional)</span>
        <textarea
          rows={2}
          value={draft.scenario ?? ""}
          onChange={(e) => setDraft({ ...draft, scenario: e.target.value })}
          className={input}
        />
      </div>

      <div className="mt-3">
        <span className={label}>Stem</span>
        <textarea
          rows={3}
          value={draft.stem}
          onChange={(e) => setDraft({ ...draft, stem: e.target.value })}
          className={input}
        />
      </div>

      <div className="mt-4 space-y-2">
        <span className={label}>Options — mark exactly one correct</span>
        {draft.options.map((o, i) => (
          <div key={i} className="border border-border/60 p-3">
            <div className="flex items-center gap-3">
              <input
                value={o.label}
                onChange={(e) => patchOption(i, { label: e.target.value })}
                className="w-12 border border-border bg-background px-2 py-1 text-center font-mono text-[11px]"
              />
              <input
                value={o.text}
                onChange={(e) => patchOption(i, { text: e.target.value })}
                placeholder="Option text"
                className="flex-1 border border-border bg-background px-2 py-1 font-mono text-[11px]"
              />
              <label className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest">
                <input
                  type="radio"
                  name="correct-option"
                  checked={o.isCorrect}
                  onChange={() =>
                    setDraft((d) => ({
                      ...d,
                      options: d.options.map((x, j) => ({ ...x, isCorrect: j === i })),
                    }))
                  }
                />
                Correct
              </label>
              {draft.options.length > 2 && (
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, options: d.options.filter((_, j) => j !== i) }))}
                  className="font-mono text-[10px] uppercase tracking-widest text-destructive"
                >
                  Remove
                </button>
              )}
            </div>
            <input
              value={o.explanation ?? ""}
              onChange={(e) => patchOption(i, { explanation: e.target.value })}
              placeholder="Explanation shown after answering"
              className="mt-2 w-full border border-border bg-background px-2 py-1 font-mono text-[11px]"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setDraft((d) => ({ ...d, options: [...d.options, blankOption(d.options.length)] }))}
          className="border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-muted"
        >
          Add_Option
        </button>
      </div>

      {error && <p className="mt-3 font-mono text-[11px] text-destructive">{error}</p>}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={saveMut.isPending}
          onClick={() => {
            setError(null);
            saveMut.mutate();
          }}
          className="bg-primary px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
        >
          {saveMut.isPending ? "Saving…" : "Save_Question"}
        </button>
        {questionId && (
          <button
            type="button"
            disabled={deleteMut.isPending}
            onClick={() => {
              setError(null);
              if (confirm("Delete this question and all its attempts?")) deleteMut.mutate();
            }}
            className="border border-destructive px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-destructive disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
