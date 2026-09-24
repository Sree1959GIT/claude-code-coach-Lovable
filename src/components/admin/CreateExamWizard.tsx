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
  listExamAreas,
  publishExam,
  type Provenance,
} from "@/lib/exam-builder.functions";
import { generateQuestions } from "@/lib/generate.functions";

type BuildLine = { label: string; status: "waiting" | "running" | "done" | "failed"; note?: string };

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

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const listAreas = useServerFn(listExamAreas);
  const generate = useServerFn(generateQuestions);
  const publish = useServerFn(publishExam);
  const [examId, setExamId] = useState<string | null>(null);
  const [savedAreas, setSavedAreas] = useState<{ id: string; title: string; weight: number }[]>([]);
  const [perArea, setPerArea] = useState<Record<string, number>>({});
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("mixed");
  const [lines, setLines] = useState<BuildLine[]>([]);
  const [building, setBuilding] = useState(false);
  const [published, setPublished] = useState(false);
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
      setExamId(res.examId);
      const rows = await listAreas({ data: { examId: res.examId } });
      setSavedAreas(rows);
      setPerArea(Object.fromEntries(rows.map((r) => [r.id, Math.min(20, Math.max(2, Math.round(r.weight / 5)))])));
      setStep(3);
      qc.invalidateQueries({ queryKey: ["exams"] });
      toast.success("Draft exam saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the exam.");
    } finally {
      setBusy(null);
    }
  }

  function setLine(i: number, patch: Partial<BuildLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function build() {
    const targets = savedAreas.filter((a) => (perArea[a.id] ?? 0) > 0);
    setLines([
      { label: "Exam saved as draft", status: "done" },
      { label: `${savedAreas.length} study areas saved`, status: "done" },
      ...targets.map((a) => ({ label: `Questions for ${a.title} (${perArea[a.id]})`, status: "waiting" as const })),
    ]);
    setStep(4);
    setBuilding(true);
    for (let t = 0; t < targets.length; t++) {
      const area = targets[t]!;
      const idx = t + 2;
      setLine(idx, { status: "running" });
      let remaining = perArea[area.id] ?? 0;
      let queued = 0;
      let failed = false;
      while (remaining > 0) {
        const count = Math.min(8, remaining);
        try {
          const res = await generate({ data: { domainId: area.id, count, difficulty, topicHint: "", commit: true } });
          queued += res.queued;
          setLine(idx, { note: `${queued} queued for review` });
        } catch (e) {
          failed = true;
          setLine(idx, { note: e instanceof Error ? e.message : "Generation failed" });
          break;
        }
        remaining -= count;
      }
      setLine(idx, { status: failed ? "failed" : "done", note: failed ? undefined : `${queued} queued for review` });
    }
    setBuilding(false);
  }

  async function doPublish() {
    if (!examId) return;
    try {
      await publish({ data: { examId } });
      setPublished(true);
      qc.invalidateQueries({ queryKey: ["exams"] });
      toast.success("Exam published");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't publish");
    }
  }

  function reset() {
    setStep(1);
    setExamId(null);
    setLines([]);
    setPublished(false);
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
          const doneStep = n < step || (n === 4 && lines.length > 0 && !building);
          return (
            <li
              key={label}
              aria-current={current ? "step" : undefined}
              className={[
                "rounded-md border px-2 py-1",
                current ? "border-primary text-foreground" : "border-border text-muted-foreground",
                doneStep ? "bg-success-soft text-success" : "",
              ].join(" ")}
            >
              {n}. {label}
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

      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{name}</strong> is saved as a draft ({created}). Choose how many starter questions to draft per area. They go to the review queue, not straight to learners. Set 0 to skip.
          </p>
          <ul className="space-y-2">
            {savedAreas.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-md border border-border p-2">
                <span className="min-w-0 flex-1 truncate text-sm">{a.title}</span>
                <span className="font-mono text-xs text-muted-foreground">{a.weight}%</span>
                <input
                  type="number"
                  aria-label={`Questions for ${a.title}`}
                  className={`${input} w-20`}
                  min={0}
                  max={20}
                  value={perArea[a.id] ?? 0}
                  onChange={(e) => setPerArea((p) => ({ ...p, [a.id]: Math.min(20, Math.max(0, Number(e.target.value) || 0)) }))}
                />
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-sm">
            Difficulty
            <select className={`${input} w-40`} value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
              <option value="mixed">Mixed</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            Total {Object.values(perArea).reduce((s, n) => s + n, 0)} questions.
          </p>
          <div className="flex gap-2">
            <button className={primary} onClick={build}>Build exam</button>
            <button className={btn} onClick={() => { setLines([{ label: "Exam saved as draft", status: "done" }]); setStep(4); }}>
              Skip — leave it empty
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <ul className="space-y-2" aria-live="polite">
            {lines.map((l, i) => (
              <li key={i} className="flex items-start gap-3 rounded-md border border-border p-2 text-sm">
                <span
                  className={[
                    "mt-0.5 rounded px-1.5 py-0.5 font-mono text-xs",
                    l.status === "done" ? "bg-success-soft text-success" : "",
                    l.status === "failed" ? "bg-danger-soft text-danger" : "",
                    l.status === "running" ? "bg-warning-soft text-warning" : "",
                    l.status === "waiting" ? "bg-secondary text-muted-foreground" : "",
                  ].join(" ")}
                >
                  {l.status === "running" ? "working" : l.status}
                </span>
                <span className="flex-1">
                  {l.label}
                  {l.note && <span className="block text-xs text-muted-foreground">{l.note}</span>}
                </span>
              </li>
            ))}
          </ul>
          {!building && (
            <div className="flex flex-wrap items-center gap-2">
              {published ? (
                <p className="text-sm text-success">Published. Learners can now pick it in the exam switcher.</p>
              ) : (
                <button className={primary} onClick={doPublish}>Publish exam</button>
              )}
              <button className={btn} onClick={reset}>Create another</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
