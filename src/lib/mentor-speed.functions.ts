/**
 * P4.1 / P4.2 — admin-only mentor speed report and Jev tuning suggestions.
 * P4.3 — Jev decision for the local (Ollama) mentor path.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SpeedBucket = { path: string; turns: number; p50: number | null; p90: number | null };
export type MentorSpeed = {
  buckets: SpeedBucket[];
  gatedTurns: number;
  decideP90: number | null;
  decideFailRate: number | null;
  suggestions: string[];
  /** S5 — per-step server time before the reply streams. */
  steps: Array<{ step: string; turns: number; p50: number | null; p90: number | null }>;
};

const STEP_LABELS: Record<string, string> = {
  pre: "Usage check + run record + Jev (parallel)",
  memory: "Learner memory",
  retrieval: "Library search",
  resources: "Clip pick",
  model_open: "Model wait (to stream open)",
  total_to_stream: "Total before first byte",
};

const CURRENT_BUDGET_MS = 700;
const CURRENT_LIBRARY_THRESHOLD = 0.3;

function pct(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}

export const getMentorSpeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MentorSpeed> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 14 * 864e5).toISOString();

    const [runsRes, stepsRes, localRes] = await Promise.all([
      supabaseAdmin
        .from("agent_runs")
        .select("id, metadata")
        .eq("mode", "mentor")
        .gte("created_at", since)
        .limit(2000),
      supabaseAdmin
        .from("agent_steps")
        .select("run_id, role, status, duration_ms, output")
        .in("role", ["router", "decide", "timings"])
        .gte("created_at", since)
        .limit(4000),
      supabaseAdmin
        .from("analytics_events")
        .select("event_name, payload")
        .in("event_name", ["local_mentor_ttft", "mentor_ttfa"])
        .gte("created_at", since)
        .limit(2000),
    ]);

    const router = new Map<string, { routedBy?: string; libraryGated?: boolean }>();
    const decideMs: number[] = [];
    const stepMs: Record<string, number[]> = {};
    let decideTotal = 0;
    let decideFailed = 0;
    for (const s of stepsRes.data ?? []) {
      const out = (s.output ?? {}) as { routedBy?: string; libraryGated?: boolean };
      if (s.role === "timings") {
        for (const [k, v] of Object.entries((s.output ?? {}) as Record<string, unknown>)) {
          if (typeof v === "number" && !k.endsWith("_skipped") && k !== "decide_fallback") (stepMs[k] ??= []).push(v);
        }
        continue;
      }
      if (s.role === "router") router.set(s.run_id, out);
      else {
        decideTotal++;
        if (s.status !== "ok") decideFailed++;
        else if (s.duration_ms != null) decideMs.push(s.duration_ms);
      }
    }

    const by: Record<string, number[]> = { "Cloud · Jev-routed": [], "Cloud · keyword fallback": [], "Ollama (this computer)": [],
      "First sound · live talk": [],
      "First sound · typed": [],
    };
    let gatedTurns = 0;
    for (const r of runsRes.data ?? []) {
      const ttft = (r.metadata as { ttft_ms?: number } | null)?.ttft_ms;
      const rt = router.get(r.id);
      if (rt?.libraryGated) gatedTurns++;
      if (typeof ttft !== "number") continue;
      by[rt?.routedBy === "jev" ? "Cloud · Jev-routed" : "Cloud · keyword fallback"]!.push(ttft);
    }
    for (const e of localRes.data ?? []) {
      const p = e.payload as { ms?: number; live?: boolean } | null;
      if (typeof p?.ms !== "number") continue;
      // T2 — time to first sound sits next to time to first words.
      if (e.event_name === "mentor_ttfa") by[p.live ? "First sound · live talk" : "First sound · typed"]!.push(p.ms);
      else by["Ollama (this computer)"]!.push(p.ms);
    }

    const decideP90 = pct(decideMs, 90);
    const decideFailRate = decideTotal ? decideFailed / decideTotal : null;
    const suggestions: string[] = [];
    if (decideTotal < 50) {
      suggestions.push(`Only ${decideTotal} Jev decisions in 14 days — keep the ${CURRENT_BUDGET_MS} ms budget and ${CURRENT_LIBRARY_THRESHOLD} library threshold until there are 50+.`);
    } else {
      if (decideP90 != null && decideP90 > CURRENT_BUDGET_MS)
        suggestions.push(`Jev's slowest 10% take ${decideP90} ms, over the ${CURRENT_BUDGET_MS} ms budget — raise the budget to about ${Math.ceil(decideP90 / 50) * 50} ms or expect more keyword fallbacks.`);
      else if (decideP90 != null && decideP90 < CURRENT_BUDGET_MS - 250)
        suggestions.push(`Jev answers within ${decideP90} ms for 90% of turns — the budget can drop to about ${Math.ceil((decideP90 + 100) / 50) * 50} ms.`);
      if (decideFailRate != null && decideFailRate > 0.1)
        suggestions.push(`${Math.round(decideFailRate * 100)}% of Jev calls fail — check failures in the agreement panel before relying on it.`);
      const cloudTurns = by["Cloud · Jev-routed"]!.length + by["Cloud · keyword fallback"]!.length;
      if (cloudTurns && gatedTurns / cloudTurns > 0.6)
        suggestions.push(`Library lookup is skipped on ${Math.round((gatedTurns / cloudTurns) * 100)}% of turns — consider lowering the threshold below ${CURRENT_LIBRARY_THRESHOLD} if answers lack citations.`);
      if (!suggestions.length) suggestions.push("Current Jev settings look right for the recorded traffic.");
    }

    return {
      buckets: Object.entries(by).map(([path, v]) => ({ path, turns: v.length, p50: pct(v, 50), p90: pct(v, 90) })),
      gatedTurns,
      decideP90,
      decideFailRate,
      suggestions,
      steps: Object.entries(stepMs)
        .filter(([k]) => k !== "decide")
        .map(([k, v]) => ({ step: STEP_LABELS[k] ?? k, turns: v.length, p50: pct(v, 50), p90: pct(v, 90) }))
        .sort((a, b) => (b.p50 ?? 0) - (a.p50 ?? 0)),
    };
  });

/** P4.3 — the Jev intent + focus for a turn answered by local Ollama. */
export const decideLocalTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { turn: string; hasQuestion: boolean; selectedOption: string | null }) => ({
    turn: String(d?.turn ?? "").slice(0, 2000),
    hasQuestion: Boolean(d?.hasQuestion),
    selectedOption: typeof d?.selectedOption === "string" ? d.selectedOption : null,
  }))
  .handler(async ({ data }) => {
    const { decideTurn } = await import("./agents/decide.server");
    const r = await decideTurn({ ...data, timeoutMs: CURRENT_BUDGET_MS }).catch(() => null);
    return r && r.ok ? { intent: r.intent as string, focus: r.focus as string } : null;
  });
