import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { askMentor, synthesizeSpeech } from "@/lib/mentor.functions";
import { logEvent } from "@/lib/analytics";

type Msg = { role: "user" | "assistant"; content: string };

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
};

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

export function MentorCanvas({ open, onClose, context }: Props) {
  const ask = useServerFn(askMentor);
  const speak = useServerFn(synthesizeSpeech);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sttSupported = typeof window !== "undefined" && !!getSpeechRecognition();

  useEffect(() => {
    if (open) {
      logEvent("mentor_opened", { key_concept: context.key_concept });
      setError(null);
    } else {
      // stop any playback when closing
      audioRef.current?.pause();
      recogRef.current?.stop();
      setListening(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function playAudio(text: string) {
    if (!voiceOn) return;
    try {
      const { audio, mimeType } = await speak({ data: { text, voice: "alloy" } });
      const blob = new Blob(
        [Uint8Array.from(atob(audio), (c) => c.charCodeAt(0))],
        { type: mimeType },
      );
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = url;
        await audioRef.current.play().catch(() => {});
      }
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
      const { text: reply } = await ask({
        data: {
          messages: next,
          context,
        },
      });
      const assistantMsg: Msg = { role: "assistant", content: reply || "…" };
      setMessages((m) => [...m, assistantMsg]);
      logEvent("mentor_reply", { chars: reply.length });
      void playAudio(reply);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  function toggleListen() {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    if (listening) {
      recogRef.current?.stop();
      setListening(false);
      return;
    }
    const recog = new Ctor();
    recog.lang = "en-US";
    recog.interimResults = false;
    recog.continuous = false;
    recog.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) void send(transcript);
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => setListening(false);
    recogRef.current = recog;
    setListening(true);
    recog.start();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Close mentor"
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-primary">
              {"> SME_Voice_Mentor"}
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {context.key_concept ?? "General"} · Talk it through
            </div>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            Close_✕
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {messages.length === 0 && (
            <div className="border border-dashed border-border p-4 text-sm text-muted-foreground">
              Ask about the concept behind this question — e.g. "What does the key concept
              really mean?" or "Explain the trade-off between these options." I won't reveal
              the answer, only help you reason toward it.
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`border p-3 text-sm leading-relaxed ${
                m.role === "user"
                  ? "border-border bg-secondary/40"
                  : "border-primary/30 bg-primary/5"
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

        <footer className="border-t border-border p-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <input
                type="checkbox"
                checked={voiceOn}
                onChange={(e) => setVoiceOn(e.target.checked)}
                className="accent-primary"
              />
              Voice_reply
            </label>
            {!sttSupported && (
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
              placeholder="Ask about this concept…"
              className="flex-1 resize-none border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={busy}
            />
            {sttSupported && (
              <button
                type="button"
                onClick={toggleListen}
                className={`border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest ${
                  listening
                    ? "border-destructive bg-destructive/20 text-destructive"
                    : "border-border bg-background hover:bg-secondary"
                }`}
                aria-pressed={listening}
              >
                {listening ? "●_Rec" : "🎙_Mic"}
              </button>
            )}
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="bg-primary px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
            >
              Send
            </button>
          </form>
          <audio ref={audioRef} className="hidden" />
        </footer>
      </aside>
    </div>
  );
}
