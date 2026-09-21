import { Link, useNavigate } from "@tanstack/react-router";
import { useSession } from "@/hooks/useSession";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "./ThemeToggle";
import { logEvent } from "@/lib/analytics";

export function SiteHeader() {
  const { user } = useSession();
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();


  async function handleSignOut() {
    await logEvent("logout_click");
    await supabase.auth.signOut();
    await navigate({ to: "/", replace: true });
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-4">
          <div className="flex h-6 w-6 items-center justify-center bg-primary text-xs font-bold text-primary-foreground">
            CCA
          </div>
          <span className="text-sm font-semibold tracking-tight">
            Foundation Prep
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <ThemeToggle />
          {user ? (
            <>
              <Link
                to="/study"
                className="text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-sm font-medium text-foreground" }}
              >
                Study
              </Link>
              <Link
                to="/mock-exam"
                className="text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-sm font-medium text-foreground" }}
              >
                Mock exam
              </Link>
              <Link
                to="/mistakes"
                className="text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-sm font-medium text-foreground" }}
              >
                Mistakes
              </Link>
              <Link
                to="/history"
                className="text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-sm font-medium text-foreground" }}
              >
                History
              </Link>
              <Link
                to="/analytics"
                className="text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-sm font-medium text-foreground" }}
              >
                Analytics
              </Link>
              <Link
                to="/estimator"
                className="text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-sm font-medium text-foreground" }}
              >
                Estimator
              </Link>
              <Link
                to="/library"
                className="text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-sm font-medium text-foreground" }}
              >
                Library
              </Link>
              <Link
                to="/traces"
                className="text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-sm font-medium text-foreground" }}
              >
                Traces
              </Link>
              <Link
                to="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-sm font-medium text-foreground" }}
              >
                Dashboard
              </Link>
              {isAdmin && (
                <Link
                  to="/admin"
                  className="text-sm text-primary hover:text-foreground"
                  activeProps={{ className: "text-sm font-medium text-foreground" }}
                >
                  Admin
                </Link>
              )}

              <button
                onClick={handleSignOut}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/auth"
                search={{ mode: "signin" }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Sign In
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
