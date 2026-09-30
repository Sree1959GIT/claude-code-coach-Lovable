/**
 * L4b — admin-only Jev vs keyword-router agreement report (read-only).
 * Routing is untouched; this only summarises shadow `decide` trace steps.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type JevAgreement = {
  total: number;
  recorded: number;
  agrees: number;
  failed: number;
  avgMs: number | null;
  byIntent: { intent: string; total: number; agrees: number }[];
  disagreements: {
    at: string;
    turn: string | null;
    keywordIntent: string;
    jevIntent: string;
    confidence: number | null;
  }[];
  failures: { at: string; reason: string }[];
};

type Row = {
  created_at: string;
  status: string;
  error: string | null;
  duration_ms: number | null;
  input: { keywordIntent?: string; turn?: string } | null;
  output: { intent?: string; agrees?: boolean; intentConfidence?: number | null } | null;
};

export const getJevAgreement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<JevAgreement> => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) throw new Error("Forbidden");

    const { data, error } = await context.supabase
      .from("agent_steps")
      .select("created_at,status,error,duration_ms,input,output")
      .eq("role", "decide")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Row[];

    const ok = rows.filter((r) => r.status === "ok" && r.output?.intent);
    const agrees = ok.filter((r) => r.output?.agrees).length;
    const durations = ok.map((r) => r.duration_ms).filter((v): v is number => v != null);
    const groups = new Map<string, { total: number; agrees: number }>();
    for (const r of ok) {
      const k = r.input?.keywordIntent ?? "unknown";
      const g = groups.get(k) ?? { total: 0, agrees: 0 };
      g.total++;
      if (r.output?.agrees) g.agrees++;
      groups.set(k, g);
    }
    return {
      total: rows.length,
      recorded: ok.length,
      agrees,
      failed: rows.length - ok.length,
      avgMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      byIntent: [...groups.entries()]
        .map(([intent, g]) => ({ intent, ...g }))
        .sort((a, b) => a.agrees / a.total - b.agrees / b.total),
      disagreements: ok
        .filter((r) => !r.output?.agrees)
        .slice(0, 20)
        .map((r) => ({
          at: r.created_at,
          turn: r.input?.turn ?? null,
          keywordIntent: r.input?.keywordIntent ?? "unknown",
          jevIntent: r.output?.intent ?? "unknown",
          confidence: r.output?.intentConfidence ?? null,
        })),
      failures: rows
        .filter((r) => r.status !== "ok")
        .slice(0, 5)
        .map((r) => ({ at: r.created_at, reason: r.error ?? "unknown" })),
    };
  });
