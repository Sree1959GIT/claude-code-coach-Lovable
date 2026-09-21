import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { logEvent } from "@/lib/analytics";
import { createSeo } from "@/lib/seo";

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
  head: () => createSeo({
    title: "Reset password · Claude Architect Prep",
    description: "Set a new password for your Claude Architect Prep account.",
    path: "/reset-password",
    noIndex: true,
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
      await supabase.auth.signOut();
      setDone(true);
      setTimeout(() => navigate({ to: "/auth", search: { mode: "signin" }, replace: true }), 1500);
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
              Password updated. Returning to Sign_In...
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
