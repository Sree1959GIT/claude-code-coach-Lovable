/**
 * S3 — Student navigation: four destinations (Dashboard, Study, Mock exam,
 * Progress) with a clear current-section marker, a streak chip, the theme
 * toggle and one account menu. Operator tools (Traces, Estimator,
 * Review queue, Admin) live inside the account menu, not the student header.
 */

import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Flame, UserRound } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "./ThemeToggle";
import { logEvent } from "@/lib/analytics";
import { getActivityTimestamps } from "@/lib/streaks.functions";
import { computeStreaks } from "@/lib/streaks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const GOAL_KEY = "ccaf.daily_goal";

const PROGRESS_LINKS = [
  { to: "/analytics", label: "Analytics", hint: "Accuracy by domain" },
  { to: "/mistakes", label: "Mistake bank", hint: "Questions to revisit" },
  { to: "/history", label: "Session history", hint: "Every past session" },
  { to: "/study/report", label: "Readiness report", hint: "Printable summary" },
] as const;

const OPERATOR_LINKS = [
  { to: "/reviews", label: "Review queue" },
  { to: "/traces", label: "Traces" },
  { to: "/estimator", label: "Estimator" },
] as const;

function navClass(active: boolean) {
  return [
    "inline-flex h-9 items-center rounded-md px-3 text-sm transition-colors",
    active
      ? "bg-secondary font-medium text-foreground"
      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
  ].join(" ");
}

function StreakChip() {
  const fetchActivity = useServerFn(getActivityTimestamps);
  const activityQ = useQuery({
    queryKey: ["activity"],
    queryFn: () => fetchActivity(),
    staleTime: 60_000,
  });

  const stored =
    typeof window !== "undefined" ? Number(localStorage.getItem(GOAL_KEY)) : 0;
  const goal = stored > 0 ? stored : 10;
  const summary = computeStreaks(activityQ.data ?? [], goal);
  if (!activityQ.data) return null;

  const hit = summary.goalMet;
  return (
    <span
      title={`Current streak: ${summary.currentStreak} day${summary.currentStreak === 1 ? "" : "s"} · ${summary.todayCount} answered today`}
      className={[
        "hidden items-center gap-1.5 rounded-md border px-2 py-1 text-xs sm:inline-flex",
        hit
          ? "border-transparent bg-success-soft text-success"
          : "border-border text-muted-foreground",
      ].join(" ")}
    >
      <Flame className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="font-mono">{summary.currentStreak}</span>
      <span className="sr-only">day streak</span>
    </span>
  );
}

export function SiteHeader() {
  const { user } = useSession();
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function handleSignOut() {
    await logEvent("logout_click");
    await supabase.auth.signOut();
    await navigate({ to: "/", replace: true });
  }

  const progressActive = PROGRESS_LINKS.some((l) => pathname.startsWith(l.to));
  const studyActive = pathname.startsWith("/study") && pathname !== "/study/report";

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
        <Link to="/" className="flex shrink-0 items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
            CCA
          </div>
          <span className="text-sm font-semibold tracking-tight">Foundation Prep</span>
        </Link>

        {user && (
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
            <Link to="/dashboard" className={navClass(pathname.startsWith("/dashboard"))}>
              Dashboard
            </Link>
            <Link to="/study" className={navClass(studyActive)}>
              Study
            </Link>
            <Link to="/mock-exam" className={navClass(pathname.startsWith("/mock-exam"))}>
              Mock exam
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger className={navClass(progressActive)}>
                Progress
                <ChevronDown className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                {PROGRESS_LINKS.map((link) => (
                  <DropdownMenuItem key={link.to} asChild>
                    <Link to={link.to} className="flex flex-col items-start gap-0.5">
                      <span className="text-sm">{link.label}</span>
                      <span className="text-xs text-muted-foreground">{link.hint}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {user ? (
            <>
              <StreakChip />
              <ThemeToggle />
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Account menu"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <UserRound className="h-4 w-4" aria-hidden="true" />
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
                    {user.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/library">Library</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {isAdmin && (
                    <>
                      <DropdownMenuLabel className="text-xs uppercase tracking-widest text-muted-foreground">
                        Operator tools
                      </DropdownMenuLabel>
                      {OPERATOR_LINKS.map((link) => (
                        <DropdownMenuItem key={link.to} asChild>
                          <Link to={link.to}>{link.label}</Link>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuItem asChild>
                        <Link to="/admin" className="text-primary">
                          Admin console
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onSelect={handleSignOut}>Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <ThemeToggle />
              <Link
                to="/auth"
                search={{ mode: "signin" }}
                className="px-3 text-sm text-muted-foreground hover:text-foreground"
              >
                Sign in
              </Link>
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                onClick={() => logEvent("cta_click", { location: "header", cta: "get_started" })}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
