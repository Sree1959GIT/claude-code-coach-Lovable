import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { useSession } from "@/hooks/useSession";
import {
  fetchDomainBySlug,
  fetchDomainQuestions,
  recordAttempt,
  type QuestionOption,
} from "@/lib/study";
import { logEvent } from "@/lib/analytics";

export const Route = createFileRoute("/_authenticated/study/$slug")({
  component: DomainRunner,
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} · Study · Claude Architect Prep` },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function DomainRunner() {
  const { slug } = Route.useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const domainQ = useQuery({
    queryKey: ["domain", slug],
    queryFn: () => fetchDomainBySlug(slug),
  });
  const questionsQ = useQuery({
    queryKey: ["questions", domainQ.data?.id],
    queryFn: () => fetchDomainQuestions(domainQ.data!.id),
    enabled: !!domainQ.data?.id,
  });

  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<QuestionOption | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [score, setScore] = useState({ correct: 0, total: 0 });

  useEffect(() => { logEvent("page_view", { page: "study_run", slug }); }, [slug]);

  const questions = questionsQ.data ?? [];
  const q = questions[idx];

  useEffect(() => {
    setSelected(null);
    setRevealed(false);
    setStartedAt(Date.now());
  }, [q?.id]);

  const finished = questions.length > 0 && idx >= questions.length;

  async function handleSubmit() {
    if (!q || !selected || !user) return;
    const timeMs = Date.now() - startedAt;
    setRevealed(true);
    setScore((s) => ({
      correct: s.correct + (selected.is_correct ? 1 : 0),
      total: s.total + 1,
    }));
    try {
      await recordAttempt({
        userId: user.id,
        questionId: q.id,
        selectedOptionId: selected.id,
        isCorrect: selected.is_correct,
        timeMs,
      });
      logEvent("question_answered", {
        slug,
        question_id: q.id,
        correct: selected.is_correct,
        time_ms: timeMs,
      });
      qc.invalidateQueries({ queryKey: ["my_progress"] });
      qc.invalidateQueries({ queryKey: ["my_attempts"] });
    } catch (err) {
      console.error(err);
    }
  }

  const optionsSorted = useMemo(
    () => (q ? [...q.options].sort((a, b) => a.sort_order - b.sort_order) : []),
    [q],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto flex max-w-7xl gap-8 px-6 py-12 lg:flex-row">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-24">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Course_Viewer
            </div>
            <nav className="space-y-1">
              {questions.map((qq, i) => (
                <button
                  key={qq.id}
                  onClick={() => setIdx(i)}
                  className={`block w-full border-l-2 px-3 py-1.5 text-left font-mono text-[10px] uppercase tracking-widest transition-colors ${
                    i === idx
                      ? "border-primary bg-secondary text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  Q{String(i + 1).padStart(2, "0")} · {qq.difficulty}
                </button>
              ))}
            </nav>
            <div className="mt-6 border-t border-border pt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Score: {score.correct}/{score.total}
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="mb-6 flex items-center justify-between">
            <Link
              to="/study"
              className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              ← Study_Hub
            </Link>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {domainQ.data?.title} · Q{Math.min(idx + 1, questions.length)}/{questions.length}
            </div>
          </div>

          {questionsQ.isLoading && (
            <div className="font-mono text-xs text-muted-foreground">Loading questions…</div>
          )}

          {finished && (
            <div className="border border-border bg-card p-8 text-center">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
                {"> Set_Complete"}
              </div>
              <h1 className="mb-6 font-mono text-3xl font-bold uppercase">
                {score.correct} / {score.total}
              </h1>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => {
                    setIdx(0);
                    setScore({ correct: 0, total: 0 });
                  }}
                  className="border border-border bg-background px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
                >
                  Retry_Set
                </button>
                <button
                  onClick={() => navigate({ to: "/analytics" })}
                  className="bg-primary px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground"
                >
                  View_Analytics
                </button>
              </div>
            </div>
          )}

          {q && !finished && (
            <article className="border border-border bg-card">
              {q.scenario && (
                <section className="border-b border-border bg-secondary/30 p-6">
                  <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                    Scenario
                  </div>
                  <p className="text-sm leading-relaxed">{q.scenario}</p>
                </section>
              )}
              <section className="border-b border-border p-6">
                <div className="mb-3 flex items-center gap-3">
                  <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-primary">
                    Stem
                  </div>
                  {q.key_concept && (
                    <div className="border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      {q.key_concept}
                    </div>
                  )}
                  <div className="ml-auto font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    {q.difficulty}
                  </div>
                </div>
                <h1 className="text-lg font-semibold leading-snug">{q.stem}</h1>
              </section>
              <section className="p-6">
                <div className="mb-3 font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                  Options
                </div>
                <ul className="space-y-2">
                  {optionsSorted.map((opt) => {
                    const isSelected = selected?.id === opt.id;
                    const showCorrect = revealed && opt.is_correct;
                    const showWrong = revealed && isSelected && !opt.is_correct;
                    return (
                      <li key={opt.id}>
                        <button
                          disabled={revealed}
                          onClick={() => setSelected(opt)}
                          className={`flex w-full items-start gap-4 border p-4 text-left transition-colors ${
                            showCorrect
                              ? "border-primary bg-primary/10"
                              : showWrong
                                ? "border-destructive bg-destructive/10"
                                : isSelected
                                  ? "border-primary bg-secondary"
                                  : "border-border hover:bg-secondary"
                          }`}
                        >
                          <span className="font-mono text-xs font-bold text-primary">
                            {opt.label}
                          </span>
                          <span className="flex-1 text-sm">{opt.text}</span>
                        </button>
                        {revealed && (opt.is_correct || isSelected) && opt.explanation && (
                          <div className="mt-1 border-l-2 border-primary/40 bg-secondary/30 px-4 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                            {opt.explanation}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-6 flex items-center justify-between">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Score: {score.correct}/{score.total}
                  </div>
                  {!revealed ? (
                    <button
                      onClick={handleSubmit}
                      disabled={!selected}
                      className="bg-primary px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
                    >
                      Submit_Answer
                    </button>
                  ) : (
                    <button
                      onClick={() => setIdx((i) => i + 1)}
                      className="bg-primary px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground"
                    >
                      {idx + 1 >= questions.length ? "Finish_Set" : "Next_Question →"}
                    </button>
                  )}
                </div>
              </section>
            </article>
          )}
        </main>
      </div>
    </div>
  );
}
