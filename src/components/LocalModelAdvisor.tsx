/** F3 — hardware scan + local model recommendations (Settings › Models). */
import { useState } from "react";
import { probeOllama, recommend, scanHardware, SPEED_TIPS, type HardwareScan, type OllamaProbe } from "@/lib/local-models";

export function LocalModelAdvisor() {
  const [hw, setHw] = useState<HardwareScan | null>(null);
  const [ollama, setOllama] = useState<OllamaProbe | null>(null);
  const [memory, setMemory] = useState<string>("");
  const [tools, setTools] = useState(true);
  const [busy, setBusy] = useState(false);

  async function scan() {
    setBusy(true);
    const [h, o] = await Promise.all([scanHardware(), probeOllama()]);
    setHw(h);
    setOllama(o);
    if (!memory && h.memoryGb) setMemory(String(h.memoryGb));
    setBusy(false);
  }

  const budget = Number(memory) || hw?.memoryGb || 8;
  const picks = hw ? recommend(budget, tools) : [];
  const installed = new Set(ollama?.ok ? ollama.models.map((m) => m.name) : []);

  return (
    <div className="mt-6 border-t border-border pt-6">
      <h3 className="text-sm font-medium">Run a model on your computer</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Scan this computer and we'll suggest models for Ollama that fit its memory and still answer quickly.
      </p>
      <button
        type="button"
        onClick={scan}
        disabled={busy}
        className="touch-target mt-3 rounded-md border border-border px-4 text-sm hover:bg-secondary disabled:opacity-60"
      >
        {busy ? "Scanning…" : hw ? "Scan again" : "Scan my computer"}
      </button>

      {hw && (
        <div className="mt-4 space-y-4">
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-muted-foreground">Processor cores</dt><dd>{hw.cores ?? "Unknown"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Memory (browser view)</dt><dd>{hw.memoryGb ? `${hw.memoryGb} GB${hw.memoryGb >= 8 ? "+" : ""}` : "Unknown"}</dd></div>
            <div className="col-span-2"><dt className="text-xs text-muted-foreground">Graphics</dt><dd className="truncate">{hw.gpu ?? "Not detected"}</dd></div>
          </dl>
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-xs text-muted-foreground">
              Memory to use (GB) — browsers report 8 at most, so enter your real figure
              <input
                type="number" min={2} max={512} value={memory}
                onChange={(e) => setMemory(e.target.value)}
                className="touch-target mt-1 block w-28 rounded-md border border-border bg-background px-3 text-sm text-foreground"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={tools} onChange={(e) => setTools(e.target.checked)} />
              Needs tool calling (for the agent features)
            </label>
          </div>

          <p className="text-sm" role="status">
            Ollama:{" "}
            {ollama?.ok ? (
              <span className="text-success">running · {ollama.models.length} model{ollama.models.length === 1 ? "" : "s"} installed</span>
            ) : (
              <span className="text-warning">{ollama?.reason}</span>
            )}
          </p>

          <ul className="space-y-2">
            {picks.slice(0, 4).map((m, i) => (
              <li key={m.id} className={`rounded-md border p-3 ${i === 0 && m.fits ? "border-primary" : "border-border"} ${m.fits ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {m.label}
                  {i === 0 && m.fits && <span className="rounded bg-primary/15 px-2 text-xs text-primary">Best fit</span>}
                  {installed.has(m.id) && <span className="rounded bg-success-soft px-2 text-xs text-success">Installed</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {m.strength} · needs ~{m.needGb} GB · {m.speed} · {m.toolCalling ? "tool calling" : "no tool calling"}
                  {!m.fits && " · too big for this memory"}
                </p>
                <code className="mt-1 block font-mono text-xs">ollama pull {m.id}</code>
              </li>
            ))}
          </ul>

          <details className="text-sm">
            <summary className="cursor-pointer">Ways to make it faster</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {SPEED_TIPS.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
