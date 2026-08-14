/**
 * Stage 6b sub-task 7 — cron endpoint.
 *
 * Called by the scheduled job runner. Public prefix bypasses site auth, so the
 * handler authenticates the caller itself with the project's anon key sent in
 * the `apikey` header. Returns a library health summary only — never PII.
 */

import { createFileRoute } from "@tanstack/react-router";

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

async function handle() {
  const expected = process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
  return expected;
}

export const Route = createFileRoute("/api/public/cron/refresh-library")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = await handle();
        const provided = request.headers.get("apikey");
        if (!expected || !provided || provided !== expected) return unauthorized();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const [docsRes, chunksRes, missingRes] = await Promise.all([
          supabaseAdmin.from("library_documents").select("id, updated_at"),
          supabaseAdmin.from("library_chunks").select("id", { count: "exact", head: true }),
          supabaseAdmin
            .from("library_chunks")
            .select("id", { count: "exact", head: true })
            .is("embedding", null),
        ]);

        for (const r of [docsRes, chunksRes, missingRes]) {
          if (r.error) {
            return new Response(JSON.stringify({ error: r.error.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        const docs = docsRes.data ?? [];
        const staleCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const stale = docs.filter((d) => new Date(d.updated_at).getTime() < staleCutoff).length;

        return Response.json({
          ok: true,
          ranAt: new Date().toISOString(),
          documents: docs.length,
          chunks: chunksRes.count ?? 0,
          chunksMissingEmbedding: missingRes.count ?? 0,
          staleDocuments: stale,
        });
      },
    },
  },
});
