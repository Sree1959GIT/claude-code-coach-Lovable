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
          <div className="flex h-6 w-6 items-center justify-center bg-primary text-[10px] font-bold text-primary-foreground">
            CCA
          </div>
          <span className="font-mono text-xs font-bold tracking-tight uppercase">
            Foundation Prep
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <ThemeToggle />
          {user ? (
            <>
              <Link
                to="/study"
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                activeProps={{ className: "font-mono text-[10px] uppercase tracking-widest text-foreground" }}
              >
                Study
              </Link>
              <Link
                to="/mock-exam"
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                activeProps={{ className: "font-mono text-[10px] uppercase tracking-widest text-foreground" }}
              >
                Mock_Exam
              </Link>
              <Link
                to="/analytics"
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                activeProps={{ className: "font-mono text-[10px] uppercase tracking-widest text-foreground" }}
              >
                Analytics
              </Link>
              <Link
                to="/estimator"
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                activeProps={{ className: "font-mono text-[10px] uppercase tracking-widest text-foreground" }}
              >
                Estimator
              </Link>
              <Link
                to="/library"
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                activeProps={{ className: "font-mono text-[10px] uppercase tracking-widest text-foreground" }}
              >
                Library
              </Link>
              <Link
                to="/traces"
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                activeProps={{ className: "font-mono text-[10px] uppercase tracking-widest text-foreground" }}
              >
                Traces
              </Link>
              <Link
                to="/dashboard"
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                activeProps={{ className: "font-mono text-[10px] uppercase tracking-widest text-foreground" }}
              >
                Dashboard
              </Link>
              {isAdmin && (
                <Link
                  to="/admin"
                  className="font-mono text-[10px] uppercase tracking-widest text-primary hover:text-foreground"
                  activeProps={{ className: "font-mono text-[10px] uppercase tracking-widest text-foreground" }}
                >
                  Admin
                </Link>
              )}

              <button
                onClick={handleSignOut}
                className="bg-primary px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground"
              >
                Sign_Out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/auth"
                search={{ mode: "signin" }}
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                Sign In
              </Link>
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                onClick={() => logEvent("cta_click", { location: "header", cta: "get_started" })}
                className="bg-primary px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground"
              >
                Get_Started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
