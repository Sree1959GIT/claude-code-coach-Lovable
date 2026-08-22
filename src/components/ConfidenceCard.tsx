/**
 * Stage 7 sub-task 14 — per-domain confidence self-rating card.
 * Ratings persist per user and nudge the displayed readiness score slightly.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gauge } from "lucide-react";
import { toast } from "sonner";
import {
  applyConfidence,
  READINESS_BAND_LABEL,
  type ReadinessReport,
} from "@/lib/readiness";
import { getDomainConfidence, setDomainConfidence } from "@/lib/confidence.functions";

const SCALE = [1, 2, 3, 4, 5];
const SCALE_LABEL: Record<number, string> = {
  1: "Lost",
  2: "Shaky",
  3: "OK",
  4: "Solid",
  5: "Confident",
};

export function ConfidenceCard({ readiness }: { readiness?: ReadinessReport }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getDomainConfidence);
  const setFn = useServerFn(setDomainConfidence);

  const ratingsQ = useQuery({
    queryKey: ["domain-confidence"],
    queryFn: () => getFn(),
  });
  const ratings = ratingsQ.data ?? [];

  const save = useMutation({
    mutationFn: (vars: { domainId: string; rating: number }) => setFn({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-confidence"] });
    },
    onError: () => toast.error("Could not save your rating"),
  });

  const byDomain = useMemo(
    () => new Map(ratings.map((r) => [r.domain_id, r.rating])),
    [ratings],
  );

  const adjusted = useMemo(
    () => (readiness ? applyConfidence(readiness, ratings) : null),
    [readiness, ratings],
  );

  return (
    <section className="border border-border bg-card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-primary">
          <Gauge className="h-4 w-4" /> Self_Confidence
        </div>
        {adjusted && adjusted.confidence !== null ? (
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Confidence {adjusted.confidence} · Adjusted readiness{" "}
            <span className="text-foreground">{adjusted.adjustedScore}</span>{" "}
            <span className={adjusted.delta >= 0 ? "text-primary" : "text-destructive"}>
              ({adjusted.delta >= 0 ? "+" : ""}
              {adjusted.delta})
            </span>{" "}
            · {READINESS_BAND_LABEL[adjusted.band]}
          </div>
        ) : (
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Rate each domain to refine your readiness
          </div>
        )}
      </div>

      {!readiness ? (
        <p className="font-mono text-xs text-muted-foreground">Loading domains…</p>
      ) : (
        <div className="space-y-3">
          {readiness.domains.map((d) => {
            const current = byDomain.get(d.domainId);
            return (
              <div
                key={d.domainId}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-foreground">{d.title}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Measured {d.score} · {Math.round(d.weight * 100)}% of exam
                    {current ? ` · You: ${SCALE_LABEL[current]}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1" role="group" aria-label={`Confidence for ${d.title}`}>
                  {SCALE.map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-label={`${d.title}: ${SCALE_LABEL[n]}`}
                      aria-pressed={current === n}
                      disabled={save.isPending}
                      onClick={() => save.mutate({ domainId: d.domainId, rating: n })}
                      className={`h-8 w-8 border font-mono text-xs transition-colors ${
                        current === n
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
