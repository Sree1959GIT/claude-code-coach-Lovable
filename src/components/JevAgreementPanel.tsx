import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getJevAgreement } from "@/lib/jev-agreement.functions";

const MIN_SAMPLE = 50;

/** L4b — admin-only review of Jev (shadow) vs the keyword router. Read-only. */
export function JevAgreementPanel() {
  const fetchIt = useServerFn(getJevAgreement);
  const q = useQuery({ queryKey: ["jev_agreement"], queryFn: () => fetchIt(), retry: false });

  if (q.error) {
    // Non-admins get Forbidden — hide the panel entirely.
    return null;
  }
  if (q.isLoading || !q.data) {
    return <p className="mt-6 font-mono text-xs text-muted-foreground">Loading Jev agreement…</p>;
  }
  const d = q.data;
  const pct = d.recorded ? Math.round((d.agrees / d.recorded) * 100) : null;

  return (
    <section className="mt-8 border border-border bg-card" aria-labelledby="jev-heading">
      <div className="border-b border-border px-4 py-3">
        <h2 id="jev-heading" className="font-mono text-sm font-bold uppercase tracking-widest">
          Jev vs keyword routing
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Jev runs in the background only. The keyword router still decides every turn.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
        {[
          ["Decisions", String(d.recorded)],
          ["Agreement", pct == null ? "—" : `${pct}%`],
          ["Failed", String(d.failed)],
          ["Avg speed", d.avgMs == null ? "—" : `${d.avgMs}ms`],
        ].map(([l, v]) => (
          <div key={l} className="bg-card p-4">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{l}</p>
            <p className="mt-1 font-mono text-lg font-bold">{v}</p>
          </div>
        ))}
      </div>

      <p className="border-t border-border px-4 py-3 text-sm">
        {d.recorded < MIN_SAMPLE
          ? `Not enough data yet: ${d.recorded} of ${MIN_SAMPLE} decisions recorded. Ask the mentor a few more questions.`
          : `Agreement is ${pct}% over ${d.recorded} decisions. This is for review only. Switching routing is your call.`}
      </p>

      {d.byIntent.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">By question type</h3>
          <ul className="mt-2 space-y-1">
            {d.byIntent.map((g) => (
              <li key={g.intent} className="flex justify-between font-mono text-xs">
                <span>{g.intent}</span>
                <span>
                  {g.agrees}/{g.total} · {Math.round((g.agrees / g.total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.disagreements.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Recent disagreements</h3>
          <ul className="mt-2 space-y-2">
            {d.disagreements.map((x) => (
              <li key={x.at} className="text-sm">
                <p className="truncate">{x.turn ?? "(message not recorded)"}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  keyword: {x.keywordIntent} · Jev: {x.jevIntent}
                  {x.confidence != null ? ` (${Math.round(x.confidence * 100)}%)` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.failures.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Recent failures</h3>
          <ul className="mt-2 space-y-1">
            {d.failures.map((f) => (
              <li key={f.at} className="font-mono text-xs text-destructive">{f.reason}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
