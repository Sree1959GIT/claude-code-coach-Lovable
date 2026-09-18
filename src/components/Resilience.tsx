/**
 * Phase H3 — resiliency boundaries.
 *
 * Shared skeleton placeholders, error states with retry, and route-level
 * pending/error boundary components. Everything here is presentational:
 * no data fetching, no business logic.
 */

import type { ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { AlertTriangle, RotateCw } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { cn } from "@/lib/utils";

/** A single shimmering placeholder bar. */
export function SkeletonBar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-sm bg-muted", className)}
    />
  );
}

/** Stacked text lines of decreasing width. */
export function SkeletonLines({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBar
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-2/5" : i % 2 ? "w-4/5" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Bordered card placeholders in a responsive grid. */
export function SkeletonCards({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-border bg-card p-4">
          <SkeletonBar className="h-2 w-1/2" />
          <SkeletonBar className="mt-3 h-6 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/** Table-shaped placeholder used while rows load. */
export function SkeletonTable({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading data"
      className={cn("border border-border bg-card", className)}
    >
      <div className="flex gap-4 border-b border-border px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonBar key={i} className="h-2 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-border/60 px-4 py-3 last:border-b-0">
          {Array.from({ length: columns }).map((_, c) => (
            <SkeletonBar key={c} className="h-3 flex-1" style={undefined} />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Whole-page skeleton used as a route pendingComponent. */
export function PageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <div
          role="status"
          aria-live="polite"
          aria-label={`${label}…`}
          className="animate-enter space-y-6"
        >
          <div>
            <SkeletonBar className="h-2 w-32" />
            <SkeletonBar className="mt-3 h-7 w-64" />
            <SkeletonBar className="mt-2 h-3 w-80" />
          </div>
          <SkeletonCards />
          <SkeletonTable rows={6} />
          <span className="sr-only">{label}…</span>
        </div>
      </main>
    </div>
  );
}

function friendlyMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (/failed to fetch|networkerror|load failed/i.test(raw))
    return "We couldn't reach the server. Check your connection and try again.";
  if (/401|unauthori[sz]ed/i.test(raw)) return "Your session expired. Sign in again to continue.";
  if (/429|rate limit|quota/i.test(raw))
    return "You've hit today's usage limit. Try again a little later.";
  return raw && raw.length < 160 ? raw : "Something went wrong while loading this section.";
}

/** Inline error panel with a retry trigger — for a failed query inside a page. */
export function InlineError({
  title = "Couldn't load this",
  error,
  onRetry,
  retrying,
}: {
  title?: string;
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      role="alert"
      className="border border-destructive/40 bg-destructive/5 p-6 text-center"
    >
      <AlertTriangle className="mx-auto h-5 w-5 text-destructive" aria-hidden="true" />
      <p className="mt-3 font-mono text-[10px] font-bold uppercase tracking-widest text-destructive">
        {title}
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {friendlyMessage(error)}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-4 inline-flex items-center gap-2 border border-border bg-background px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-secondary disabled:opacity-50"
        >
          <RotateCw className={cn("h-3.5 w-3.5", retrying && "animate-spin")} aria-hidden="true" />
          {retrying ? "Retrying…" : "Try_Again"}
        </button>
      )}
    </div>
  );
}

/** Full-page error boundary view used as a route errorComponent. */
export function RouteErrorView({
  error,
  reset,
  children,
}: {
  error: unknown;
  reset?: () => void;
  children?: ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-4 py-24">
        <InlineError
          title="This page didn't load"
          error={error}
          onRetry={() => {
            void router.invalidate();
            reset?.();
          }}
        />
        {children}
      </main>
    </div>
  );
}

/** Convenience factory for `errorComponent` in a route definition. */
export function routeErrorComponent({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return <RouteErrorView error={error} reset={reset} />;
}
