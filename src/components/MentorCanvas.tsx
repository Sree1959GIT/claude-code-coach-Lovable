import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Mic, MicOff, PlayCircle, Radio, Square, User, Volume2, X } from "lucide-react";
import { synthesizeSpeech } from "@/lib/mentor.functions";
import { supabase } from "@/integrations/supabase/client";
import { logEvent } from "@/lib/analytics";
import { matchResources, thumbnailFor, type LearnResource } from "@/lib/resources";
import { VideoModal } from "@/components/VideoModal";

type Msg = { role: "user" | "assistant"; content: string };

export type HighlightTarget =
  | { type: "stem" }
  | { type: "scenario" }
  | { type: "option"; label: string }
  | null;

type QuestionContext = {
  scenario: string | null;
  stem: string;
  key_concept: string | null;
  options: { label: string; text: string }[];
  domain?: string;
  selectedOption?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  context: QuestionContext;
  onHighlight?: (t: HighlightTarget) => void;
};

type Segment = { text: string; target: HighlightTarget };

type Citation = { n: number; title: string; url: string | null; source: string; similarity?: number };

/** Numbers of the library sources actually cited in a response body. */
function citedNumbers(content: string): number[] {
  const found = new Set<number>();
  for (const m of content.matchAll(/\[(\d{1,2})\]/g)) found.add(Number(m[1]));
  return [...found].sort((a, b) => a - b);
}

/** Renders assistant text with inline [n] markers turned into source links. */
function CitedText({ content, citations }: { content: string; citations: Citation[] }) {
  const parts = content.split(/(\[\d{1,2}\])/g);
  return (
    <>
      {parts.map((part, idx) => {
        const m = /^\[(\d{1,2})\]$/.exec(part);
        const cite = m ? citations.find((c) => c.n === Number(m[1])) : undefined;
        if (!cite) return <span key={idx}>{part}</span>;
        const inner = (
          <span className="font-mono text-[10px] align-super text-primary">[{cite.n}]</span>
        );
        return cite.url ? (
          <a
            key={idx}
            href={cite.url}
            target="_blank"
            rel="noopener noreferrer"
            title={cite.title}
            className="hover:opacity-80"
          >
            {inner}
          </a>
        ) : (
          <span key={idx} title={cite.title}>
            {inner}
          </span>
        );
      })}
    </>
  );
}

const MARKER_RE = /\[\[(scenario|stem|none|brief|opt:[A-Za-z0-9]+)\]\]/;

function parseMarker(token: string): HighlightTarget {
  if (token === "scenario") return { type: "scenario" };
  if (token === "stem") return { type: "stem" };
  if (token.startsWith("opt:")) return { type: "option", label: token.slice(4).toUpperCase() };
  return null;
}

/**
 * Splits streamed mentor text into the written answer (displayed) and the
 * short spoken summary that follows the [[brief]] marker (spoken only).
 */
class SegmentParser {
  private raw = "";
  private pending = "";
  private target: HighlightTarget = null;
  private speaking = false;
  display = "";

  constructor(private emit: (s: Segment) => void) {}

  push(chunk: string) {
    this.raw += chunk;
    // Hold back a possible partial marker at the tail.
    let safeEnd = this.raw.length;
    const open = this.raw.lastIndexOf("[[");
    if (open !== -1 && this.raw.indexOf("]]", open) === -1) safeEnd = open;

    let work = this.raw.slice(0, safeEnd);
    this.raw = this.raw.slice(safeEnd);

    while (work.length) {
      const m = MARKER_RE.exec(work);
      if (!m) {
        this.consume(work);
        break;
      }
      this.consume(work.slice(0, m.index));
      this.flush();
      if (m[1] === "brief") {
        this.speaking = true;
        this.target = null;
      } else {
        this.target = parseMarker(m[1]!);
      }
      work = work.slice(m.index + m[0].length);
    }
    this.drainSentences();
  }

  private consume(text: string) {
    if (!text) return;
    if (this.speaking) this.pending += text;
    else this.display += text;
  }

  private drainSentences() {
    if (!this.speaking) return;
    // Emit whole sentences as soon as they're complete so speech starts early.
    const re = /[^.!?]*[.!?]+["')\]]*\s*/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.pending))) {
      const sentence = m[0].trim();
      if (sentence.length > 1) this.emit({ text: sentence, target: this.target });
      last = re.lastIndex;
    }
    if (last) this.pending = this.pending.slice(last);
  }

  private flush() {
    if (!this.speaking) return;
    const rest = this.pending.trim();
    if (rest.length > 1) this.emit({ text: rest, target: this.target });
    this.pending = "";
  }

  end() {
    if (this.raw) this.consume(this.raw);
    this.raw = "";
    this.drainSentences();
    this.flush();
  }
}


// Minimal Web Speech typings — kept local to avoid global lib bloat.
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  resultIndex?: number;
  onresult:
    | ((e: {
        resultIndex?: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
      }) => void)
    | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function MentorCanvas({ open, onClose, context, onHighlight }: Props) {
  const speak = useServerFn(synthesizeSpeech);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<LearnResource | null>(null);
  const [openRefs, setOpenRefs] = useState<number | null>(null);
  const [citations, setCitations] = useState<
    Record<number, { n: number; title: string; url: string | null; source: string }[]>
  >({});



  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef(false);
  const voiceRef = useRef(true);
  const busyRef = useRef(false);
  const messagesRef = useRef<Msg[]>([]);
  const queueRef = useRef<Segment[]>([]);
  const drainingRef = useRef(false);
  const stoppedRef = useRef(false);
  const contextRef = useRef(context);

  const sttSupported = typeof window !== "undefined" && !!getSpeechRecognition();
  const highlight = useCallback((t: HighlightTarget) => onHighlight?.(t), [onHighlight]);

  const resources = useMemo(
    () => matchResources([context.key_concept, context.domain, context.stem]),
    [context.key_concept, context.domain, context.stem],
  );

  useEffect(() => {
    liveRef.current = live;
  }, [live]);
  useEffect(() => {
    voiceRef.current = voiceOn;
  }, [voiceOn]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming, busy]);

  const stopAll = useCallback(() => {
    stoppedRef.current = true;
    queueRef.current = [];
    audioRef.current?.pause();
    try {
      recogRef.current?.abort();
    } catch {
      /* noop */
    }
    setListening(false);
    setStatus(null);
    highlight(null);
  }, [highlight]);

  useEffect(() => {
    if (open) {
      logEvent("mentor_opened", { key_concept: context.key_concept });
      setError(null);
    } else {
      setLive(false);
      liveRef.current = false;
      stopAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ---- speech synthesis queue -------------------------------------------
  async function synth(text: string): Promise<string | null> {
    try {
      const { audio, mimeType } = await speak({ data: { text, voice: "alloy" } });
      const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
      return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    } catch (e) {
      console.error("[mentor] tts failed", e);
      return null;
    }
  }

  function playUrl(url: string): Promise<void> {
    return new Promise((resolve) => {
      const el = audioRef.current;
      if (!el) return resolve();
      el.onended = () => resolve();
      el.onerror = () => resolve();
      el.src = url;
      void el.play().catch(() => resolve());
    });
  }

  const drain = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    let next: Promise<string | null> | null = null;
    try {
      while (!stoppedRef.current) {
        const seg = queueRef.current.shift();
        if (!seg) {
          // wait a beat in case the stream is still producing
          if (busyRef.current) {
            await sleep(120);
            continue;
          }
          break;
        }
        highlight(seg.target);
        if (!voiceRef.current) {
          await sleep(Math.min(5000, 400 + seg.text.length * 38));
          continue;
        }
        const url = next ? await next : await synth(seg.text);
        next = queueRef.current[0] ? synth(queueRef.current[0].text) : null;
        if (stoppedRef.current) break;
        if (url) {
          await playUrl(url);
          URL.revokeObjectURL(url);
        }
      }
    } finally {
      drainingRef.current = false;
      highlight(null);
      setStatus(null);
      if (!stoppedRef.current && liveRef.current) startRecognition(true);
    }
  }, [highlight]);

  /** Speaks a full written answer on demand (Read_Response button). */
  function readAloud(text: string) {
    const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
    stoppedRef.current = false;
    queueRef.current = sentences
      .map((s) => s.trim())
      .filter((s) => s.length > 1)
      .map((s) => ({ text: s, target: null }));
    voiceRef.current = true;
    setVoiceOn(true);
    void drain();
  }

  // ---- chat -------------------------------------------------------------

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busyRef.current) return;
    stoppedRef.current = false;
    setError(null);
    const next: Msg[] = [...messagesRef.current, { role: "user", content: trimmed }];
    setMessages(next);
    messagesRef.current = next;
    setInput("");
    setBusy(true);
    busyRef.current = true;
    setStreaming("");
    setStatus("Mentor_thinking");
    // Mic off while the mentor talks so it doesn't hear itself.
    try {
      recogRef.current?.abort();
    } catch {
      /* noop */
    }
    setListening(false);

    const parser = new SegmentParser((seg) => {
      queueRef.current.push(seg);
      void drain();
    });

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Session expired — sign in again.");

      const res = await fetch("/api/mentor-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: next, context: contextRef.current }),
      });
      if (!res.ok || !res.body) {
        throw new Error((await res.text().catch(() => "")) || `Mentor failed (${res.status})`);
      }
      setStatus("Mentor_speaking");

      // Library citations arrive in a response header (see /api/mentor-stream).
      const assistantIndex = next.length;
      try {
        const raw = res.headers.get("X-Mentor-Citations");
        if (raw) {
          const parsed = JSON.parse(decodeURIComponent(raw)) as {
            n: number;
            title: string;
            url: string | null;
            source: string;
          }[];
          if (parsed.length) setCitations((c) => ({ ...c, [assistantIndex]: parsed }));
        }
      } catch {
        /* ignore malformed citation header */
      }


      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload) as {
              choices?: { delta?: { content?: string } }[];
            };
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              parser.push(delta);
              setStreaming(parser.display);
            }
          } catch {
            /* partial json — ignore */
          }
        }
      }
      parser.end();
      const full = parser.display.trim();
      setStreaming("");
      if (full) {
        setMessages((m) => {
          const updated: Msg[] = [...m, { role: "assistant", content: full }];
          messagesRef.current = updated;
          return updated;
        });
        logEvent("mentor_reply", { chars: full.length });
      }
    } catch (e) {
      setStreaming("");
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
      busyRef.current = false;
      if (!drainingRef.current) {
        setStatus(null);
        if (!stoppedRef.current && liveRef.current) startRecognition(true);
      }
    }
  }

  // ---- speech recognition ------------------------------------------------
  function startRecognition(continuous: boolean) {
    const Ctor = getSpeechRecognition();
    if (!Ctor || busyRef.current || drainingRef.current) return;
    try {
      recogRef.current?.abort();
    } catch {
      /* noop */
    }
    const recog = new Ctor();
    recog.lang = "en-US";
    recog.interimResults = false;
    recog.continuous = continuous;
    recog.onstart = () => setListening(true);
    recog.onresult = (e) => {
      const from = typeof e.resultIndex === "number" ? e.resultIndex : 0;
      let transcript = "";
      for (let i = from; i < e.results.length; i++) {
        transcript += e.results[i]?.[0]?.transcript ?? "";
      }
      transcript = transcript.trim();
      if (!transcript) return;
      try {
        recog.stop();
      } catch {
        /* noop */
      }
      void send(transcript);
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => {
      setListening(false);
      if (liveRef.current && !busyRef.current && !drainingRef.current && !stoppedRef.current) {
        setTimeout(() => {
          if (liveRef.current && !busyRef.current && !drainingRef.current) startRecognition(true);
        }, 500);
      }
    };
    recogRef.current = recog;
    try {
      recog.start();
    } catch {
      setListening(false);
    }
  }

  function toggleListen() {
    if (listening) {
      try {
        recogRef.current?.stop();
      } catch {
        /* noop */
      }
      setListening(false);
      return;
    }
    stoppedRef.current = false;
    startRecognition(false);
  }

  function toggleLive() {
    const nextLive = !live;
    setLive(nextLive);
    liveRef.current = nextLive;
    if (nextLive) {
      stoppedRef.current = false;
      startRecognition(true);
    } else {
      try {
        recogRef.current?.abort();
      } catch {
        /* noop */
      }
      setListening(false);
    }
  }

  const quickPrompts = useMemo(() => {
    const base = [
      { label: "Explain_Question", text: "Explain the question in simple words." },
      {
        label: "Read_Fast",
        text: "How do I read this question and its options quickly? Give me a reading strategy for this exact item.",
      },
      {
        label: "Trap_Spotting",
        text: "What are the distractor traps in these options and what keyword in the stem rules them out?",
      },
    ];
    if (context.selectedOption) {
      base.unshift({
        label: `Rate_Option_${context.selectedOption}`,
        text: `I picked option ${context.selectedOption}. How apt is that option for this question — what does it get right, what does it miss, and which words in the stem decide it?`,
      });
    }
    return base;
  }, [context.selectedOption]);

  if (!open) return null;

  return (
    <aside className="flex h-full min-w-0 flex-col border-l border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.3em] text-primary">
            <User className="h-3.5 w-3.5" /> SME_Mentor
          </div>
          <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {context.key_concept ?? "General"} · Talk it through
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close mentor"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
        {quickPrompts.map((p) => (
          <button
            key={p.label}
            onClick={() => void send(p.text)}
            disabled={busy}
            className="border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-40"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !streaming && (
          <div className="border border-dashed border-border p-3 text-sm leading-relaxed text-muted-foreground">
            Pick a quick prompt, type, or go live with your mic. I'll walk you through how to read
            the stem and separate the true option from the false positives — and highlight what I'm
            talking about as I speak.
          </div>
        )}
        {messages.map((m, i) => {
          const isUser = m.role === "user";
          const refs = isUser
            ? []
            : matchResources([context.key_concept, context.domain, context.stem, m.content]);
          const expanded = openRefs === i;
          const msgCitations = isUser ? [] : (citations[i] ?? []);
          const cited = citedNumbers(m.content);
          const shownCitations = cited.length
            ? msgCitations.filter((c) => cited.includes(c.n))
            : msgCitations;
          return (
            <div
              key={i}
              className={`border p-3 text-sm leading-relaxed ${
                isUser ? "border-border bg-secondary/40" : "border-primary/30 bg-primary/5"
              }`}
            >
              <div
                className={`mb-1 font-mono text-[9px] uppercase tracking-[0.3em] ${
                  isUser ? "text-muted-foreground" : "text-primary"
                }`}
              >
                {isUser ? "You" : "Mentor"}
              </div>
              <div className="whitespace-pre-wrap">
                {isUser ? (
                  m.content
                ) : (
                  <CitedText content={m.content} citations={msgCitations} />
                )}
              </div>
              {!isUser && (
                <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-primary/20 pt-2">
                  <button
                    onClick={() => readAloud(m.content)}
                    className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary"
                  >
                    <Volume2 className="h-3 w-3" /> Read_Response
                  </button>
                  {refs.length > 0 && (
                    <button
                      onClick={() => setOpenRefs(expanded ? null : i)}
                      className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-primary underline underline-offset-4 hover:opacity-80"
                      aria-expanded={expanded}
                    >
                      <ChevronDown
                        className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
                      />
                      References ({refs.length})
                    </button>
                  )}
                </div>
              )}
              {!isUser && expanded && (
                <ul className="mt-2 space-y-1.5">
                  {refs.map((r) => (
                    <li key={r.title}>
                      <button
                        onClick={() => {
                          logEvent("resource_opened", { title: r.title, video: !!r.videoId });
                          if (r.videoId) setVideo(r);
                          else if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
                        }}
                        className="flex w-full items-center gap-2 border border-border p-1.5 text-left hover:border-primary"
                      >
                        {thumbnailFor(r) ? (
                          <img
                            src={thumbnailFor(r)!}
                            alt={`${r.title} thumbnail`}
                            loading="lazy"
                            className="h-8 w-14 shrink-0 object-cover"
                          />
                        ) : (
                          <span className="flex h-8 w-14 shrink-0 items-center justify-center bg-secondary/50 font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
                            Doc
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-medium">{r.title}</span>
                          <span className="block font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
                            {r.source}
                            {r.start
                              ? ` · @${Math.floor(r.start / 60)}:${String(r.start % 60).padStart(2, "0")}`
                              : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!isUser && shownCitations.length > 0 && (
                <div className="mt-2 border-t border-primary/20 pt-2">
                  <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                    Library_sources
                  </div>
                  <ol className="space-y-1">
                    {shownCitations.map((c) => (
                      <li key={c.n} className="text-[11px] leading-snug">
                        <span className="font-mono text-primary">[{c.n}]</span>{" "}
                        {c.url ? (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-2 hover:text-primary"
                          >
                            {c.title}
                          </a>
                        ) : (
                          <span>{c.title}</span>
                        )}{" "}
                        <span className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
                          {c.source}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

          );
        })}

        {streaming && (
          <div className="border border-primary/30 bg-primary/5 p-3 text-sm leading-relaxed">
            <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.3em] text-primary">
              Mentor
            </div>
            <div className="whitespace-pre-wrap">
              {streaming}
              <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-primary align-middle" />
            </div>
          </div>
        )}
        {status && !streaming && (
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {status}…
          </div>
        )}
        {error && (
          <div className="border border-destructive/50 bg-destructive/10 p-3 font-mono text-[10px] uppercase tracking-widest text-destructive">
            {error}
          </div>
        )}

        {messages.length === 0 && (
        <div className="border-t border-border pt-3">

          <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
            Watch_This
          </div>
          <div className="grid grid-cols-2 gap-2">
            {resources.map((r) => {
              const thumb = thumbnailFor(r);
              return (
                <button
                  key={r.title}
                  onClick={() => {
                    logEvent("resource_opened", { title: r.title, video: !!r.videoId });
                    if (r.videoId) setVideo(r);
                    else if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
                  }}
                  className="group border border-border text-left hover:border-primary"
                >
                  <div className="relative flex aspect-video items-center justify-center bg-secondary/50">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={`${r.title} thumbnail`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="px-2 text-center font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                        Doc
                      </span>
                    )}
                    {r.videoId && (
                      <PlayCircle className="absolute h-8 w-8 text-primary-foreground/90 drop-shadow" />
                    )}
                  </div>
                  <div className="p-1.5">
                    <div className="line-clamp-2 text-[11px] font-medium leading-tight group-hover:text-primary">
                      {r.title}
                    </div>
                    <div className="mt-0.5 font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
                      {r.source}
                      {r.start ? ` · @${Math.floor(r.start / 60)}:${String(r.start % 60).padStart(2, "0")}` : ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          </div>
        )}

      </div>

      <footer className="border-t border-border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <input
              type="checkbox"
              checked={voiceOn}
              onChange={(e) => setVoiceOn(e.target.checked)}
              className="accent-primary"
            />
            Voice_reply
          </label>
          <div className="flex items-center gap-1.5">
            <button
              onClick={stopAll}
              className="flex items-center gap-1 border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              <Square className="h-3 w-3" /> Stop
            </button>
            {sttSupported ? (
              <button
                onClick={toggleLive}
                className={`flex items-center gap-1.5 border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest ${
                  live
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                aria-pressed={live}
              >
                <Radio className="h-3 w-3" /> {live ? (listening ? "Listening" : "Live_On") : "Live_Talk"}
              </button>
            ) : (
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                Mic_unsupported
              </span>
            )}
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            placeholder="Ask about this question…"
            className="flex-1 resize-none border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            disabled={busy}
          />
          {sttSupported && (
            <button
              type="button"
              onClick={toggleListen}
              className={`border p-2 ${
                listening
                  ? "border-destructive bg-destructive/20 text-destructive"
                  : "border-border bg-background hover:bg-secondary"
              }`}
              aria-pressed={listening}
              aria-label="Toggle microphone"
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="bg-primary px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
          >
            Send
          </button>
        </form>
        <audio ref={audioRef} className="hidden" />
      </footer>

      <VideoModal resource={video} onClose={() => setVideo(null)} />
    </aside>
  );
}
