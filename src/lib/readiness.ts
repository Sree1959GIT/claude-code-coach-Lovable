/**
 * Stage 7 sub-task 1 — Exam readiness score model.
 *
 * Pure, dependency-free scoring so it can run on the server (readiness server
 * function) and be unit-reasoned about on the client.
 *
 * readiness = 0.5 * mastery + 0.3 * coverage + 0.2 * recency, scaled 0-100.
 * Each component is computed per exam domain and then blended using the
 * blueprint weight of that domain, so a gap in a heavily weighted domain hurts
 * more than a gap in a light one.
 */

export type ReadinessMasteryRow = {
  question_id: string;
  status: string;
  stability: number;
  reps: number;
  lapses: number;
  last_attempt_at?: string | null;
  last_attempt_correct?: boolean | null;
};

export type ReadinessAttemptRow = {
  question_id: string;
  is_correct: boolean;
  created_at: string;
};

export type ReadinessQuestionRow = { id: string; domain_id: string };

export type ReadinessDomainRow = {
  id: string;
  slug: string;
  title: string;
  weight: number;
};

export type DomainReadiness = {
  domainId: string;
  slug: string;
  title: string;
  /** Blueprint weight (share of the exam), normalized 0-1 across domains. */
  weight: number;
  questionCount: number;
  /** Distinct questions attempted at least once. */
  attemptedCount: number;
  /** 0-100: how strong the retained knowledge is. */
  mastery: number;
  /** 0-100: share of the domain's item bank actually touched. */
  coverage: number;
  /** 0-100: how fresh the practice is (decays over ~21 days). */
  recency: number;
  /** 0-100 blended domain score. */
  score: number;
  /** Rolling accuracy over the domain's attempts, 0-100 (null when untouched). */
  accuracy: number | null;
};

export type ReadinessReport = {
  /** 0-100 overall readiness. */
  score: number;
  band: "not-ready" | "building" | "approaching" | "exam-ready";
  mastery: number;
  coverage: number;
  recency: number;
  totalQuestions: number;
  attemptedQuestions: number;
  lastActivityAt: string | null;
  domains: DomainReadiness[];
  /** Weakest domains first, weighted by blueprint importance. */
  gaps: DomainReadiness[];
};

export const READINESS_WEIGHTS = { mastery: 0.5, coverage: 0.3, recency: 0.2 };

/** Days after which a domain's practice counts as fully stale. */
const RECENCY_HORIZON_DAYS = 21;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const pct = (n: number) => Math.round(clamp01(n) * 100);

/** Per-item retention strength, 0-1, from FSRS-ish mastery state. */
function itemStrength(row: ReadinessMasteryRow): number {
  if (row.status === "mastered") return 1;
  const stability = clamp01(Number(row.stability || 0) / 30);
  const repBoost = clamp01(row.reps / 4) * 0.35;
  const lapsePenalty = clamp01(row.lapses / 5) * 0.3;
  const base = 0.55 * stability + repBoost;
  const lastCorrect = row.last_attempt_correct === true ? 0.15 : 0;
  return clamp01(base + lastCorrect - lapsePenalty);
}

function daysSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (now - t) / 86_400_000);
}

function bandFor(score: number): ReadinessReport["band"] {
  if (score >= 80) return "exam-ready";
  if (score >= 60) return "approaching";
  if (score >= 35) return "building";
  return "not-ready";
}

export function computeReadiness(input: {
  domains: ReadinessDomainRow[];
  questions: ReadinessQuestionRow[];
  mastery: ReadinessMasteryRow[];
  attempts: ReadinessAttemptRow[];
  now?: Date;
}): ReadinessReport {
  const now = (input.now ?? new Date()).getTime();

  const domainOfQuestion = new Map<string, string>();
  for (const q of input.questions) domainOfQuestion.set(q.id, q.domain_id);

  const masteryByQuestion = new Map<string, ReadinessMasteryRow>();
  for (const m of input.mastery) masteryByQuestion.set(m.question_id, m);

  const rawWeightTotal =
    input.domains.reduce((s, d) => s + (Number(d.weight) || 0), 0) || input.domains.length || 1;

  let lastActivity: number | null = null;

  const domains: DomainReadiness[] = input.domains.map((d) => {
    const questionIds = input.questions.filter((q) => q.domain_id === d.id).map((q) => q.id);
    const questionCount = questionIds.length;

    let strengthSum = 0;
    const attemptedIds = new Set<string>();
    for (const id of questionIds) {
      const m = masteryByQuestion.get(id);
      if (!m) continue;
      attemptedIds.add(id);
      strengthSum += itemStrength(m);
    }

    const domainAttempts = input.attempts.filter(
      (a) => domainOfQuestion.get(a.question_id) === d.id,
    );
    for (const a of domainAttempts) attemptedIds.add(a.question_id);

    let newestAttempt: number | null = null;
    let correct = 0;
    for (const a of domainAttempts) {
      if (a.is_correct) correct += 1;
      const t = new Date(a.created_at).getTime();
      if (!Number.isNaN(t) && (newestAttempt === null || t > newestAttempt)) newestAttempt = t;
    }
    if (newestAttempt !== null && (lastActivity === null || newestAttempt > lastActivity)) {
      lastActivity = newestAttempt;
    }

    const mastery = questionCount ? strengthSum / questionCount : 0;
    const coverage = questionCount ? attemptedIds.size / questionCount : 0;
    const stale =
      newestAttempt === null ? null : daysSince(new Date(newestAttempt).toISOString(), now);
    const recency = stale === null ? 0 : clamp01(1 - stale / RECENCY_HORIZON_DAYS);

    const blended =
      READINESS_WEIGHTS.mastery * mastery +
      READINESS_WEIGHTS.coverage * coverage +
      READINESS_WEIGHTS.recency * recency;

    return {
      domainId: d.id,
      slug: d.slug,
      title: d.title,
      weight: (Number(d.weight) || 0) / rawWeightTotal,
      questionCount,
      attemptedCount: attemptedIds.size,
      mastery: pct(mastery),
      coverage: pct(coverage),
      recency: pct(recency),
      score: pct(blended),
      accuracy: domainAttempts.length
        ? Math.round((correct / domainAttempts.length) * 100)
        : null,
    };
  });

  const weightTotal = domains.reduce((s, d) => s + d.weight, 0) || 1;
  const weighted = (pick: (d: DomainReadiness) => number) =>
    Math.round(domains.reduce((s, d) => s + pick(d) * d.weight, 0) / weightTotal);

  const score = weighted((d) => d.score);

  const gaps = [...domains]
    .filter((d) => d.questionCount > 0)
    .sort((a, b) => (a.score - b.score) || b.weight - a.weight);

  return {
    score,
    band: bandFor(score),
    mastery: weighted((d) => d.mastery),
    coverage: weighted((d) => d.coverage),
    recency: weighted((d) => d.recency),
    totalQuestions: input.questions.length,
    attemptedQuestions: domains.reduce((s, d) => s + d.attemptedCount, 0),
    lastActivityAt: lastActivity === null ? null : new Date(lastActivity).toISOString(),
    domains,
    gaps,
  };
}

export const READINESS_BAND_LABEL: Record<ReadinessReport["band"], string> = {
  "not-ready": "Not ready",
  building: "Building",
  approaching: "Approaching",
  "exam-ready": "Exam ready",
};

/* ------------------------------------------------------------------ *
 * Stage 7 sub-task 3 — predicted pass estimate with confidence band.
 * ------------------------------------------------------------------ */

/** Passing mark for the certification, as a percentage. */
export const PASS_MARK = 70;

export type PassEstimate = {
  /** Predicted exam score, 0-100. */
  predicted: number;
  /** Wilson-style confidence band around the prediction. */
  low: number;
  high: number;
  /** Probability of clearing PASS_MARK, 0-100. */
  passProbability: number;
  /** How much evidence backs the estimate, 0-100. */
  confidence: number;
  sampleSize: number;
  label: "Unlikely" | "Borderline" | "Likely" | "Very likely";
};

/**
 * Blends observed blueprint-weighted accuracy with the readiness score.
 * With few attempts the estimate leans on readiness and widens the band.
 */
export function computePassEstimate(
  report: ReadinessReport,
  attempts: { question_id: string; is_correct: boolean }[],
  questionDomain?: Map<string, string>,
): PassEstimate {
  const n = attempts.length;

  // Blueprint-weighted accuracy when we can map attempts to domains.
  let observed: number | null = null;
  if (n > 0) {
    if (questionDomain) {
      let num = 0;
      let den = 0;
      for (const d of report.domains) {
        const rows = attempts.filter((a) => questionDomain.get(a.question_id) === d.domainId);
        if (!rows.length) continue;
        const acc = rows.filter((a) => a.is_correct).length / rows.length;
        num += acc * d.weight;
        den += d.weight;
      }
      observed = den ? (num / den) * 100 : null;
    }
    if (observed === null) {
      observed = (attempts.filter((a) => a.is_correct).length / n) * 100;
    }
  }

  // Evidence weight: ~65 attempts (one full exam) is treated as solid evidence.
  const evidence = clamp01(n / 65);
  const predicted = Math.round(
    observed === null ? report.score : observed * evidence + report.score * (1 - evidence),
  );

  // Band: wide when the sample is small, tightened by coverage.
  const spread = Math.round(
    6 + 26 * (1 - evidence) * (1 - 0.4 * clamp01(report.coverage / 100)),
  );
  const low = Math.max(0, predicted - spread);
  const high = Math.min(100, predicted + spread);

  // Logistic around the pass mark, scaled by the band width.
  const z = (predicted - PASS_MARK) / Math.max(4, spread / 1.6);
  const passProbability = Math.round(100 / (1 + Math.exp(-z)));

  const confidence = pct(evidence * 0.7 + clamp01(report.coverage / 100) * 0.3);

  const label: PassEstimate["label"] =
    passProbability >= 80
      ? "Very likely"
      : passProbability >= 55
        ? "Likely"
        : passProbability >= 35
          ? "Borderline"
          : "Unlikely";

  return { predicted, low, high, passProbability, confidence, sampleSize: n, label };
}

/* ------------------------------------------------------------------ *
 * Stage 7 sub-task 14 — domain confidence self-rating blend.
 * ------------------------------------------------------------------ */

/** How much a 1-5 self-rating can move the displayed readiness score. */
export const CONFIDENCE_BLEND = 0.08;

export type ConfidenceAdjusted = {
  /** Blueprint-weighted self-rated confidence, 0-100 (null when unrated). */
  confidence: number | null;
  /** Readiness score after blending in confidence, 0-100. */
  adjustedScore: number;
  /** adjustedScore - report.score, signed points. */
  delta: number;
  band: ReadinessReport["band"];
  ratedDomains: number;
};

/** Maps a 1-5 rating to a 0-100 confidence value. */
export const ratingToPct = (rating: number) => ((clamp01((rating - 1) / 4)) * 100);

export function applyConfidence(
  report: ReadinessReport,
  ratings: { domain_id: string; rating: number }[],
): ConfidenceAdjusted {
  const byDomain = new Map(ratings.map((r) => [r.domain_id, Number(r.rating)]));

  let num = 0;
  let den = 0;
  let rated = 0;
  for (const d of report.domains) {
    const r = byDomain.get(d.domainId);
    if (!r) continue;
    rated += 1;
    num += ratingToPct(r) * d.weight;
    den += d.weight;
  }

  if (!den) {
    return {
      confidence: null,
      adjustedScore: report.score,
      delta: 0,
      band: report.band,
      ratedDomains: 0,
    };
  }

  const confidence = Math.round(num / den);
  // Only the rated share of the blueprint gets nudged.
  const share = den / (report.domains.reduce((s, d) => s + d.weight, 0) || 1);
  const factor = CONFIDENCE_BLEND * clamp01(share);
  const adjustedScore = Math.round(report.score * (1 - factor) + confidence * factor);

  return {
    confidence,
    adjustedScore,
    delta: adjustedScore - report.score,
    band: bandFor(adjustedScore),
    ratedDomains: rated,
  };
}
