import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFocusSurface } from "@/hooks/use-focus-surface";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Mic, MicOff, PlayCircle, Radio, Square, User, Volume2, X } from "lucide-react";
import { synthesizeSpeech } from "@/lib/mentor.functions";
import { getLocalMentorModel, streamLocalMentor } from "@/lib/local-mentor";
import { contextualSpokenOpening } from "@/lib/mentor-delivery";
import { decideLocalTurn } from "@/lib/mentor-speed.functions";
import { useActiveExam } from "@/hooks/useActiveExam";
import {
  getMicPref,
  getVoicePref,
  isOfflineVoiceInstalled,
  setMicPref,
  setVoicePref,
  speakOffline,
  warmOfflineVoice,
  type MicPref,
  type VoicePref,
} from "@/lib/offline-voice";
import { isSttInstalled, listenOnce, warmStt } from "@/lib/offline-stt";
import { supabase } from "@/integrations/supabase/client";
import { logEvent } from "@/lib/analytics";
import { matchResources, thumbnailFor, type LearnResource } from "@/lib/resources";
import { VideoModal } from "@/components/VideoModal";
import { Button } from "@/components/ui/button";
import type { CodeAdvice } from "@/lib/advice";


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
  /** Phase E8 — advice matrices of the active Study Canvas example. */
  advice?: CodeAdvice | null;
};


type Props = {
  open: boolean;
  onClose: () => void;
  context: QuestionContext;
  onHighlight?: (t: HighlightTarget) => void;
  /** B2 — a prompt handed over from the Study Canvas; sent once, then consumed. */
  pendingPrompt?: { id: number; text: string } | null;
  onPromptConsumed?: () => void;
};

type Segment = { text: string; target: HighlightTarget; audio?: Promise<string | null> };

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
          <span className="font-mono text-xs align-super text-primary">[{cite.n}]</span>
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

const MARKER_RE = /\[\[(scenario|stem|none|brief|written|opt:[A-Za-z0-9]+)\]\]/;

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
  /** Kept for callers; speech is always whole sentences (smooth, no choking). */
  clauseMode = false;

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
      } else if (m[1] === "written") {
        // Legacy marker — written text is display-only.
        this.speaking = false;
        this.target = null;
      } else {
        this.target = parseMarker(m[1]!);
      }
      work = work.slice(m.index + m[0].length);
    }
    this.drainSentences();
  }

  /** Written text is shown only; it is never read aloud. */
  private consume(text: string) {
    if (!text) return;
    if (this.speaking) this.pending += text;
    else this.display += text;
  }

  private drainSentences() {
    if (!this.speaking) return;
    // Whole sentences only, as soon as each completes, so speech flows naturally.
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

export function MentorCanvas({
  open,
  onClose,
  context,
  onHighlight,
  pendingPrompt,
  onPromptConsumed,
}: Props) {
  const speak = useServerFn(synthesizeSpeech);
  // H2 — focus moves into the mentor on open and is trapped only in the
  // mobile full-screen overlay; the desktop side frame stays non-modal.
  const isMobileViewport = useIsMobile();
  const surfaceRef = useFocusSurface<HTMLElement>({
    open,
    modal: isMobileViewport,
    onClose,
  });
  const mentorTitleId = useId();


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
  // Which agents handled each assistant turn (from X-Mentor-Route).
  const [routes, setRoutes] = useState<
    Record<number, { intent: string; agents: string[]; runId: string | null }>
  >({});
  // Turn-specific resources chosen server-side (from X-Mentor-Resources).
  const [turnResources, setTurnResources] = useState<LearnResource[] | null>(null);
  // A4/A5 — voice and microphone engines, plus a visible note when we fall back.
  const [voicePref, setVoicePrefState] = useState<VoicePref>("studio");
  const [micPref, setMicPrefState] = useState<MicPref>("browser");
  const [notice, setNotice] = useState<string | null>(null);
  const [voiceNeedsDownload, setVoiceNeedsDownload] = useState(false);
  const [voiceDownloading, setVoiceDownloading] = useState(false);
  const [voiceDownloadProgress, setVoiceDownloadProgress] = useState({ loaded: 0, total: 0 });
  // A6 — true while a clip is playing, so Stop is prominent and the mic can barge in.
  const [speaking, setSpeaking] = useState(false);
  // T1 — brief "Interrupted" state after a barge-in.
  const [interrupted, setInterrupted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const turnStartRef = useRef<number | null>(null);
  const turnLiveRef = useRef(false);
  const vadRef = useRef<{ stop: () => void } | null>(null);
  const voicePrefRef = useRef<VoicePref>("studio");
  const micPrefRef = useRef<MicPref>("browser");
  const announcedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const v = getVoicePref();
    const m = getMicPref();
    setVoicePrefState(v);
    setMicPrefState(m);
    voicePrefRef.current = v;
    micPrefRef.current = m;
  }, []);
  // The frame remains mounted while Settings changes local preferences in
  // another tab, or while a user returns to this practice view.
  useEffect(() => {
    if (!open) return;
    const v = getVoicePref();
    voicePrefRef.current = v;
    setVoicePrefState(v);
    if (v === "instant") {
      void isOfflineVoiceInstalled().then((installed) => {
        setVoiceNeedsDownload(!installed);
        if (installed) setNotice(null);
      });
    }
  }, [open]);
  const announce = useCallback((key: string, text: string) => {
    if (announcedRef.current.has(key)) return;
    announcedRef.current.add(key);
    setNotice(text);
  }, []);
  function chooseVoice(v: VoicePref) {
    setVoicePref(v);
    setVoicePrefState(v);
    voicePrefRef.current = v;
    announcedRef.current.delete("voice");
    setNotice(null);
    if (v === "instant") void isOfflineVoiceInstalled().then((installed) => setVoiceNeedsDownload(!installed));
  }
  function chooseMic(m: MicPref) {
    setMicPref(m);
    setMicPrefState(m);
    micPrefRef.current = m;
    announcedRef.current.delete("mic");
    setNotice(null);
  }





  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);

  const recogRef = useRef<{ stop: () => void; abort: () => void } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef(false);
  const voiceRef = useRef(true);
  const busyRef = useRef(false);
  const messagesRef = useRef<Msg[]>([]);
  const queueRef = useRef<Segment[]>([]);
  const drainingRef = useRef(false);
  const stoppedRef = useRef(false);
  const contextRef = useRef(context);
  const { active: activeExam } = useActiveExam();
  const decideLocal = useServerFn(decideLocalTurn);

  const sttSupported = typeof window !== "undefined" && !!getSpeechRecognition();
  const highlight = useCallback((t: HighlightTarget) => onHighlight?.(t), [onHighlight]);

  const baseResources = useMemo(
    () => matchResources([context.key_concept, context.domain, context.stem]),
    [context.key_concept, context.domain, context.stem],
  );
  // Server-picked resources for the latest turn win; otherwise fall back to
  // the question-level match so the panel always has something to watch.
  const resources = turnResources?.length ? turnResources : baseResources;

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
    // Phase 1 — a barge-in must silence the current clip instantly, not just
    // pause it and leave the buffered audio ready to resume.
    const el = audioRef.current;
    if (el) {
      el.pause();
      try {
        el.currentTime = 0;
        el.removeAttribute("src");
        el.load();
      } catch {
        /* noop */
      }
    }
    setSpeaking(false);
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
      // Load the on-device voice now so the first spoken sentence has no wait.
      if (voicePrefRef.current === "instant") {
        void isOfflineVoiceInstalled().then((ok) => ok && warmOfflineVoice());
      }
      // Load the on-device listener too, so the first transcription doesn't pay for it.
      if (micPrefRef.current === "device" && isSttInstalled()) warmStt();
    } else {
      setLive(false);
      liveRef.current = false;
      stopAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ---- speech synthesis queue -------------------------------------------
  /**
   * Browsers only allow audio that starts inside a user gesture. Our first
   * clip starts seconds later (after the stream + TTS round-trip), so the very
   * first request used to be blocked silently. Priming the element with a
   * muted silent clip during the click keeps it playable afterwards.
   */
  function unlockAudio() {
    const el = audioRef.current;
    if (!el || audioUnlockedRef.current) return;
    audioUnlockedRef.current = true;
    try {
      el.muted = true;
      el.src =
        "data:audio/mpeg;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA//////////////////////////////////////////////////////////////////8AAAA8TEFNRTMuOTlyAc0AAAAAAAAAABSAJAJAQgAAgAAAAnGMUiMEAAAAAAAAAAAAAAAAAAAA";
      const p = el.play();
      if (p) {
        void p
          .then(() => {
            el.pause();
            el.currentTime = 0;
            el.muted = false;
          })
          .catch(() => {
            el.muted = false;
          });
      } else {
        el.muted = false;
      }
    } catch {
      el.muted = false;
    }
  }

  async function synth(text: string): Promise<string | null> {
    // A3/A4 — on-device voice when chosen and installed; cloud voice otherwise,
    // and the learner is told once why the voice changed.
    if (voicePrefRef.current === "instant") {
      // Storage writes can finish just after the Settings download returns.
      let installed = await isOfflineVoiceInstalled();
      if (!installed) {
        await sleep(300);
        installed = await isOfflineVoiceInstalled();
      }
      if (installed) {
        setVoiceNeedsDownload(false);
        try {
          return await speakOffline(text);
        } catch (e) {
          console.warn("[mentor] offline voice failed, using cloud", e);
          announce("voice", "The Instant voice hit a problem, so the Studio voice is speaking instead.");
        }
      } else {
        setVoiceNeedsDownload(true);
        announce(
          "voice",
          "Instant voice isn't saved on this site yet — using Studio voice. Download it here to use it for Mentor.",
        );
      }
    }
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
      let done = false;
      let watchdog: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (done) return;
        done = true;
        if (watchdog) clearTimeout(watchdog);
        el.onended = el.onerror = el.onpause = el.onloadedmetadata = null;
        resolve();
      };
      // Safety net: a clip that never reports "ended" must not freeze the
      // voice queue (that left later replies silent while showing "speaking").
      const arm = (ms: number) => {
        if (watchdog) clearTimeout(watchdog);
        watchdog = setTimeout(finish, ms);
      };
      arm(30000);
      el.muted = false;
      // Calm local delivery without shifting the selected voice's pitch.
      el.preservesPitch = true;
      el.playbackRate = voicePrefRef.current === "instant" ? 0.92 : 1;
      el.onended = finish;
      el.onerror = finish;
      el.onloadedmetadata = () => {
        if (Number.isFinite(el.duration) && el.duration > 0)
          arm((el.duration / (el.playbackRate || 1)) * 1000 + 2000);
      };
      // Only a real stop/barge-in ends a sentence early — stray pause events
      // (src swaps, audio unlock) used to cut speech off mid-reply.
      el.onpause = () => {
        if (stoppedRef.current || el.ended) finish();
      };
      el.src = url;
      void el.play().catch(() => finish());
    });
  }


  const drain = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    const gen = drainGenRef.current;
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
        const url = await (seg.audio ?? next ?? synth(seg.text));
        next = null;
        // Keep voice prepared ahead of playback. The on-device voice runs on
        // this device, so it prepares only one sentence ahead — preparing more
        // while audio plays starves playback and makes it crackle.
        const ahead = voicePrefRef.current === "instant" ? 1 : 2;
        for (const upcoming of queueRef.current.slice(0, ahead)) {
          if (upcoming && !upcoming.audio) upcoming.audio = synth(upcoming.text);
        }
        if (stoppedRef.current) break;
        if (url) {
          setSpeaking(true);
          // T2 — time to first sound for this turn, shown on Traces.
          if (turnStartRef.current != null) {
            logEvent("mentor_ttfa", {
              ms: Math.round(performance.now() - turnStartRef.current),
              live: turnLiveRef.current,
              local: Boolean(getLocalMentorModel()),
            });
            turnStartRef.current = null;
          }
          await playUrl(url);
          URL.revokeObjectURL(url);
          // A short breath between local sentences; never delays the first sound.
          if (voicePrefRef.current === "instant" && !stoppedRef.current && queueRef.current.length) await sleep(160);
        }
      }
    } finally {
      drainingRef.current = false;
      setSpeaking(false);
      highlight(null);
      setStatus(null);
      if (!stoppedRef.current && liveRef.current) startRecognition(true);
    }
  }, [highlight]);

  /** Speaks a full written answer on demand (Read response button). */
  function readAloud(text: string) {
    unlockAudio();
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

  // B2 — send a prompt handed over from the Study Canvas (once per id).
  const handledPromptRef = useRef<number | null>(null);
  useEffect(() => {
    if (!pendingPrompt || handledPromptRef.current === pendingPrompt.id) return;
    if (busyRef.current) return;
    handledPromptRef.current = pendingPrompt.id;
    unlockAudio();
    void send(pendingPrompt.text);
    onPromptConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busyRef.current) return;
    // Must run inside the originating click so the first clip can play.
    unlockAudio();
    stoppedRef.current = false;

    setError(null);
    const next: Msg[] = [...messagesRef.current, { role: "user", content: trimmed }];
    setMessages(next);
    messagesRef.current = next;
    setInput("");
    setBusy(true);
    busyRef.current = true;
    setStreaming("");
    setStatus("Mentor thinking");
    // Mic off while the mentor talks so it doesn't hear itself.
    try {
      recogRef.current?.abort();
    } catch {
      /* noop */
    }
    setListening(false);

    // T1 — one controller per turn; a barge-in aborts it.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    turnStartRef.current = performance.now();
    turnLiveRef.current = liveRef.current;
    setInterrupted(false);

    let firstSpoken = true;
    const parser = new SegmentParser((seg) => {
      if (firstSpoken) {
        seg.text = contextualSpokenOpening(seg.text, trimmed);
        firstSpoken = false;
      }
      // L2 — start preparing the voice for the next two sentences right away,
      // so each one is ready by the time the previous one finishes playing.
      // Do not launch three local inference jobs while audio is playing.
      const prepareLimit = voicePrefRef.current === "instant" ? 1 : 3;
      if (voiceRef.current && queueRef.current.length < prepareLimit) seg.audio = synth(seg.text);
      queueRef.current.push(seg);
      void drain();
    });
    parser.clauseMode = liveRef.current;

    try {
      // L5 — answer through the learner's own Ollama when chosen and reachable.
      const localModel = getLocalMentorModel();
      if (localModel) {
        setStatus("Mentor speaking");
        const ctx = contextRef.current;
        const lastTurn = next[next.length - 1]?.content ?? "";
        // P4.3 — same Jev intent/focus the cloud mentor gets; never waits past its budget.
        const decision = await decideLocal({
          data: { turn: lastTurn, hasQuestion: Boolean(ctx?.stem), selectedOption: ctx?.selectedOption ?? null },
        }).catch(() => null);
        if (decision?.focus === "stem") onHighlight?.({ type: "stem" });
        else if (decision?.focus === "scenario") onHighlight?.({ type: "scenario" });
        else if (decision?.focus === "option" && ctx?.selectedOption)
          onHighlight?.({ type: "option", label: ctx.selectedOption });
        const localStart = performance.now();
        let firstAt: number | null = null;
        const ok = await streamLocalMentor({
          model: localModel,
          messages: next,
          signal: controller.signal,
          context: { ...(ctx ?? {}), examName: activeExam.name, intent: decision?.intent ?? null, focus: decision?.focus ?? null } as never,
          onDelta: (d) => {
            if (firstAt == null) {
              firstAt = performance.now();
              logEvent("local_mentor_ttft", { ms: Math.round(firstAt - localStart), model: localModel });
            }
            parser.push(d);
            setStreaming(parser.display);
          },
        });
        if (ok) {
          parser.end();
          const full = parser.display.trim();
          setStreaming("");
          if (full) {
            setMessages((m) => {
              const updated: Msg[] = [...m, { role: "assistant", content: full }];
              messagesRef.current = updated;
              return updated;
            });
            logEvent("mentor_reply", { chars: full.length, local: true });
          }
          return;
        }
        announce("local", "Ollama on this computer isn't reachable, so the cloud mentor is answering.");
      }

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Session expired — sign in again.");

      const res = await fetch("/api/mentor-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: next, context: contextRef.current, live: liveRef.current }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error((await res.text().catch(() => "")) || `Mentor failed (${res.status})`);
      }
      setStatus("Mentor speaking");

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

      // Route metadata: which intent was detected and which agents ran.
      try {
        const rawRoute = res.headers.get("X-Mentor-Route");
        if (rawRoute) {
          const parsed = JSON.parse(decodeURIComponent(rawRoute)) as {
            intent: string;
            agents: string[];
            runId: string | null;
          };
          if (parsed?.intent) setRoutes((r) => ({ ...r, [assistantIndex]: parsed }));
        }
      } catch {
        /* ignore malformed route header */
      }

      // Resource agent picks for this turn.
      try {
        const rawRes = res.headers.get("X-Mentor-Resources");
        if (rawRes) {
          const parsed = JSON.parse(decodeURIComponent(rawRes)) as LearnResource[];
          setTurnResources(Array.isArray(parsed) && parsed.length ? parsed : null);
        }
      } catch {
        /* ignore malformed resource header */
      }

      // Phase 1 — point the learner's eye at the right part of the question
      // before the first word arrives.
      try {
        const rawFocus = res.headers.get("X-Mentor-Focus");
        if (rawFocus) {
          const { focus, option } = JSON.parse(decodeURIComponent(rawFocus)) as {
            focus: "scenario" | "stem" | "option" | "none";
            option: string | null;
          };
          if (focus === "scenario") highlight({ type: "scenario" });
          else if (focus === "stem") highlight({ type: "stem" });
          else if (focus === "option" && option)
            highlight({ type: "option", label: option.toUpperCase() });
        }
      } catch {
        /* ignore malformed focus header */
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
      if (controller.signal.aborted) {
        // T1 — keep what was written before the interruption.
        const partial = parser.display.trim();
        if (partial) {
          setMessages((m) => {
            const updated: Msg[] = [...m, { role: "assistant", content: `${partial} …` }];
            messagesRef.current = updated;
            return updated;
          });
        }
      } else {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
      busyRef.current = false;
      if (!drainingRef.current) {
        setStatus(null);
        if (!stoppedRef.current && liveRef.current) startRecognition(true);
      }
    }
  }

  // ---- speech recognition ------------------------------------------------
  function startLocalListening() {
    void listenOnce({
      onStart: () => setListening(true),
      onTranscribing: () => {
        setListening(false);
        setStatus("Transcribing on your device…");
      },
      onText: (text) => {
        setStatus(null);
        void send(text);
      },
      onError: (msg) => {
        setStatus(null);
        announce("mic", `On-device listening failed (${msg}), so browser dictation will be used next time.`);
        micPrefRef.current = "browser";
      },
      onEnd: () => {
        setListening(false);
        setStatus((s) => (s === "Transcribing on your device…" ? null : s));
        if (liveRef.current && !busyRef.current && !drainingRef.current && !stoppedRef.current) {
          setTimeout(() => {
            if (liveRef.current && !busyRef.current && !drainingRef.current) startRecognition(true);
          }, 300);
        }
      },
    })
      .then((l) => {
        recogRef.current = l;
      })
      .catch(() => {
        setListening(false);
        announce("mic", "Microphone access was blocked. Allow it in the browser's address bar and try again.");
      });
  }

  function startRecognition(continuous: boolean) {
    if (busyRef.current || drainingRef.current) return;
    try {
      recogRef.current?.abort();
    } catch {
      /* noop */
    }
    // L1 — open-source Whisper on the device when downloaded.
    const wantLocal = micPrefRef.current === "device";
    if (wantLocal && isSttInstalled()) return startLocalListening();
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    if (wantLocal) {
      announce("mic", "On-device listening isn't downloaded yet — get it in Settings › Mentor & voice. Using browser dictation for now.");
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
    recog.onerror = (ev?: unknown) => {
      if (recogRef.current !== recog) return;
      setListening(false);
      const code = (ev as { error?: string } | undefined)?.error;
      if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") {
        liveRef.current = false;
        setLive(false);
        announce("mic", "The microphone is blocked or missing. Allow it in the browser's address bar, then turn Live talk on again.");
      }
    };
    recog.onend = () => {
      // An older, aborted recogniser ending must not cancel the new one.
      if (recogRef.current !== recog) return;
      setListening(false);
      if (liveRef.current && !busyRef.current && !drainingRef.current && !stoppedRef.current) {
        setTimeout(() => {
          if (liveRef.current && !busyRef.current && !drainingRef.current && recogRef.current === recog)
            startRecognition(true);
        }, 300);
      }
    };
    recogRef.current = recog;
    try {
      recog.start();
    } catch {
      setListening(false);
    }
  }

  /** T1 — the learner started talking: silence the mentor and listen. */
  function bargeIn() {
    abortRef.current?.abort();
    abortRef.current = null;
    turnStartRef.current = null;
    stopAll();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* noop */
    }
    busyRef.current = false;
    drainingRef.current = false;
    setBusy(false);
    setInterrupted(true);
    logEvent("mentor_barge_in", {});
    stoppedRef.current = false;
    if (liveRef.current) startRecognition(true);
    setTimeout(() => setInterrupted(false), 1200);
  }

  /**
   * T1 — voice activity detector. One echo-cancelled mic stream stays open in
   * live talk; ~80 ms above an adaptive noise floor while the mentor is
   * thinking or speaking counts as an interruption.
   */
  async function startVad() {
    if (vadRef.current || typeof window === "undefined") return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let floor = 0.01;
    let voicedMs = 0;
    let last = performance.now();
    const tick = setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!;
      const rms = Math.sqrt(sum / buf.length);
      const active = busyRef.current || drainingRef.current;
      // While the mentor's own voice plays, speaker echo leaks into the mic and
      // used to cut the mentor off mid-sentence. Require louder, longer speech then.
      const playing = drainingRef.current && !!audioRef.current && !audioRef.current.paused;
      const voiced = rms > Math.max(playing ? 0.06 : 0.02, floor * (playing ? 4 : 3));
      if (!voiced) floor = floor * 0.95 + rms * 0.05; // adapt to the room
      if (active && voiced) {
        voicedMs += dt;
        if (voicedMs >= (playing ? 250 : 80)) {
          voicedMs = 0;
          bargeIn();
        }
      } else {
        voicedMs = Math.max(0, voicedMs - dt);
      }
    }, 20);
    vadRef.current = {
      stop: () => {
        clearInterval(tick);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close().catch(() => {});
      },
    };
  }
  function stopVad() {
    vadRef.current?.stop();
    vadRef.current = null;
  }
  useEffect(() => {
    if (live) void startVad();
    else stopVad();
    return () => stopVad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // T1 — visible turn state: Idle → Listening → Thinking → Speaking → Interrupted.
  const turnState = interrupted
    ? "Interrupted"
    : speaking
      ? "Speaking"
      : busy
        ? "Thinking"
        : listening
          ? "Listening"
          : "Idle";

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
    // A6 — barge-in: pressing the mic while the mentor talks cuts it off and listens.
    if (drainingRef.current) {
      stopAll();
      setTimeout(() => {
        stoppedRef.current = false;
        drainingRef.current = false;
        startRecognition(false);
      }, 150);
      return;
    }
    stoppedRef.current = false;
    startRecognition(false);
  }

  async function toggleLive() {
    const nextLive = !live;
    if (nextLive) {
      unlockAudio();
      // Ask for the microphone inside the click so the browser shows its prompt.
      try {
        const s = await navigator.mediaDevices?.getUserMedia({ audio: true });
        s?.getTracks().forEach((t) => t.stop());
      } catch {
        announce("mic", "Microphone access was blocked. Allow it in the browser's address bar and try again.");
        return;
      }
      if (!getSpeechRecognition() && !(micPrefRef.current === "device" && isSttInstalled())) {
        announce("mic", "This browser can't listen continuously. Use Chrome or Edge, or download on-device listening in Settings.");
        return;
      }
    }
    setLive(nextLive);
    liveRef.current = nextLive;
    if (nextLive) {
      // Barge-in: going live stops the mentor talking and listens straight away.
      if (drainingRef.current) stopAll();
      stoppedRef.current = false;
      drainingRef.current = false;
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
      { label: "Explain question", text: "Explain the question in simple words." },
      {
        label: "Read fast",
        text: "How do I read this question and its options quickly? Give me a reading strategy for this exact item.",
      },
      {
        label: "Trap spotting",
        text: "What are the distractor traps in these options and what keyword in the stem rules them out?",
      },
    ];
    if (context.selectedOption) {
      base.unshift({
        label: `Rate option ${context.selectedOption}`,
        text: `I picked option ${context.selectedOption}. How apt is that option for this question — what does it get right, what does it miss, and which words in the stem decide it?`,
      });
    }
    return base;
  }, [context.selectedOption]);

  if (!open) return null;

  return (
    <aside
      ref={surfaceRef}
      id="mentor-canvas"
      role="dialog"
      aria-modal={isMobileViewport ? true : undefined}
      aria-labelledby={mentorTitleId}
      tabIndex={-1}
      className="flex h-full min-w-0 flex-col border-l border-border bg-card"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div
            id={mentorTitleId}
            className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.3em] text-primary"
          >
            <User className="h-3.5 w-3.5" /> SME_Mentor
          </div>
          <div className="mt-0.5 truncate font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {context.key_concept ?? "General"} · Talk it through
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close mentor"
          className="-m-2 inline-flex min-h-11 min-w-11 items-center justify-center p-2 text-muted-foreground hover:text-foreground"
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
                className={`mb-1 flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-[0.3em] ${
                  isUser ? "text-muted-foreground" : "text-primary"
                }`}
              >
                <span>{isUser ? "You" : "Mentor"}</span>
                {!isUser && routes[i] && (
                  <>
                    <span className="border border-primary/40 px-1 py-px tracking-widest text-primary">
                      {routes[i].intent.replace(/_/g, " ")}
                    </span>
                    {routes[i].agents.map((a) => (
                      <span
                        key={a}
                        className="border border-border px-1 py-px tracking-widest text-muted-foreground"
                      >
                        {a}
                      </span>
                    ))}
                  </>
                )}
              </div>

              <div className="whitespace-pre-wrap">
                {isUser ? (
                  (() => {
                    // B3 — show what the Study Canvas captured instead of the raw payload.
                    const cap = /^\[\[code-context: ([^\]]+)\]\]/.exec(m.content);
                    if (!cap) return m.content;
                    return (
                      <>
                        <span className="mb-1 inline-block border border-primary/40 px-1.5 py-0.5 font-mono text-xs text-primary">
                          Captured: {cap[1]}
                        </span>
                        {"\n"}Explain this code.
                      </>
                    );
                  })()
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
                    <Volume2 className="h-3 w-3" /> Read response
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
                          <span className="block truncate text-xs font-medium">{r.title}</span>
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
                    Library sources
                  </div>
                  <ol className="space-y-1">
                    {shownCitations.map((c) => (
                      <li key={c.n} className="text-xs leading-snug">
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
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {status}…
          </div>
        )}
        {error && (
          <div className="border border-destructive/50 bg-destructive/10 p-3 font-mono text-xs uppercase tracking-widest text-destructive">
            {error}
          </div>
        )}

        {messages.length === 0 && (
        <div className="border-t border-border pt-3">

          <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
            Watch this
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
                    <div className="line-clamp-2 text-xs font-medium leading-tight group-hover:text-primary">
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
        {notice && (
          <div
            role="status"
            className="mb-2 flex items-start justify-between gap-2 rounded-md border border-warning/40 bg-warning-soft px-2 py-1.5 text-xs text-foreground"
          >
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} aria-label="Dismiss notice" className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        {voicePref === "instant" && voiceNeedsDownload && (
          <Button
            type="button"
            disabled={voiceDownloading}
            onClick={async () => {
              setVoiceDownloading(true);
              try {
                const { downloadOfflineVoice } = await import("@/lib/offline-voice");
                await downloadOfflineVoice(setVoiceDownloadProgress);
                setVoiceNeedsDownload(false);
                setNotice(null);
              } catch (e) {
                setNotice(e instanceof Error ? e.message : "Voice download failed. Try again in Settings.");
              } finally {
                setVoiceDownloading(false);
              }
            }}
            variant="outline"
            className="mb-2 min-h-11 border-primary px-3 text-xs font-medium text-primary"
          >
            {voiceDownloading ? `Downloading voice · ${voiceDownloadProgress.total ? Math.round(voiceDownloadProgress.loaded / voiceDownloadProgress.total * 100) : 0}%` : "Download Instant voice here (about 60 MB)"}
          </Button>
        )}
        {voiceDownloading && <progress className="mb-2 w-full accent-primary" max={voiceDownloadProgress.total || 1} value={voiceDownloadProgress.loaded} aria-label="Instant voice download progress" />}
        {speaking && (
          <button
            onClick={stopAll}
            className="touch-target mb-2 flex w-full items-center justify-center gap-2 rounded-md bg-danger px-3 text-sm font-medium text-danger-foreground"
            aria-label="Stop the mentor speaking"
          >
            <Square className="h-4 w-4" /> Stop speaking
            <span className="text-xs opacity-80">— or press the mic to interrupt</span>
          </button>
        )}
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <label className="flex items-center gap-1">
            Voice
            <select
              value={voicePref}
              onChange={(e) => chooseVoice(e.target.value as VoicePref)}
              className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
              aria-label="Mentor voice"
            >
              <option value="instant">Instant (on device)</option>
              <option value="studio">Studio (cloud)</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            Mic
            <select
              value={micPref}
              onChange={(e) => chooseMic(e.target.value as MicPref)}
              className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
              aria-label="Microphone engine"
            >
              <option value="device">On-device</option>
              <option value="browser">Browser dictation</option>
            </select>
          </label>
        </div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <input
              type="checkbox"
              checked={voiceOn}
              onChange={(e) => setVoiceOn(e.target.checked)}
              className="accent-primary"
            />
            Voice reply
          </label>
          <div className="flex items-center gap-1.5">
            <button
              onClick={stopAll}
              className="flex items-center gap-1 border border-border px-2 py-1 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
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
                <Radio className="h-3 w-3" /> {live ? (turnState === "Idle" ? "Live on" : turnState) : "Live talk"}
              </button>
            ) : (
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                Mic unsupported
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
            className="bg-primary px-3 py-2 font-mono text-xs font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
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
