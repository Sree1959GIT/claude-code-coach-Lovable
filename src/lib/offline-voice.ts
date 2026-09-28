/**
 * A3 — offline voice engine.
 *
 * An in-browser neural voice (Piper, ~60 MB) downloaded once into the
 * browser's private file storage, then synthesised on the device with no
 * network or credits. Browser-only: the library is imported lazily so the
 * server render never loads it.
 */

export const OFFLINE_VOICE_ID = "en_US-hfc_female-medium";
export const VOICE_PREF_KEY = "ccaf.voice_engine";

export type DownloadProgress = { loaded: number; total: number };

type Piper = typeof import("@mintplex-labs/piper-tts-web");
let lib: Promise<Piper> | null = null;
function load(): Promise<Piper> {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser only"));
  lib ??= import("@mintplex-labs/piper-tts-web");
  return lib;
}

export async function isOfflineVoiceInstalled(): Promise<boolean> {
  try {
    const p = await load();
    return (await p.stored()).includes(OFFLINE_VOICE_ID);
  } catch {
    return false;
  }
}

/** Downloads the voice model, reporting summed bytes across its files. */
export async function downloadOfflineVoice(
  onProgress: (p: DownloadProgress) => void,
): Promise<void> {
  const p = await load();
  const files = new Map<string, DownloadProgress>();
  await p.download(OFFLINE_VOICE_ID, (prog) => {
    files.set(prog.url, { loaded: prog.loaded, total: prog.total });
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    onProgress({ loaded, total });
  });
}

export async function removeOfflineVoice(): Promise<void> {
  const p = await load();
  await p.remove(OFFLINE_VOICE_ID);
}

/**
 * The library defaults to onnxruntime 1.18 files on cdnjs, which don't match
 * the runtime it actually bundles (1.30) — the threaded .mjs 404s. Point the
 * runtime at the matching version's files instead. Keep in step with
 * node_modules/onnxruntime-web/package.json.
 */
const ORT_VERSION = "1.30.0";
const WASM_PATHS = {
  onnxWasm: `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`,
  piperData: "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.data",
  piperWasm: "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.wasm",
};

/** Synthesises speech on the device; returns an object URL for a WAV clip. */
export async function speakOffline(text: string): Promise<string> {
  const p = await load();
  const session = await p.TtsSession.create({ voiceId: OFFLINE_VOICE_ID, wasmPaths: WASM_PATHS });
  const wav = await session.predict(text);
  return URL.createObjectURL(wav);
}

/** True when the learner chose the on-device voice in Settings. */
export function prefersOfflineVoice(): boolean {
  return getVoicePref() === "instant";
}

export type VoicePref = "instant" | "studio";
export type MicPref = "browser" | "device";
export const MIC_PREF_KEY = "ccaf.mic_engine";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* storage blocked */
  }
}

export const getVoicePref = (): VoicePref => (read(VOICE_PREF_KEY) === "instant" ? "instant" : "studio");
export const setVoicePref = (v: VoicePref) => write(VOICE_PREF_KEY, v);
export const getMicPref = (): MicPref => (read(MIC_PREF_KEY) === "device" ? "device" : "browser");
export const setMicPref = (v: MicPref) => write(MIC_PREF_KEY, v);
