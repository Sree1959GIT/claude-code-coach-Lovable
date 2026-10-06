/**
 * S4 — Kokoro-82M on-device voice (open weights, near-studio quality).
 * Downloaded once (~90 MB, q8) into browser cache storage, then synthesised
 * on WebGPU (or WASM). Browser-only and lazily imported.
 */

export const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const KOKORO_VOICE = "af_heart";
const INSTALLED_KEY = "ccaf.kokoro_installed";

type Tts = { generate: (t: string, o: { voice: string }) => Promise<{ toBlob: () => Blob }> };
let tts: Promise<Tts> | null = null;
let chain: Promise<unknown> = Promise.resolve();

export type KokoroProgress = { loaded: number; total: number };

function load(onProgress?: (p: KokoroProgress) => void): Promise<Tts> {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser only"));
  tts ??= (async () => {
    const { KokoroTTS } = await import("kokoro-js");
    const files = new Map<string, KokoroProgress>();
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
    const webgpu = "gpu" in navigator;
    try {
      return (await KokoroTTS.from_pretrained(KOKORO_MODEL, {
        dtype: webgpu ? "fp32" : "q8",
        device: webgpu ? "webgpu" : "wasm",
        progress_callback: cb as never,
      })) as unknown as Tts;
    } catch {
      return (await KokoroTTS.from_pretrained(KOKORO_MODEL, {
        dtype: "q8",
        device: "wasm",
        progress_callback: cb as never,
      })) as unknown as Tts;
    }
  })();
  tts.catch(() => {
    tts = null;
  });
  return tts;
}

export function isKokoroInstalled(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

export async function downloadKokoro(onProgress: (p: KokoroProgress) => void): Promise<void> {
  await load(onProgress);
  try {
    localStorage.setItem(INSTALLED_KEY, "1");
  } catch {
    /* noop */
  }
}

export async function removeKokoro(): Promise<void> {
  tts = null;
  try {
    localStorage.removeItem(INSTALLED_KEY);
    for (const name of await caches.keys()) {
      if (name.includes("transformers")) {
        const c = await caches.open(name);
        for (const req of await c.keys()) if (req.url.includes("Kokoro")) await c.delete(req);
      }
    }
  } catch {
    /* noop */
  }
}

export function warmKokoro(): void {
  void load().catch(() => {});
}

/** Synthesises one phrase; clips are produced in order. Returns an object URL. */
export function speakKokoro(text: string): Promise<string> {
  const run = chain.then(async () => {
    const t = await load();
    const audio = await t.generate(text, { voice: KOKORO_VOICE });
    return URL.createObjectURL(audio.toBlob());
  });
  chain = run.catch(() => {});
  return run;
}
