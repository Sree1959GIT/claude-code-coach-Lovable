import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { logEvent } from "@/lib/analytics";
import { useSession } from "@/hooks/useSession";
import { ThemeToggle } from "@/components/ThemeToggle";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional().default("signin"),
});

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in · Claude Architect Prep" },
      { name: "description", content: "Sign in or create an account to start your Claude Certified Architect Foundations prep." },
      { property: "og:title", content: "Sign in · Claude Architect Prep" },
      { property: "og:description", content: "Sign in or create an account to start your Claude Certified Architect Foundations prep." },
      { property: "og:url", content: "/auth" },
    ],
    links: [{ rel: "canonical", href: "/auth" }],
  }),
});

function AuthPage() {
  const { mode: initialMode } = Route.useSearch();
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    logEvent("page_view", { page: "auth", mode });
  }, [mode]);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [loading, user, navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        await logEvent("signup_started");
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: displayName || undefined },
            emailRedirectTo: window.location.origin + "/dashboard",
          },
        });
        if (error) throw error;
        await logEvent("signup_completed");
        setNotice("Account created. Check your email to confirm, or continue if auto-confirm is on.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await logEvent("login_success", { method: "password" });
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      await logEvent("auth_error", { mode, message: msg });
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    await logEvent("cta_click", { cta: "google_signin" });
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError(result.error instanceof Error ? result.error.message : String(result.error));
      return;
    }
    if (result.redirected) return;
    await logEvent("login_success", { method: "google" });
    navigate({ to: "/dashboard", replace: true });
  }

  async function handleReset() {
    if (!email) {
      setError("Enter your email above first.");
      return;
    }
    setResetting(true);
    setError(null);
    setNotice(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/reset-password",
      });
      if (error) throw error;
      setNotice("Password reset email sent. Check your inbox.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-4">
            <div className="flex h-6 w-6 items-center justify-center bg-primary text-[10px] font-bold text-primary-foreground">
              CCA
            </div>
            <span className="font-mono text-xs font-bold uppercase tracking-tight">
              Foundation Prep
            </span>
          </Link>
          <ThemeToggle />
        </div>
      </nav>

      <main className="mx-auto flex max-w-md flex-col px-6 py-16">
        <div className="mb-8">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
            {mode === "signup" ? "> Init_New_Session" : "> Resume_Session"}
          </div>
          <h1 className="font-mono text-3xl font-bold uppercase tracking-tight">
            {mode === "signup" ? "Create_Account" : "Sign_In"}
          </h1>
        </div>

        <div className="border border-border bg-card p-6">
          <button
            onClick={handleGoogle}
            className="mb-6 flex w-full items-center justify-center gap-3 border border-border py-3 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors hover:bg-secondary"
          >
            <GoogleIcon />
            Continue_With_Google
          </button>

          <div className="mb-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              OR
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmail} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1">
                <label
                  htmlFor="name"
                  className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
                >
                  Display_Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-primary"
                />
              </div>
            )}
            <div className="space-y-1">
              <label
                htmlFor="email"
                className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="password"
                className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-primary"
              />
            </div>

            {error && (
              <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[10px] text-destructive">
                {error}
              </div>
            )}
            {notice && (
              <div className="border border-primary/40 bg-primary/10 px-3 py-2 font-mono text-[10px] text-primary">
                {notice}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-primary py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground shadow-xl shadow-primary/20 disabled:opacity-60"
            >
              {busy ? "Processing..." : mode === "signup" ? "Create_Account" : "Sign_In"}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signup" ? "signin" : "signup");
                setError(null);
                setNotice(null);
              }}
              className="hover:text-foreground"
            >
              {mode === "signup" ? "> Have_Account" : "> Need_Account"}
            </button>
            {mode === "signin" && (
              <button
                type="button"
                onClick={handleReset}
                disabled={resetting}
                className="hover:text-foreground disabled:opacity-60"
              >
                {resetting ? "Sending..." : "Reset_Password"}
              </button>
            )}
          </div>
        </div>

        <Link
          to="/"
          className="mt-8 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          ← Return_Home
        </Link>
      </main>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
