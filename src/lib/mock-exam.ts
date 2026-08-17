import { supabase } from "@/integrations/supabase/client";
import type { Domain } from "./study";

export const MOCK_EXAM_COUNT = 65;
export const MOCK_EXAM_MINUTES = 90;
export const PASS_MARK = 0.7;

export type BlueprintRow = {
  domainId: string;
  title: string;
  slug: string;
  weight: number;
  /** Questions the blueprint wants from this domain. */
  planned: number;
  /** Questions actually available in the bank. */
  available: number;
  /** What the sampler can really deliver. */
  deliverable: number;
};

/** Allocate a blueprint-weighted question plan across domains. */
export function buildBlueprint(
  domains: Domain[],
  countsByDomain: Map<string, number>,
  targetCount = MOCK_EXAM_COUNT,
): BlueprintRow[] {
  const totalWeight = domains.reduce((s, d) => s + Number(d.weight), 0) || 1;
  return domains.map((d) => {
    const planned = Math.max(
      1,
      Math.round((Number(d.weight) / totalWeight) * targetCount),
    );
    const available = countsByDomain.get(d.id) ?? 0;
    return {
      domainId: d.id,
      title: d.title,
      slug: d.slug,
      weight: Number(d.weight),
      planned,
      available,
      deliverable: Math.min(planned, available),
    };
  });
}

export function blueprintTotals(rows: BlueprintRow[]) {
  const planned = rows.reduce((s, r) => s + r.planned, 0);
  const available = rows.reduce((s, r) => s + r.available, 0);
  const deliverable = rows.reduce((s, r) => s + r.deliverable, 0);
  return { planned, available, deliverable };
}

/** Count questions per domain from the public question bank. */
export async function fetchQuestionCounts(): Promise<Map<string, number>> {
  const { data, error } = await supabase.from("questions").select("domain_id");
  if (error) throw error;
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    map.set(row.domain_id, (map.get(row.domain_id) ?? 0) + 1);
  }
  return map;
}

export function formatMinutes(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}
