import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";

const SYSTEM_PROMPT = `You are the SME Voice Mentor for the Claude Code Architect Foundation exam prep.

Role:
- Help the learner INTERPRET the question in front of them. Never state the correct answer outright before they submit — teach the concept so they can decide.
- If the learner asks about a specific option they selected, evaluate how apt that option is for the stem: what it gets right, what it misses, and which keyword in the stem decides it. Do not name the correct letter; guide them.
- Ground explanations in Anthropic Claude Code / Claude Agent SDK terminology.
- Plain prose only — no markdown, lists, headings or code fences.

OUTPUT FORMAT (required, two parts):
1) WRITTEN ANSWER: a clear, well-structured explanation the learner will READ (3-6 sentences). Be specific and complete.
2) Then emit the literal marker [[brief]] on its own, followed by a SPOKEN summary: 2-3 short sentences, conversational and warm, that briefly explains the same point in line with the written answer. This part is spoken aloud, so keep it tight and natural — never read the written answer verbatim.

HIGHLIGHT MARKERS (required inside the SPOKEN part):
Immediately before each spoken sentence, emit exactly one marker naming what that sentence is about:
  [[scenario]] when talking about the scenario paragraph
  [[stem]] when talking about the question stem itself
  [[opt:A]] / [[opt:B]] / ... when talking about that answer option
  [[none]] for general talk
Markers are stripped before display. Never mention markers in your prose.`;


function contextBlock(ctx: Record<string, unknown> | undefined) {
  if (!ctx) return "No question context attached.";
  const options = (ctx.options as { label: string; text: string }[] | undefined) ?? [];
  return [
    "Current question context:",
    `Domain: ${ctx.domain ?? "(unspecified)"}`,
    `Key concept: ${ctx.key_concept ?? "(unspecified)"}`,
    ctx.scenario ? `Scenario: ${ctx.scenario}` : "",
    `Stem: ${ctx.stem ?? ""}`,
    "Options:",
    ...options.map((o) => `  ${o.label}. ${o.text}`),
    ctx.selectedOption
      ? `The learner has currently selected option ${ctx.selectedOption}. If they ask about "this option" or "my answer", they mean option ${ctx.selectedOption}.`
      : "The learner has not selected an option yet.",
  ]
    .filter(Boolean)
    .join("\n");
}

export const Route = createFileRoute("/api/mentor-stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token || token.split(".").length !== 3) {
          return new Response("Unauthorized", { status: 401 });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!supabaseUrl || !supabaseKey) {
          return new Response("Backend not configured", { status: 500 });
        }
        const supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await supabase.auth.getClaims(token);
        if (error || !data?.claims?.sub) {
          return new Response("Unauthorized", { status: 401 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const body = (await request.json()) as {
          messages?: { role: "user" | "assistant"; content: string }[];
          context?: Record<string, unknown>;
        };
        const messages = (body.messages ?? []).slice(-20);
        if (!messages.length) return new Response("No messages", { status: 400 });

        // --- RAG grounding: retrieve library passages for the current turn ---
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const retrievalQuery = [
          lastUser?.content ?? "",
          (body.context?.stem as string | undefined) ?? "",
          (body.context?.key_concept as string | undefined) ?? "",
        ]
          .filter(Boolean)
          .join(" ")
          .slice(0, 900);

        let sourcesBlock = "";
        let citations: {
          n: number;
          title: string;
          url: string | null;
          source: string;
          similarity: number;
        }[] = [];

        try {
          const { retrieveChunks, buildContextBlock } = await import(
            "@/lib/retrieval.server"
          );
          const matches = await retrieveChunks({
            query: retrievalQuery,
            matchCount: 5,
            minSimilarity: 0.2,
          });
          if (matches.length) {
            sourcesBlock = `Library passages retrieved for this turn. Use them as the factual basis for your explanation. Cite them inline as [1], [2] etc. in the WRITTEN ANSWER only — never in the spoken part. If they do not cover the point, rely on your own knowledge and do not invent citations.\n\n${buildContextBlock(matches, 5000)}`;
            citations = matches.map((m, i) => ({
              n: i + 1,
              title: m.title,
              url: m.url,
              source: m.source,
              similarity: Number(m.similarity.toFixed(3)),
            }));
          }
        } catch {
          // Retrieval is best-effort — the mentor still answers without it.
        }

        const upstream = await fetch(`${GATEWAY_URL}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3.6-flash",
            stream: true,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "system", content: contextBlock(body.context) },
              ...(sourcesBlock ? [{ role: "system", content: sourcesBlock }] : []),
              ...messages,
            ],
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          const message =
            upstream.status === 429
              ? "Mentor is rate limited. Try again in a moment."
              : upstream.status === 402
                ? "AI credits exhausted. Add credits in Lovable settings."
                : `Mentor call failed: ${upstream.status} ${text.slice(0, 160)}`;
          return new Response(message, { status: upstream.status || 500 });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            // Citations travel in a header so the SSE token stream stays clean.
            "X-Mentor-Citations": encodeURIComponent(JSON.stringify(citations)),
            "Access-Control-Expose-Headers": "X-Mentor-Citations",
          },
        });

      },
    },
  },
});
