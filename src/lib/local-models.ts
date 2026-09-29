/**
 * F3 — local model (Ollama) hardware scan and recommendation. Client-only.
 * The learner's own machine is only reachable from their browser, so the scan
 * and the Ollama probe both run here; nothing is sent to the server.
 */

export type HardwareScan = {
  cores: number | null;
  /** Browser-reported RAM in GB (Chrome caps this at 8). */
  memoryGb: number | null;
  gpu: string | null;
  webgpu: boolean;
  platform: string;
};

export type OllamaProbe =
  | { ok: true; models: Array<{ name: string; sizeGb: number }> }
  | { ok: false; reason: string };

export type LocalModel = {
  id: string;
  label: string;
  /** Approx RAM/VRAM needed at Q4 quantisation. */
  needGb: number;
  toolCalling: boolean;
  speed: "fast" | "medium" | "slow";
  strength: string;
};

export const LOCAL_MODELS: LocalModel[] = [
  { id: "qwen3:4b", label: "Qwen3 4B", needGb: 3.5, toolCalling: true, speed: "fast", strength: "Quick explanations, runs on most laptops" },
  { id: "llama3.2:3b", label: "Llama 3.2 3B", needGb: 3, toolCalling: true, speed: "fast", strength: "Light and responsive for voice chat" },
  { id: "gemma3:12b", label: "Gemma 3 12B", needGb: 9, toolCalling: false, speed: "medium", strength: "Clear teaching style, no tool use" },
  { id: "qwen3:8b", label: "Qwen3 8B", needGb: 6, toolCalling: true, speed: "medium", strength: "Best all-rounder for study help" },
  { id: "qwen2.5-coder:14b", label: "Qwen2.5 Coder 14B", needGb: 10, toolCalling: true, speed: "medium", strength: "Strong at explaining code" },
  { id: "gpt-oss:20b", label: "gpt-oss 20B", needGb: 14, toolCalling: true, speed: "slow", strength: "Deeper reasoning, needs a strong machine" },
  { id: "qwen3:30b-a3b", label: "Qwen3 30B-A3B", needGb: 20, toolCalling: true, speed: "medium", strength: "Large-model quality at small-model speed" },
];

export async function scanHardware(): Promise<HardwareScan> {
  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: { requestAdapter: () => Promise<unknown> } };
  let gpu: string | null = null;
  let webgpu = false;
  try {
    const adapter = (await nav.gpu?.requestAdapter()) as { info?: { vendor?: string; architecture?: string; description?: string } } | null;
    if (adapter) {
      webgpu = true;
      const i = adapter.info;
      gpu = [i?.vendor, i?.architecture, i?.description].filter(Boolean).join(" ") || "GPU found";
    }
  } catch {
    /* no WebGPU */
  }
  if (!gpu) {
    try {
      const gl = document.createElement("canvas").getContext("webgl");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      if (gl && ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    } catch {
      /* ignore */
    }
  }
  return {
    cores: nav.hardwareConcurrency ?? null,
    memoryGb: nav.deviceMemory ?? null,
    gpu,
    webgpu,
    platform: nav.userAgent.includes("Mac") ? "Mac" : nav.userAgent.includes("Windows") ? "Windows" : "Linux / other",
  };
}

export async function probeOllama(base = "http://localhost:11434"): Promise<OllamaProbe> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${base}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, reason: `Ollama answered with ${res.status}` };
    const body = (await res.json()) as { models?: Array<{ name: string; size: number }> };
    return { ok: true, models: (body.models ?? []).map((m) => ({ name: m.name, sizeGb: m.size / 1e9 })) };
  } catch {
    return { ok: false, reason: "Not reachable. Is Ollama running, with OLLAMA_ORIGINS allowing this site?" };
  }
}

/** Budget in GB: user override wins, else browser RAM (capped at 8, so treat 8 as "8 or more"). */
export function recommend(budgetGb: number, needTools: boolean): Array<LocalModel & { fits: boolean; score: number }> {
  const speedScore = { fast: 3, medium: 2, slow: 1 } as const;
  return LOCAL_MODELS.map((m) => {
    const fits = m.needGb <= budgetGb * 0.75;
    const score = (fits ? 100 : 0) + (needTools && m.toolCalling ? 20 : needTools ? -50 : 0) + m.needGb * 2 + speedScore[m.speed] * 3;
    return { ...m, fits, score };
  }).sort((a, b) => b.score - a.score);
}

export const SPEED_TIPS = [
  "Use Q4_K_M quantisation — about half the memory of Q8 with little quality loss.",
  "Turn on flash attention (OLLAMA_FLASH_ATTENTION=1) and a quantised KV cache (OLLAMA_KV_CACHE_TYPE=q8_0).",
  "Speculative decoding (e.g. DFlash or a small draft model in llama.cpp) can give 2–3× faster replies; Ollama doesn't expose it yet, so use llama.cpp or LM Studio for that.",
  "Keep the model loaded between questions: OLLAMA_KEEP_ALIVE=30m removes the warm-up wait.",
  "Mixture-of-experts models (like Qwen3 30B-A3B) answer at small-model speed if you have the memory.",
];
