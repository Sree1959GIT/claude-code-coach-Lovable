import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMentorSpeed } from "@/lib/mentor-speed.functions";

/** P4.1 / P4.2 — admin-only: time to first words by path, plus Jev tuning hints. */
export function MentorSpeedPanel() {
  const fetchIt = useServerFn(getMentorSpeed);
  const q = useQuery({ queryKey: ["mentor_speed"], queryFn: () => fetchIt(), retry: false });
  if (q.error) return null;
  if (q.isLoading || !q.data) {
    return <p className="mt-6 text-xs text-muted-foreground">Loading mentor speed…</p>;
  }
  const d = q.data;
  const ms = (v: number | null) => (v == null ? "—" : `${v} ms`);
  return (
    <section className="mt-8 border border-border bg-card" aria-labelledby="speed-heading">
      <div className="border-b border-border px-4 py-3">
        <h2 id="speed-heading" className="text-sm font-bold uppercase tracking-widest">
          Mentor speed (last 14 days)
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Time until the first words appear, by how the turn was answered.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-normal">Path</th>
            <th className="px-4 py-2 font-normal">Turns</th>
            <th className="px-4 py-2 font-normal">Typical</th>
            <th className="px-4 py-2 font-normal">Slowest 10%</th>
          </tr>
        </thead>
        <tbody>
          {d.buckets.map((b) => (
            <tr key={b.path} className="border-t border-border">
              <td className="px-4 py-2">{b.path}</td>
              <td className="px-4 py-2 font-mono">{b.turns}</td>
              <td className="px-4 py-2 font-mono">{ms(b.p50)}</td>
              <td className="px-4 py-2 font-mono">{ms(b.p90)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border px-4 py-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Library skipped on {d.gatedTurns} turns · Jev slowest 10%: {ms(d.decideP90)} · Jev failures:{" "}
          {d.decideFailRate == null ? "—" : `${Math.round(d.decideFailRate * 100)}%`}
        </p>
        <h3 className="mt-3 text-xs font-bold uppercase tracking-widest">Tuning suggestions</h3>
        <ul className="mt-1 list-disc pl-5">
          {d.suggestions.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
