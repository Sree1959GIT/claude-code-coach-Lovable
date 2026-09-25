/**
 * A3 — offline voice engine.
 *
 * An in-browser neural voice (Piper, ~60 MB) downloaded once into the
 * browser's private file storage, then synthesised on the device with no
 * network or credits. Browser-only: the library is imported lazily so the
 * server render never loads it.
 */

export const OFFLINE_VOICE_ID = "en_US-hfc_female-medium";
export const VOICE_PREF_KEY = "ccaf.voice";

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

/** Synthesises speech on the device; returns an object URL for a WAV clip. */
export async function speakOffline(text: string): Promise<string> {
  const p = await load();
  const wav = await p.predict({ text, voiceId: OFFLINE_VOICE_ID });
  return URL.createObjectURL(wav);
}

/** True when the learner chose the on-device voice in Settings. */
export function prefersOfflineVoice(): boolean {
  try {
    return localStorage.getItem(VOICE_PREF_KEY) === "instant";
  } catch {
    return false;
  }
}
