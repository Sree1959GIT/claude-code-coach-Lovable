/**
 * Sub-task 7 — Mentor stream wired through the multi-agent orchestrator.
 * Route plan → memory agent → retrieval agent → explainer or evaluator stream.
 * Tracing is best-effort and never blocks the response.
 */

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { planRoute, startRun, logStep, finishRun } from "@/lib/orchestrator.server";
import { runMemoryAgent } from "@/lib/agents/memory.agent.server";
import { runRetrievalAgent } from "@/lib/agents/retrieval.agent.server";
import { streamExplainer, type QuestionContext } from "@/lib/agents/explainer.agent.server";
import { streamEvaluator } from "@/lib/agents/evaluator.agent.server";

export const Route = createFileRoute("/api/mentor-stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token || token.split(".").length !== 3) {
          return new Response("Unauthorized", { status: 401 });
        }

        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !supabaseKey) {
          return new Response("Backend not configured", { status: 500 });
        }
        const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data, error } = await supabase.auth.getClaims(token);
        const userId = data?.claims?.sub as string | undefined;
        if (error || !userId) return new Response("Unauthorized", { status: 401 });

        if (!process.env["LOVABLE_API_KEY"]) {
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }

        const body = (await request.json()) as {
          messages?: { role: "user" | "assistant"; content: string }[];
          context?: QuestionContext | null;
        };
        const messages = (body.messages ?? []).slice(-20);
        if (!messages.length) return new Response("No messages", { status: 400 });

        const context = body.context ?? null;
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const turn = lastUser?.content ?? "";

        // --- 1. Route the turn -------------------------------------------------
        const plan = planRoute(turn, {
          selectedOption: context?.selectedOption ?? null,
          hasQuestion: Boolean(context?.stem),
        });

        const runId = await startRun(supabase, {
          userId,
          mode: "mentor",
          question: turn.slice(0, 2000),
          metadata: { intent: plan.intent, agents: plan.agents, reason: plan.reason },
        }).catch(() => null);

        const trace = (stepIndex: number) => ({ db: supabase, runId, userId, stepIndex });

        await logStep(supabase, {
          runId,
          userId,
          stepIndex: 0,
          agent: "orchestrator",
          role: "router",
          input: { turn: turn.slice(0, 500), selectedOption: context?.selectedOption ?? null },
          output: plan,
        }).catch(() => {});

        // --- 2. Memory + retrieval (parallel) ---------------------------------
        const [profile, retrieval] = await Promise.all([
          runMemoryAgent({
            db: supabase,
            userId,
            intent: plan.intent,
            currentDomain: context?.domain ?? null,
            trace: { runId, stepIndex: 1 },
          }),
          plan.useRetrieval
            ? runRetrievalAgent({
                message: turn,
                context,
                intent: plan.intent,
                trace: trace(2),
              })
            : Promise.resolve(null),
        ]);

        // --- 3. Answering agent ------------------------------------------------
        const agentArgs = {
          messages,
          context,
          intent: plan.intent,
          retrieval,
          profileNote: profile.note || null,
          trace: trace(3),
        };

        const startedAt = Date.now();
        let stream: ReadableStream<Uint8Array>;
        try {
          stream =
            plan.intent === "evaluate_option"
              ? await streamEvaluator(agentArgs)
              : await streamExplainer(agentArgs);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Mentor unavailable";
          const status = message.includes("rate limited")
            ? 429
            : message.includes("credits")
              ? 402
              : 500;
          await finishRun({
            runId,
            status: "error",
            error: message,
            durationMs: Date.now() - startedAt,
          }).catch(() => {});
          return new Response(message, { status });
        }

        // --- 4. Tap the stream so the run row closes with the final answer ----
        const tapped = stream.pipeThrough(makeRunCloser(runId, startedAt));

        return new Response(tapped, {

          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            // Metadata travels in headers so the SSE token stream stays clean.
            "X-Mentor-Citations": encodeURIComponent(
              JSON.stringify(retrieval?.citations ?? []),
            ),
            "X-Mentor-Route": encodeURIComponent(
              JSON.stringify({ intent: plan.intent, agents: plan.agents, runId }),
            ),
            "Access-Control-Expose-Headers": "X-Mentor-Citations, X-Mentor-Route",
          },
        });
      },
    },
  },
});

