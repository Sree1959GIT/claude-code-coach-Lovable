import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mic, MicOff, Radio, User, X } from "lucide-react";
import { askMentor, synthesizeSpeech } from "@/lib/mentor.functions";
import { logEvent } from "@/lib/analytics";

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
};

type Props = {
  open: boolean;
  onClose: () => void;
  context: QuestionContext;
  onHighlight?: (t: HighlightTarget) => void;
};

const QUICK_PROMPTS = [
  { label: "Explain_Question", text: "Explain the question in simple words." },
  {
    label: "Read_Fast",
    text: "How do I understand this question and its answer options quickly? Give me a reading strategy for this exact item.",
  },
  {
    label: "Why_Correct",
    text: "Explain which option is most apt and why, and why each of the other options is a false positive here.",
  },
  {
    label: "Trap_Spotting",
    text: "What are the distractor traps in these options and what keyword in the stem rules them out?",
  },
];

// Minimal Web Speech typings — kept local to avoid global lib bloat.
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Work out, in order of mention, what parts of the question the reply talks about. */
function extractTargets(reply: string, options: { label: string; text: string }[]): HighlightTarget[] {
  const hits: { at: number; target: HighlightTarget }[] = [];
  for (const o of options) {
    const re = new RegExp(`\\boption\\s+${o.label}\\b|\\b${o.label}\\)|\\b${o.label}\\.`, "i");
    const m = re.exec(reply);
    if (m) hits.push({ at: m.index, target: { type: "option", label: o.label } });
  }
  const stemRe = /\b(question|stem|asks|asking|scenario)\b/i;
  const sm = stemRe.exec(reply);
  if (sm) {
    hits.push({
      at: sm.index,
      target: { type: /scenario/i.test(sm[0]) ? "scenario" : "stem" },
    });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.target);
}

export function MentorCanvas({ open, onClose, context, onHighlight }: Props) {
  const ask = useServerFn(askMentor);
  const speak = useServerFn(synthesizeSpeech);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef(false);
  const targetsRef = useRef<HighlightTarget[]>([]);
  const sttSupported = typeof window !== "undefined" && !!getSpeechRecognition();

  const highlight = useCallback((t: HighlightTarget) => onHighlight?.(t), [onHighlight]);

  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  useEffect(() => {
    if (open) {
      logEvent("mentor_opened", { key_concept: context.key_concept });
      setError(null);
    } else {
      audioRef.current?.pause();
      recogRef.current?.stop();
      setListening(false);
      setLive(false);
      highlight(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function playAudio(text: string) {
    if (!voiceOn) {
      // still walk the highlights on a timer so the learner sees the focus
      const targets = targetsRef.current;
      targets.forEach((t, i) => setTimeout(() => highlight(t), i * 2500));
      setTimeout(() => highlight(null), targets.length * 2500 + 2000);
      return;
    }
    try {
      const { audio, mimeType } = await speak({ data: { text, voice: "alloy" } });
      const blob = new Blob([Uint8Array.from(atob(audio), (c) => c.charCodeAt(0))], {
        type: mimeType,
      });
      const url = URL.createObjectURL(blob);
      const el = audioRef.current;
      if (!el) return;
      el.pause();
      el.src = url;
      el.ontimeupdate = () => {
        const targets = targetsRef.current;
        if (!targets.length || !el.duration || Number.isNaN(el.duration)) return;
        const i = Math.min(targets.length - 1, Math.floor((el.currentTime / el.duration) * targets.length));
        highlight(targets[i]);
      };
      el.onended = () => highlight(null);
      await el.play().catch(() => {});
    } catch (e) {
      console.error(e);
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const { text: reply } = await ask({ data: { messages: next, context } });
      const assistantMsg: Msg = { role: "assistant", content: reply || "…" };
      setMessages((m) => [...m, assistantMsg]);
      targetsRef.current = extractTargets(reply, context.options);
      logEvent("mentor_reply", { chars: reply.length });
      void playAudio(reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
      if (liveRef.current) startRecognition(true);
    }
  }

  function startRecognition(continuous: boolean) {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    recogRef.current?.stop();
    const recog = new Ctor();
    recog.lang = "en-US";
    recog.interimResults = false;
    recog.continuous = continuous;
    recog.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) void send(transcript);
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => {
      setListening(false);
      if (liveRef.current) {
        // auto-restart for continuous conversation
        setTimeout(() => {
          if (liveRef.current) startRecognition(true);
        }, 400);
      }
    };
    recogRef.current = recog;
    setListening(true);
    try {
      recog.start();
    } catch {
      setListening(false);
    }
  }

  function toggleListen() {
    if (listening) {
      recogRef.current?.stop();
      setListening(false);
      return;
    }
    startRecognition(false);
  }

  function toggleLive() {
    const nextLive = !live;
    setLive(nextLive);
    liveRef.current = nextLive;
    if (nextLive) startRecognition(true);
    else {
      recogRef.current?.stop();
      setListening(false);
    }
  }

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
        {QUICK_PROMPTS.map((p) => (
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
        {messages.length === 0 && (
          <div className="border border-dashed border-border p-3 text-sm leading-relaxed text-muted-foreground">
            Pick a quick prompt above, type, or go live with your mic. I'll walk you through how to
            read the stem and separate the true option from the false positives.
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`border p-3 text-sm leading-relaxed ${
              m.role === "user" ? "border-border bg-secondary/40" : "border-primary/30 bg-primary/5"
            }`}
          >
            <div
              className={`mb-1 font-mono text-[9px] uppercase tracking-[0.3em] ${
                m.role === "user" ? "text-muted-foreground" : "text-primary"
              }`}
            >
              {m.role === "user" ? "You" : "Mentor"}
            </div>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
        {busy && (
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Mentor_thinking…
          </div>
        )}
        {error && (
          <div className="border border-destructive/50 bg-destructive/10 p-3 font-mono text-[10px] uppercase tracking-widest text-destructive">
            {error}
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
              <Radio className="h-3 w-3" /> {live ? "Live_On" : "Live_Talk"}
            </button>
          ) : (
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              Mic_unsupported
            </span>
          )}
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
    </aside>
  );
}
