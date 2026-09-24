/**
 * G2 — exam switcher. The active exam sits beside the product name with its
 * readiness figure, on every screen, so nobody misreads whose score it is.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, Link2 } from "lucide-react";
import { useActiveExam } from "@/hooks/useActiveExam";
import { getReadiness } from "@/lib/readiness.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ExamSwitcher() {
  const { exams, active, selectExam } = useActiveExam();
  const fetchReadiness = useServerFn(getReadiness);
  const readinessQ = useQuery({
    queryKey: ["readiness", active.id],
    queryFn: () => fetchReadiness({ data: { examId: active.id || null } }),
    staleTime: 60_000,
  });
  const [copied, setCopied] = useState(false);
  async function copyShareLink() {
    const url = `${window.location.origin}/?exam=${encodeURIComponent(active.slug)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  const score = readinessQ.data?.score ?? null;
  const label = active.shortName || active.name;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Active exam: ${active.name}`}
        className="inline-flex h-9 min-w-0 items-center gap-2 rounded-md border border-border px-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <span className="max-w-[9rem] truncate text-foreground">{label}</span>
        {score !== null && (
          <span
            title="Your readiness for this exam"
            className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-foreground"
          >
            {score}%
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Preparing for
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {exams.length === 0 ? (
          <DropdownMenuItem disabled className="flex flex-col items-start gap-0.5">
            <span className="text-sm">{active.name}</span>
            <span className="text-xs text-muted-foreground">Only exam available</span>
          </DropdownMenuItem>
        ) : (
          exams.map((exam) => (
            <DropdownMenuItem
              key={exam.slug}
              onSelect={() => selectExam(exam.slug)}
              className="flex items-start gap-2"
            >
              <Check
                className={[
                  "mt-0.5 h-3.5 w-3.5 shrink-0",
                  exam.slug === active.slug ? "opacity-100" : "opacity-0",
                ].join(" ")}
                aria-hidden="true"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm">{exam.name}</span>
                <span className="text-xs text-muted-foreground">
                  {exam.questionCount} questions · {exam.durationMinutes} min ·{" "}
                  {exam.passMark}% to pass
                  {exam.status !== "ready" ? ` · ${exam.status}` : ""}
                </span>
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void copyShareLink();
          }}
          className="flex items-center gap-2 text-sm"
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          {copied ? "Link copied" : `Share ${label} link`}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
