/**
 * S4 — Mobile bottom bar: Home / Study / Exam / Progress, one thumb-tap away
 * mid-session. Hidden from 768px up, where the header nav takes over.
 */

import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, GraduationCap, Home, Timer } from "lucide-react";

const TABS = [
  { to: "/dashboard", label: "Home", Icon: Home },
  { to: "/study", label: "Study", Icon: GraduationCap },
  { to: "/mock-exam", label: "Exam", Icon: Timer },
  { to: "/analytics", label: "Progress", Icon: BarChart3 },
] as const;

export function MobileTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      data-mobile-tabbar
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-lg">
        {TABS.map(({ to, label, Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                aria-current={active ? "page" : undefined}
                className={[
                  "touch-target flex flex-col items-center justify-center gap-1 py-2 text-xs",
                  active ? "text-primary" : "text-muted-foreground",
                ].join(" ")}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
