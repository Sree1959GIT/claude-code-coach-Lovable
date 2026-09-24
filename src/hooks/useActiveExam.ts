/**
 * G2 — active exam selection.
 *
 * The exam a learner is preparing for is context, not brand: it sits beside
 * the product name in the header. The choice is remembered per browser so
 * every screen agrees on whose score is being shown.
 */

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchExams, FALLBACK_EXAM, type Exam } from "@/lib/exams";

const ACTIVE_EXAM_KEY = "ccaf.active_exam";

function readStoredSlug(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACTIVE_EXAM_KEY);
  } catch {
    return null;
  }
}

export function useExams() {
  return useQuery({
    queryKey: ["exams"],
    queryFn: fetchExams,
    staleTime: 10 * 60 * 1000,
  });
}

export function useActiveExam() {
  const examsQ = useExams();
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    // G5 — a shared link (?exam=slug) selects that exam and is remembered.
    let shared: string | null = null;
    try {
      shared = new URLSearchParams(window.location.search).get("exam");
    } catch {
      /* ignore */
    }
    if (shared) {
      try {
        localStorage.setItem(ACTIVE_EXAM_KEY, shared);
      } catch {
        /* storage unavailable */
      }
      setSlug(shared);
    } else {
      setSlug(readStoredSlug());
    }
  }, []);

  const exams = examsQ.data ?? [];
  const active: Exam =
    exams.find((e) => e.slug === slug) ?? exams[0] ?? FALLBACK_EXAM;

  const selectExam = useCallback((next: string) => {
    setSlug(next);
    try {
      localStorage.setItem(ACTIVE_EXAM_KEY, next);
    } catch {
      /* storage unavailable — selection lasts for this page only */
    }
  }, []);

  return { exams, active, selectExam, loading: examsQ.isLoading };
}
