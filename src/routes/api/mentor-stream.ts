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
import { runResourceAgent } from "@/lib/agents/resource.agent.server";
import { runCriticAgent } from "@/lib/agents/critic.agent.server";
import type { Db, AgentIntent } from "@/lib/orchestrator.server";

/**
 * Passes SSE bytes straight through while accumulating the assistant text, so
 * the run row can be closed with a final answer, latency and status. Once the
 * stream completes, the critic agent audits the answer (post-hoc, zero latency).
 */
function makeRunCloser(
  runId: string | null,
  startedAt: number,
  critic: {
    db: Db;
    userId: string;
    stepIndex: number;
    intent: AgentIntent;
    retrievedCount: number;
    answerRevealed: boolean;
  },
) {
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let failed: string | null = null;
  let promptTokens = 0;
  let completionTokens = 0;

  const consume = (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
        };
        answer += json.choices?.[0]?.delta?.content ?? "";
        if (json.usage) {
          promptTokens = json.usage.prompt_tokens ?? promptTokens;
          completionTokens = json.usage.completion_tokens ?? completionTokens;
        }
      } catch {
        // Non-JSON keepalive frames are ignored.
      }
    }
  };

  const close = async (status: "done" | "error") => {
    const verdict = await runCriticAgent({
      answer,
      intent: critic.intent,
      retrievedCount: critic.retrievedCount,
      answerRevealed: critic.answerRevealed,
      trace: { db: critic.db, runId, userId: critic.userId, stepIndex: critic.stepIndex },
    }).catch(() => null);
    await finishRun({
      runId,
      status,
      finalAnswer: answer.slice(0, 8000) || null,
      error: failed,
      durationMs: Date.now() - startedAt,
      promptTokens,
      completionTokens,
      ...(verdict
        ? { metadata: { critic: { score: verdict.score, issues: verdict.issues } } }
        : {}),
    }).catch(() => {});
  };



  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      try {
        consume(decoder.decode(chunk, { stream: true }));
      } catch {
        // Accounting must never break delivery.
      }
    },
    async flush() {
      await close(failed ? "error" : "done");
    },
    async cancel(reason: unknown) {
      failed = typeof reason === "string" ? reason : "stream cancelled";
      await close("error");
    },
  } as Transformer<Uint8Array, Uint8Array>);
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
            // Sub-task 15: recall earlier mentor turns, except on filler turns.
            includeThread: plan.intent !== "smalltalk",
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


        // --- 3. Resource agent (cheap, deterministic) --------------------------
        const resourcePick = await runResourceAgent({
          message: turn,
          context,
          intent: plan.intent,
          retrievalTitles: (retrieval?.matches ?? []).map((m) => m.title),
          trace: trace(3),
        });

        // --- 4. Answering agent ------------------------------------------------
        const agentArgs = {
          messages,
          context,
          intent: plan.intent,
          retrieval,
          profileNote: profile.note || null,
          trace: trace(4),
        };

        const startedAt = Date.now();
        let stream: ReadableStream<Uint8Array>;
        let degraded: string | null = null;
        try {
          stream =
            plan.intent === "evaluate_option"
              ? await streamEvaluator(agentArgs)
              : await streamExplainer(agentArgs);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Mentor unavailable";
          // Sub-task 16: credits exhausted is unrecoverable — everything else
          // degrades to a deterministic, model-free answer instead of an error.
          if (message.includes("credits")) {
            await finishRun({
              runId,
              status: "error",
              error: message,
              durationMs: Date.now() - startedAt,
            }).catch(() => {});
            return new Response(message, { status: 402 });
          }
          degraded = message;
          await logStep(supabase, {
            runId,
            userId,
            stepIndex: 4,
            agent: "orchestrator",
            role: "fallback",
            input: { intent: plan.intent },
            output: { reason: message },
            status: "error",
            error: message,
          }).catch(() => {});
          stream = textToSseStream(
            buildFallbackAnswer({
              reason: message,
              stem: context?.stem ?? null,
              keyConcept: context?.key_concept ?? null,
              selectedOption: context?.selectedOption ?? null,
              passages: (retrieval?.matches ?? []).map((m) => ({ title: m.title })),
            }),
          );
        }


        // --- 5. Tap the stream: closes the run and runs the critic audit -----
        const tapped = stream.pipeThrough(
          makeRunCloser(runId, startedAt, {
            db: supabase,
            userId,
            stepIndex: 5,
            intent: plan.intent,
            retrievedCount: retrieval?.matches?.length ?? 0,
            answerRevealed: false,
          }),
        );

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
            "X-Mentor-Resources": encodeURIComponent(
              JSON.stringify(resourcePick.resources),
            ),
            "Access-Control-Expose-Headers":
              "X-Mentor-Citations, X-Mentor-Route, X-Mentor-Resources",
          },
        });
      },
    },
  },
});

