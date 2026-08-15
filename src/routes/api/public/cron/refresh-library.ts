/**
 * Stage 6b sub-tasks 7 & 8 — cron endpoint.
 *
 * Called by the scheduled job runner. Public prefix bypasses site auth, so the
 * handler authenticates the caller itself with the project's anon key sent in
 * the `apikey` header. Re-embeds library chunks that are missing vectors and
 * logs a `job_runs` row. Returns a health summary only — never PII.
 */

import { createFileRoute } from "@tanstack/react-router";

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/cron/refresh-library")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected =
          process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
        const provided = request.headers.get("apikey");
        if (!expected || !provided || provided !== expected) return unauthorized();

        const { runLibraryRefresh } = await import("@/lib/jobs.server");
        const result = await runLibraryRefresh("refresh-library");

        return Response.json(result, { status: result.ok ? 200 : 500 });
      },
    },
  },
});
