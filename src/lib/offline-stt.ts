/**
 * L1 — on-device listening (open-source Whisper in the browser).
 *
 * Downloaded once (~40 MB) into browser cache storage by transformers.js, then
 * transcribed locally on WebGPU (or WASM). Browser-only and lazily imported.
 */

export const STT_MODEL = "onnx-community/whisper-tiny.en";
const INSTALLED_KEY = "ccaf.stt_installed";

type Asr = (audio: Float32Array) => Promise<{ text: string } | { text: string }[]>;
let pipe: Promise<Asr> | null = null;

export type SttProgress = { loaded: number; total: number };

function load(onProgress?: (p: SttProgress) => void): Promise<Asr> {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser only"));
  pipe ??= (async () => {
    const { pipeline } = await import("@huggingface/transformers");
    const files = new Map<string, SttProgress>();
    const cb = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== "progress" || !p.file) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      onProgress?.({ loaded, total });
    };
    const device = "gpu" in navigator ? "webgpu" : "wasm";
    try {
      return (await pipeline("automatic-speech-recognition", STT_MODEL, {
        device,
        dtype: "q8",
        progress_callback: cb,
      } as never)) as unknown as Asr;
    } catch {
      return (await pipeline("automatic-speech-recognition", STT_MODEL, {
        device: "wasm",
        dtype: "q8",
        progress_callback: cb,
      } as never)) as unknown as Asr;
    }
  })();
  pipe.catch(() => {
    pipe = null;
  });
  return pipe;
}

export function isSttInstalled(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

export async function downloadStt(onProgress: (p: SttProgress) => void): Promise<void> {
  await load(onProgress);
  try {
    localStorage.setItem(INSTALLED_KEY, "1");
  } catch {
    /* noop */
  }
}

export async function removeStt(): Promise<void> {
  pipe = null;
  try {
    localStorage.removeItem(INSTALLED_KEY);
    for (const name of await caches.keys()) {
      if (name.includes("transformers")) await caches.delete(name);
    }
  } catch {
    /* noop */
  }
}

async function toPcm16k(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const audio = await ctx.decodeAudioData(buf);
    return audio.getChannelData(0);
  } finally {
    void ctx.close();
  }
}

export async function transcribe(blob: Blob): Promise<string> {
  const asr = await load();
  const out = await asr(await toPcm16k(blob));
  const text = Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text;
  return text.replace(/\[[^\]]*\]|\([^)]*\)/g, "").trim();
}

export type Listener = { stop: () => void; abort: () => void };

/**
 * Records until ~1.2 s of silence after speech (or the caller stops), then
 * transcribes on the device.
 */
export async function listenOnce(opts: {
  onStart?: () => void;
  onTranscribing?: () => void;
  onText: (text: string) => void;
  onEnd: () => void;
  onError: (msg: string) => void;
}): Promise<Listener> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  });
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  let aborted = false;
  const actx = new AudioContext();
  const analyser = actx.createAnalyser();
  actx.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let heard = false;
  let quietSince = 0;
  const started = Date.now();
  const timer = setInterval(() => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    const rms = Math.sqrt(sum / data.length);
    const now = Date.now();
    if (rms > 0.03) {
      heard = true;
      quietSince = 0;
    } else if (heard) {
      quietSince ||= now;
      if (now - quietSince > 1200) stop();
    }
    if (now - started > 30000 || (!heard && now - started > 8000)) stop();
  }, 100);

  const cleanup = () => {
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
    void actx.close();
  };
  function stop() {
    if (rec.state !== "inactive") rec.stop();
  }
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = async () => {
    cleanup();
    if (aborted || !heard) return opts.onEnd();
    opts.onTranscribing?.();
    try {
      const text = await transcribe(new Blob(chunks, { type: rec.mimeType }));
      if (text) opts.onText(text);
    } catch (e) {
      opts.onError(e instanceof Error ? e.message : "Transcription failed");
    }
    opts.onEnd();
  };
  rec.start();
  opts.onStart?.();
  return {
    stop,
    abort: () => {
      aborted = true;
      stop();
    },
  };
}
