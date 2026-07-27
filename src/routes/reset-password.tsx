import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { logEvent } from "@/lib/analytics";

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
  head: () => ({
    meta: [
      { title: "Reset password · Claude Architect Prep" },
      { name: "description", content: "Set a new password for your Claude Architect Prep account." },
      { property: "og:title", content: "Reset password · Claude Architect Prep" },
      { property: "og:description", content: "Set a new password for your Claude Architect Prep account." },
      { property: "og:url", content: "/reset-password" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "/reset-password" }],
  }),
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await logEvent("password_reset_completed");
      setDone(true);
      setTimeout(() => navigate({ to: "/dashboard", replace: true }), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
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
            {"> Reset_Credentials"}
          </div>
          <h1 className="font-mono text-3xl font-bold uppercase tracking-tight">
            New_Password
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 border border-border bg-card p-6">
          <div className="space-y-1">
            <label
              htmlFor="password"
              className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
            >
              New_Password
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
          {done && (
            <div className="border border-primary/40 bg-primary/10 px-3 py-2 font-mono text-[10px] text-primary">
              Password updated. Redirecting...
            </div>
          )}
          <button
            type="submit"
            disabled={busy || done}
            className="w-full bg-primary py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Updating..." : "Update_Password"}
          </button>
        </form>
      </main>
    </div>
  );
}
