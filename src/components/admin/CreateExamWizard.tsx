/**
 * G4a — create-an-exam wizard, steps 1–2: name, then blueprint with provenance.
 * Saves the exam as a draft (hidden from learners). Steps 3–4 come in G4b.
 */

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import {
  createDraftExam,
  suggestBlueprint,
  type BlueprintArea,
  type Provenance,
} from "@/lib/exam-builder.functions";

const input =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const btn =
  "inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-40";
const primary =
  "inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40";

const PROVENANCE_LABEL: Record<Provenance, string> = {
  official: "Official guide",
  manual: "Entered by hand",
  ai_suggested: "AI suggested",
};

export function CreateExamWizard() {
  const qc = useQueryClient();
  const suggest = useServerFn(suggestBlueprint);
  const create = useServerFn(createDraftExam);

  const [step, setStep] = useState<1 | 2 | "done">(1);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [description, setDescription] = useState("");
  const [passMark, setPassMark] = useState(70);
  const [questionCount, setQuestionCount] = useState(60);
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [areas, setAreas] = useState<BlueprintArea[]>([]);
  const [busy, setBusy] = useState<"suggest" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const total = areas.reduce((s, a) => s + (Number(a.weight) || 0), 0);
  const step1Valid = name.trim().length >= 3 && passMark > 0 && questionCount >= 5 && durationMinutes >= 5;
  const areasValid =
    areas.length > 0 &&
    Math.round(total) === 100 &&
    areas.every((a) => a.title.trim().length >= 2 && a.weight >= 1 && (a.provenance !== "official" || a.sourceUrl));

  function update(i: number, patch: Partial<BlueprintArea>) {
    setAreas((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  async function runSuggest() {
    setBusy("suggest");
    setError(null);
    try {
      const res = await suggest({ data: { name: name.trim(), description: description.trim() || null } });
      if (res.error) setError(res.error);
      else setAreas(res.areas);
    } catch {
      setError("Couldn't get a suggestion right now.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      const res = await create({
        data: {
          name: name.trim(),
          shortName: shortName.trim() || null,
          description: description.trim() || null,
          passMark,
          questionCount,
          durationMinutes,
          areas: areas.map((a) => ({ ...a, title: a.title.trim(), sourceUrl: a.sourceUrl?.trim() || null })),
        },
      });
      setCreated(res.slug);
      setStep("done");
      qc.invalidateQueries({ queryKey: ["exams"] });
      toast.success("Draft exam saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the exam.");
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setStep(1);
    setName("");
    setShortName("");
    setDescription("");
    setAreas([]);
    setCreated(null);
    setError(null);
  }

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Wizard steps">
        {["Name", "Blueprint", "Scope", "Build"].map((label, i) => {
          const n = i + 1;
          const current = step === n;
          const doneStep = step === "done" ? n <= 2 : typeof step === "number" && n < step;
          return (
            <li
              key={label}
              aria-current={current ? "step" : undefined}
              className={[
                "rounded-md border px-2 py-1",
                current ? "border-primary text-foreground" : "border-border text-muted-foreground",
                doneStep ? "bg-success-soft text-success" : "",
                n > 2 ? "opacity-50" : "",
              ].join(" ")}
            >
              {n}. {label}
              {n > 2 ? " (coming next)" : ""}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm">Exam name</span>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AWS Solutions Architect Associate" />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Short name</span>
            <input className={input} value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="e.g. SAA-C03" />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Pass mark (%)</span>
            <input type="number" className={input} value={passMark} min={1} max={100} onChange={(e) => setPassMark(Number(e.target.value))} />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Questions</span>
            <input type="number" className={input} value={questionCount} min={5} max={300} onChange={(e) => setQuestionCount(Number(e.target.value))} />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Time limit (minutes)</span>
            <input type="number" className={input} value={durationMinutes} min={5} max={600} onChange={(e) => setDurationMinutes(Number(e.target.value))} />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm">Description</span>
            <textarea className={input} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="sm:col-span-2">
            <button className={primary} disabled={!step1Valid} onClick={() => setStep(2)}>
              Next: blueprint
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button className={btn} onClick={runSuggest} disabled={busy !== null}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {busy === "suggest" ? "Suggesting…" : "Suggest blueprint"}
            </button>
            <button
              className={btn}
              onClick={() => setAreas((p) => [...p, { title: "", weight: 10, provenance: "manual", sourceUrl: null }])}
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add area
            </button>
            <span
              className={[
                "ml-auto rounded-md px-2 py-1 font-mono text-xs",
                Math.round(total) === 100 ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
              ].join(" ")}
            >
              Total {total}% / 100%
            </span>
          </div>

          {areas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No study areas yet. Add them by hand or ask for a suggestion.</p>
          ) : (
            <ul className="space-y-3">
              {areas.map((a, i) => (
                <li key={i} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_6rem_10rem_auto]">
                  <input className={input} aria-label="Area title" value={a.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="Area title" />
                  <input type="number" className={input} aria-label="Weight %" value={a.weight} min={1} max={100} onChange={(e) => update(i, { weight: Number(e.target.value) })} />
                  <select className={input} aria-label="Source" value={a.provenance} onChange={(e) => update(i, { provenance: e.target.value as Provenance })}>
                    {Object.entries(PROVENANCE_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <button className={btn} aria-label="Remove area" onClick={() => setAreas((p) => p.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <input
                    className={`${input} sm:col-span-4`}
                    aria-label="Source link"
                    value={a.sourceUrl ?? ""}
                    onChange={(e) => update(i, { sourceUrl: e.target.value || null })}
                    placeholder={a.provenance === "official" ? "Official guide link (required)" : "Source link (optional)"}
                  />
                  {a.provenance === "ai_suggested" && (
                    <p className="text-xs text-warning sm:col-span-4">AI suggested. Check it against the official guide before you publish.</p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {error && <p role="alert" className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2">
            <button className={btn} onClick={() => setStep(1)}>Back</button>
            <button className={primary} disabled={!areasValid || busy !== null} onClick={save}>
              {busy === "save" ? "Saving…" : "Save draft exam"}
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-3">
          <p className="text-sm">
            <strong>{name}</strong> is saved as a draft ({created}) with {areas.length} study areas. Learners won't see it yet.
          </p>
          <button className={btn} onClick={reset}>Create another</button>
        </div>
      )}
    </div>
  );
}
