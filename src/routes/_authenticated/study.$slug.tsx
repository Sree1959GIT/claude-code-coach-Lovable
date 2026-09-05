import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Code2, PanelLeftClose, PanelLeftOpen, UserRound } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { MentorCanvas, type HighlightTarget } from "@/components/MentorCanvas";
import { FloatingWindow, type WindowRect } from "@/components/FloatingWindow";
import {
  StudyCanvasTabs,
  SAMPLE_CANVAS_FILES,
  type CanvasFile,
  type CanvasLanguage,
} from "@/components/StudyCanvasTabs";
import { useSession } from "@/hooks/useSession";
import {
  fetchDomainBySlug,
  fetchDomainQuestions,
  recordAttempt,
  type QuestionOption,
} from "@/lib/study";
import { fetchCodebaseByConcept, toConceptTag } from "@/lib/codebases";
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

const MIN_MENTOR_W = 300;
const MAX_MENTOR_W = 720;

// D2 — persist floating window geometry for the lifetime of the browser tab.
const CANVAS_RECT_KEY = "study_canvas_rect";
const DEFAULT_CANVAS_RECT: WindowRect = { x: 120, y: 140, width: 600, height: 420 };

function loadCanvasRect(): WindowRect {
  if (typeof window === "undefined") return DEFAULT_CANVAS_RECT;
  try {
    const raw = sessionStorage.getItem(CANVAS_RECT_KEY);
    if (!raw) return DEFAULT_CANVAS_RECT;
    const p = JSON.parse(raw) as Partial<WindowRect>;
    if (
      typeof p.x === "number" && typeof p.y === "number" &&
      typeof p.width === "number" && typeof p.height === "number" &&
      p.width > 0 && p.height > 0
    ) {
      return { x: p.x, y: p.y, width: p.width, height: p.height };
    }
  } catch {
    // ignore malformed state
  }
  return DEFAULT_CANVAS_RECT;
}

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
  const [mentorOpen, setMentorOpen] = useState(false);
  const [mentorWidth, setMentorWidth] = useState(400);
  const [navOpen, setNavOpen] = useState(true);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasRect, setCanvasRect] = useState<WindowRect>(loadCanvasRect);
  const [focus, setFocus] = useState<HighlightTarget>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    logEvent("page_view", { page: "study_run", slug });
  }, [slug]);

  const questions = questionsQ.data ?? [];
  const q = questions[idx];

  // Phase E2 — instant cached example lookup by concept tag. Cached for the
  // session so revisiting a concept costs nothing; never generates anything.
  const conceptTag = toConceptTag(q?.key_concept);
  const codebaseQ = useQuery({
    queryKey: ["codebase", conceptTag],
    queryFn: () => fetchCodebaseByConcept(conceptTag!),
    enabled: !!conceptTag,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
  });

  const canvasFiles = useMemo<CanvasFile[]>(() => {
    const files = codebaseQ.data?.files ?? [];
    const mapped = files
      .filter((f) => f.language === "python" || f.language === "javascript")
      .map((f) => ({
        name: f.name,
        language: f.language as CanvasLanguage,
        content: f.content,
      }));
    return mapped.length > 0 ? mapped : SAMPLE_CANVAS_FILES;
  }, [codebaseQ.data]);

  const canvasSubtitle = codebaseQ.data
    ? `Cached · ${codebaseQ.data.title}`
    : conceptTag && codebaseQ.isLoading
      ? "Loading_Example"
      : "Code_Workspace";

  useEffect(() => {
    setSelected(null);
    setRevealed(false);
    setStartedAt(Date.now());
    setFocus(null);
  }, [q?.id]);

  // Drag-to-resize the mentor frame
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const w = window.innerWidth - e.clientX;
      setMentorWidth(Math.min(MAX_MENTOR_W, Math.max(MIN_MENTOR_W, w)));
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

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

  const mentorContext = useMemo(
    () => ({
      scenario: q?.scenario ?? null,
      stem: q?.stem ?? "",
      key_concept: q?.key_concept ?? null,
      options: optionsSorted.map((o) => ({ label: o.label, text: o.text })),
      domain: domainQ.data?.title,
      selectedOption: selected?.label ?? null,
    }),
    [q?.scenario, q?.stem, q?.key_concept, optionsSorted, domainQ.data?.title, selected?.label],
  );

  const onHighlight = useCallback((t: HighlightTarget) => setFocus(t), []);

  const focusStem = focus?.type === "stem";
  const focusScenario = focus?.type === "scenario";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <SiteHeader />

      <div className="flex min-h-0 flex-1">
        {/* Frame 1 — collapsible question navigator */}
        <aside
          className={`hidden shrink-0 flex-col border-r border-border bg-card/40 transition-all lg:flex ${
            navOpen ? "w-52" : "w-12"
          }`}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            {navOpen && (
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                Course_Viewer
              </span>
            )}
            <button
              onClick={() => setNavOpen((v) => !v)}
              aria-label={navOpen ? "Collapse navigator" : "Expand navigator"}
              className="text-muted-foreground hover:text-foreground"
            >
              {navOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </button>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto p-1">
            {questions.map((qq, i) => (
              <button
                key={qq.id}
                onClick={() => setIdx(i)}
                title={`Q${i + 1} · ${qq.difficulty}`}
                className={`block w-full border-l-2 px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-widest transition-colors ${
                  i === idx
                    ? "border-primary bg-secondary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {navOpen ? `Q${String(i + 1).padStart(2, "0")} · ${qq.difficulty}` : i + 1}
              </button>
            ))}
          </nav>
          {navOpen && (
            <div className="border-t border-border px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Score: {score.correct}/{score.total}
            </div>
          )}
        </aside>

        {/* Frame 2 — question */}
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setMentorOpen(true)}
              className="inline-flex items-center gap-2 border-2 border-primary bg-primary px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-primary-foreground shadow-sm hover:opacity-90"
            >
              <UserRound className="h-4 w-4" /> Ask_Mentor
            </button>
            <button
              onClick={() => setCanvasOpen(true)}
              className="inline-flex items-center gap-2 border-2 border-border px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-widest hover:border-primary"
            >
              <Code2 className="h-4 w-4" /> Study_Canvas
            </button>

            <Link
              to="/study"
              className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              ← Study_Hub
            </Link>
            <div className="ml-auto font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
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
            <article className="flex min-h-0 flex-1 flex-col border border-border bg-card">
              {q.scenario && (
                <section className="border-b border-border bg-secondary/30 px-5 py-3">
                  <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                    Scenario
                  </div>
                  <p className={`text-sm leading-relaxed ${focusScenario ? "mentor-focus" : ""}`}>
                    {q.scenario}
                  </p>
                </section>
              )}
              <section className="border-b border-border px-5 py-3">
                <div className="mb-2 flex flex-wrap items-center gap-3">
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
                <h1 className={`text-base font-semibold leading-snug ${focusStem ? "mentor-focus" : ""}`}>
                  {q.stem}
                </h1>
              </section>
              <section className="flex min-h-0 flex-1 flex-col px-5 py-3">
                <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                  Options
                </div>
                <ul className="space-y-1.5">
                  {optionsSorted.map((opt) => {
                    const isSelected = selected?.id === opt.id;
                    const showCorrect = revealed && opt.is_correct;
                    const showWrong = revealed && isSelected && !opt.is_correct;
                    const isFocused = focus?.type === "option" && focus.label === opt.label;
                    return (
                      <li key={opt.id}>
                        <button
                          disabled={revealed}
                          onClick={() => setSelected(opt)}
                          className={`flex w-full items-start gap-3 border px-3 py-2.5 text-left transition-colors ${
                            showCorrect
                              ? "border-success bg-success/10"
                              : showWrong
                                ? "border-destructive bg-destructive/10"
                                : isSelected
                                  ? "border-primary bg-secondary"
                                  : "border-border hover:bg-secondary"
                          } ${isFocused ? "mentor-focus" : ""}`}
                        >
                          <span
                            className={`font-mono text-xs font-bold ${
                              showCorrect ? "text-success" : "text-primary"
                            }`}
                          >
                            {opt.label}
                          </span>
                          <span
                            className={`flex-1 text-sm leading-relaxed ${
                              showCorrect ? "font-semibold text-success" : ""
                            }`}
                          >
                            {opt.text}
                          </span>
                        </button>
                        {revealed && (opt.is_correct || isSelected) && opt.explanation && (
                          <div className="mt-1 border-l-2 border-primary/40 bg-secondary/30 px-3 py-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                            {opt.explanation}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-4 flex items-center justify-between">
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

        {/* Frame 3 — mentor (resizable, non-blocking) */}
        {mentorOpen && q && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={() => {
                draggingRef.current = true;
                document.body.style.userSelect = "none";
              }}
              className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary"
            />
            <div style={{ width: mentorWidth }} className="shrink-0">
              <MentorCanvas
                open={mentorOpen}
                onClose={() => setMentorOpen(false)}
                context={mentorContext}
                onHighlight={onHighlight}
              />
            </div>
          </>
        )}
      </div>

      {/* Phase D1 — non-modal floating study canvas (coexists with the mentor drawer) */}
      <FloatingWindow
        open={canvasOpen}
        title="Study_Canvas"
        subtitle={canvasSubtitle}
        rect={canvasRect}
        onRectChange={(r) => {
          setCanvasRect(r);
          try {
            sessionStorage.setItem(CANVAS_RECT_KEY, JSON.stringify(r));
          } catch {
            // storage unavailable — geometry persists in memory only
          }
        }}
        onClose={() => setCanvasOpen(false)}
      >
        <StudyCanvasTabs key={conceptTag ?? "default"} files={canvasFiles} />
      </FloatingWindow>
    </div>

  );
}
