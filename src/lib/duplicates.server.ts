/**
 * Stage 8 sub-task 8.3 — duplicate / near-duplicate question detector.
 *
 * Server-only. Embeds each question's canonical text (scenario + stem +
 * option texts), caches the vector in `question_embeddings` keyed by a
 * content hash, then compares every pair by cosine similarity.
 */

import { embedTexts, toVectorLiteral, EMBEDDING_MODEL } from "./embeddings.server";
import { sha256 } from "./ingest.server";

export type DuplicatePair = {
  similarity: number;
  a: { id: string; stem: string; domainId: string; domainTitle: string };
  b: { id: string; stem: string; domainId: string; domainTitle: string };
  sameDomain: boolean;
};

export type DuplicateScan = {
  scannedAt: string;
  questions: number;
  embedded: number;
  reused: number;
  threshold: number;
  pairs: DuplicatePair[];
};

/** Max questions embedded in one scan run, to keep the request bounded. */
const MAX_EMBED = 120;
const MAX_PAIRS = 50;

function canonicalText(stem: string, scenario: string | null, options: string[]): string {
  return [scenario ?? "", stem, ...options].join("\n").replace(/\s+/g, " ").trim().toLowerCase();
}

function parseVector(value: unknown): number[] {
  if (Array.isArray(value)) return value as number[];
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as number[];
    } catch {
      return [];
    }
  }
  return [];
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function scanDuplicates(threshold = 0.9): Promise<DuplicateScan> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [questionsRes, optionsRes, domainsRes, cachedRes] = await Promise.all([
    supabaseAdmin.from("questions").select("id, domain_id, stem, scenario"),
    supabaseAdmin.from("question_options").select("question_id, text, sort_order").order("sort_order"),
    supabaseAdmin.from("domains").select("id, title"),
    supabaseAdmin.from("question_embeddings").select("question_id, content_hash, model, embedding"),
  ]);
  for (const r of [questionsRes, optionsRes, domainsRes, cachedRes]) {
    if (r.error) throw r.error;
  }

  const domainTitle = new Map((domainsRes.data ?? []).map((d) => [d.id, d.title]));
  const optionsBy = new Map<string, string[]>();
  for (const o of optionsRes.data ?? []) {
    const list = optionsBy.get(o.question_id) ?? [];
    list.push(o.text);
    optionsBy.set(o.question_id, list);
  }

  const cached = new Map(
    (cachedRes.data ?? []).map((r) => [
      r.question_id,
      { hash: r.content_hash, model: r.model, vector: parseVector(r.embedding) },
    ]),
  );

  const questions = questionsRes.data ?? [];
  const prepared: { id: string; stem: string; domainId: string; hash: string; text: string }[] = [];
  for (const q of questions) {
    const text = canonicalText(q.stem, q.scenario, optionsBy.get(q.id) ?? []);
    if (!text) continue;
    prepared.push({ id: q.id, stem: q.stem, domainId: q.domain_id, hash: await sha256(text), text });
  }

  const stale = prepared.filter((p) => {
    const c = cached.get(p.id);
    return !c || c.hash !== p.hash || c.model !== EMBEDDING_MODEL || c.vector.length === 0;
  });

  const toEmbed = stale.slice(0, MAX_EMBED);
  if (toEmbed.length > 0) {
    const vectors = await embedTexts(toEmbed.map((p) => p.text));
    const rows = toEmbed.map((p, i) => ({
      question_id: p.id,
      content_hash: p.hash,
      model: EMBEDDING_MODEL,
      embedding: toVectorLiteral(vectors[i]!) as unknown as string,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabaseAdmin
      .from("question_embeddings")
      .upsert(rows, { onConflict: "question_id" });
    if (error) throw error;
    toEmbed.forEach((p, i) => {
      cached.set(p.id, { hash: p.hash, model: EMBEDDING_MODEL, vector: vectors[i]! });
    });
  }

  const usable = prepared
    .map((p) => ({ ...p, vector: cached.get(p.id)?.vector ?? [] }))
    .filter((p) => p.vector.length > 0 && cached.get(p.id)?.hash === p.hash);

  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const a = usable[i]!;
      const b = usable[j]!;
      const sim = cosine(a.vector, b.vector);
      if (sim < threshold) continue;
      pairs.push({
        similarity: Math.round(sim * 1000) / 1000,
        a: { id: a.id, stem: a.stem, domainId: a.domainId, domainTitle: domainTitle.get(a.domainId) ?? "—" },
        b: { id: b.id, stem: b.stem, domainId: b.domainId, domainTitle: domainTitle.get(b.domainId) ?? "—" },
        sameDomain: a.domainId === b.domainId,
      });
    }
  }
  pairs.sort((x, y) => y.similarity - x.similarity);

  return {
    scannedAt: new Date().toISOString(),
    questions: prepared.length,
    embedded: toEmbed.length,
    reused: usable.length - toEmbed.length,
    threshold,
    pairs: pairs.slice(0, MAX_PAIRS),
  };
}
