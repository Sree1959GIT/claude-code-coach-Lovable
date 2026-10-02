/**
 * Sub-task 7 — Mentor stream wired through the multi-agent orchestrator.
 * Route plan → memory agent → retrieval agent → explainer or evaluator stream.
 * Tracing is best-effort and never blocks the response.
 */

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { planRoute, planForIntent, startRun, logStep, finishRun } from "@/lib/orchestrator.server";
import { runMemoryAgent } from "@/lib/agents/memory.agent.server";
import { runRetrievalAgent } from "@/lib/agents/retrieval.agent.server";
import { streamExplainer, type QuestionContext } from "@/lib/agents/explainer.agent.server";
import { streamEvaluator } from "@/lib/agents/evaluator.agent.server";
import { runResourceAgent } from "@/lib/agents/resource.agent.server";
import { runCriticAgent } from "@/lib/agents/critic.agent.server";
import { textToSseStream, buildFallbackAnswer } from "@/lib/agents/gateway.server";
import type { Db, AgentIntent } from "@/lib/orchestrator.server";
import { decideTurn, openerFor, focusMarker, type FocusTarget } from "@/lib/agents/decide.server";

/** Phase 1 — encode a text fragment as one SSE delta the mentor panel parses. */
function sseDelta(content: string): Uint8Array {
  return new TextEncoder().encode(
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
  );
}

/** Phase 1 — emit `prefix` immediately, then the model stream. */
function withOpener(prefix: string, rest: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(sseDelta(prefix));
      const reader = rest.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
      } catch {
        /* upstream ended */
      } finally {
        controller.close();
      }
    },
  });
}

/** L3 — context steps get a short budget; a slow one is skipped, not awaited. */
const MEMORY_BUDGET_MS = 700;
const RETRIEVAL_BUDGET_MS = 1100;
/** P2.1 — how long the router waits for Jev before falling back to keywords. */
const DECIDE_BUDGET_MS = 500;
/** P2.2 — below this Jev "needs library" score, retrieval is skipped. */
const NO_LIBRARY_THRESHOLD = 0.3;
function withTimeout<T, F>(p: Promise<T>, ms: number, fallback: F, onSkip: () => void): Promise<T | F> {
  let timer: ReturnType<typeof setTimeout>;
  const late = new Promise<F>((resolve) => {
    timer = setTimeout(() => {
      onSkip();
      resolve(fallback);
    }, ms);
  });
  return Promise.race([p.catch(() => fallback), late]).finally(() => clearTimeout(timer));
}

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
    requestStartedAt: number;
  },
) {
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let failed: string | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  // L3 — time to first written word, measured from the request start.
  let firstTokenAt: number | null = null;

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
        const delta = json.choices?.[0]?.delta?.content ?? "";
        if (delta && firstTokenAt === null) firstTokenAt = Date.now();
        answer += delta;
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
      ...(verdict || firstTokenAt
        ? {
            metadata: {
              ...(verdict ? { critic: { score: verdict.score, issues: verdict.issues } } : {}),
              ...(firstTokenAt ? { ttft_ms: firstTokenAt - critic.requestStartedAt } : {}),
            },
          }
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

        // A1 — per-stage timings, returned in a Server-Timing header.
        const t0 = Date.now();
        const timings: Record<string, number> = {};
        const mark = (name: string, since: number) => {
          timings[name] = Date.now() - since;
        };

        const context = body.context ?? null;
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const turn = lastUser?.content ?? "";

        // --- 1. Route the turn ------------------------------------------------
        // Keyword plan is the instant fallback; Jev starts now so it overlaps
        // the quota check and run start (P2.1).
        const keywordPlan = planRoute(turn, {
          selectedOption: context?.selectedOption ?? null,
          hasQuestion: Boolean(context?.stem),
        });
        let plan = keywordPlan;
        const decidePromise = decideTurn({
          turn,
          hasQuestion: Boolean(context?.stem),
          selectedOption: context?.selectedOption ?? null,
        }).catch(() => null);

        // Speed — memory and retrieval start now, in parallel with Jev and the
        // quota check, instead of waiting for routing to finish first.
        const memoryPromise = withTimeout(
          runMemoryAgent({
            db: supabase,
            userId,
            intent: keywordPlan.intent,
            currentDomain: context?.domain ?? null,
            includeThread: keywordPlan.intent !== "smalltalk",
            trace: { runId: null, stepIndex: 1 },
          }),
          MEMORY_BUDGET_MS,
          { note: "" } as { note: string },
          () => (timings["memory_skipped"] = MEMORY_BUDGET_MS),
        );
        const retrievalPromise = keywordPlan.useRetrieval
          ? withTimeout(
              runRetrievalAgent({
                message: turn,
                context,
                intent: keywordPlan.intent,
                trace: { db: supabase, runId: null, userId, stepIndex: 2 },
              }),
              RETRIEVAL_BUDGET_MS,
              null,
              () => (timings["retrieval_skipped"] = RETRIEVAL_BUDGET_MS),
            )
          : Promise.resolve(null);

        // --- 0. Quota check and run start in parallel (A1) ---------------------
        const { getMembershipTier } = await import("@/lib/model-routing.server");
        const { checkQuota, recordRateEvent } = await import("@/lib/rate-limit.server");
        const tPre = Date.now();
        const [quota, runId] = await Promise.all([
          getMembershipTier(supabase as never, userId).then((tier) =>
            checkQuota({ userId, action: "mentor", tier }),
          ),
          startRun(supabase, {
            userId,
            mode: "mentor",
            question: turn.slice(0, 2000),
            metadata: { intent: plan.intent, agents: plan.agents, reason: plan.reason },
          }).catch(() => null),
        ]);
        mark("pre", tPre);
        if (!quota.allowed) {
          void finishRun({ runId, status: "error", error: "rate_limited", durationMs: Date.now() - t0 }).catch(() => {});
          return new Response(quota.message ?? "Rate limit reached.", {
            status: 429,
            headers: {
              "Content-Type": "text/plain",
              ...(quota.retryAfterMs
                ? { "Retry-After": String(Math.ceil(quota.retryAfterMs / 1000)) }
                : {}),
              "X-Mentor-Quota": encodeURIComponent(
                JSON.stringify({
                  limit: quota.limit,
                  remaining: 0,
                  resetAt: quota.resetAt,
                  byok: quota.byok,
                }),
              ),
              "Access-Control-Expose-Headers": "X-Mentor-Quota, Retry-After",
            },
          });
        }
        void recordRateEvent({ userId, action: "mentor", byok: quota.byok });

        const trace = (stepIndex: number) => ({ db: supabase, runId, userId, stepIndex });

        // P2.1 — active Jev router: wait a short budget, else keyword fallback.
        const tDecide = Date.now();
        const decision = await Promise.race([
          decidePromise,
          new Promise<null>((r) => setTimeout(() => r(null), DECIDE_BUDGET_MS)),
        ]);
        mark("decide", tDecide);
        const jevOk = decision?.ok ? decision : null;
        const routedBy: "jev" | "keyword" = jevOk ? "jev" : "keyword";
        if (jevOk) plan = planForIntent(jevOk.intent);
        // P2.2 — dynamic library gating: skip lookup when Jev is confident
        // no reference material is needed.
        let libraryGated = false;
        if (
          plan.useRetrieval &&
          jevOk?.needsLibrary != null &&
          jevOk.needsLibrary < NO_LIBRARY_THRESHOLD
        ) {
          plan = { ...plan, useRetrieval: false, agents: plan.agents.filter((a) => a !== "retrieval") };
          libraryGated = true;
        }
        if (!jevOk) timings["decide_fallback"] = 1;

        // Router trace is fire-and-forget — it must not delay the first token.
        void logStep(supabase, {
          runId,
          userId,
          stepIndex: 0,
          agent: "orchestrator",
          role: "router",
          input: { turn: turn.slice(0, 500), selectedOption: context?.selectedOption ?? null },
          output: { ...plan, routedBy, libraryGated, keywordIntent: keywordPlan.intent },
        }).catch(() => {});
        // Agreement still logged to Traces (L4b), whether or not Jev routed.
        void decidePromise
          .then((d) =>
            d
              ? logStep(supabase, {
                  runId,
                  userId,
                  stepIndex: 7,
                  agent: "orchestrator",
                  role: "decide",
                  model: "typesafe/jev-latest",
                  input: {
                    keywordIntent: keywordPlan.intent,
                    keywordRetrieval: keywordPlan.useRetrieval,
                    turn: turn.slice(0, 300),
                  },
                  output: d.ok
                    ? { ...d, agrees: d.intent === keywordPlan.intent, routedBy, libraryGated }
                    : { ...d, routedBy },
                  status: d.ok ? "ok" : "error",
                  error: d.ok ? undefined : d.reason,
                  durationMs: d.ms,
                })
              : undefined,
          )
          .catch((e) => console.error("decide trace failed", e));

        // P2.3 — prompt conditioning from Jev's signals (no data paths change).
        const jevNote = jevOk
          ? [
              `Routing signal: the learner's turn was classified as "${jevOk.intent}"` +
                (jevOk.intentConfidence != null
                  ? ` (confidence ${Math.round(jevOk.intentConfidence * 100)}%).`
                  : "."),
              jevOk.focus !== "none"
                ? `Anchor the opening on the ${jevOk.focus === "option" ? "selected answer option" : jevOk.focus} — the learner's attention is there.`
                : "",
              jevOk.intent === "evaluate_option" && context?.selectedOption
                ? `The learner chose option ${context.selectedOption}; if it is wrong, name the specific misconception that makes it look right, then correct it without revealing the key unless asked.`
                : "",
              jevOk.intentConfidence != null && jevOk.intentConfidence < 0.5
                ? "The request is ambiguous — answer the most likely reading briefly and offer one clarifying follow-up."
                : "",
            ]
              .filter(Boolean)
              .join(" ")
          : "";
        const tCtx = Date.now();

        // --- 2. Memory + retrieval — started speculatively alongside Jev ------
        const [profile, retrievalRaw] = await Promise.all([memoryPromise, retrievalPromise]);
        const retrieval = plan.useRetrieval ? retrievalRaw : null;
        mark("context", tCtx);

        // --- 3. Resource agent (cheap, deterministic) --------------------------
        const tRes = Date.now();
        const resourcePick = await runResourceAgent({
          message: turn,
          context,
          intent: plan.intent,
          retrievalTitles: (retrieval?.matches ?? []).map((m) => m.title),
          trace: trace(3),
        });
        mark("resources", tRes);

        // --- 4. Answering agent ------------------------------------------------
        const agentArgs = {
          messages,
          context,
          intent: plan.intent,
          retrieval,
          profileNote: [profile.note, jevNote].filter(Boolean).join("\n\n") || null,
          // Phase F5 — lets the agents route through this learner's own key.
          userId,
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
        mark("model_open", startedAt);
        mark("total_to_stream", t0);
        const serverTiming = Object.entries(timings)
          .map(([k, v]) => `${k};dur=${v}`)
          .join(", ");
        if (runId) {
          void logStep(supabase, {
            runId,
            userId,
            stepIndex: 6,
            agent: "orchestrator",
            role: "timings",
            input: { intent: plan.intent },
            output: timings,
          }).catch(() => {});
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
            requestStartedAt: t0,
          }),
        );

        // --- Phase 1: instant spoken opener (decision already resolved) -------
        let focus: FocusTarget = "none";
        let opener = "";
        if (jevOk && !degraded) {
          focus = jevOk.focus;
          opener = `[[brief]]${focusMarker(focus, context?.selectedOption ?? null)} ${openerFor({
            intent: jevOk.intent,
            focus,
            selectedOption: context?.selectedOption ?? null,
          })} `;
        }
        mark("opener", t0);
        const responseBody = opener ? withOpener(opener, tapped) : tapped;

        return new Response(responseBody, {

          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            // Metadata travels in headers so the SSE token stream stays clean.
            "X-Mentor-Citations": encodeURIComponent(
              JSON.stringify(retrieval?.citations ?? []),
            ),
            "X-Mentor-Route": encodeURIComponent(
              JSON.stringify({ intent: plan.intent, agents: plan.agents, runId, degraded }),
            ),
            "X-Mentor-Resources": encodeURIComponent(
              JSON.stringify(resourcePick.resources),
            ),
            // Phase F6 — what is left of today's mentor allowance.
            "X-Mentor-Quota": encodeURIComponent(
              JSON.stringify({
                limit: quota.limit,
                remaining: Math.max(0, quota.remaining - 1),
                resetAt: quota.resetAt,
                byok: quota.byok,
              }),
            ),
            // Phase 1 — where to point the learner's eye the instant the reply starts.
            "X-Mentor-Focus": encodeURIComponent(
              JSON.stringify({ focus, option: context?.selectedOption ?? null }),
            ),
            "Server-Timing": Object.entries(timings)
              .map(([k, v]) => `${k};dur=${v}`)
              .join(", ") || serverTiming,
            "Access-Control-Expose-Headers":
              "X-Mentor-Citations, X-Mentor-Route, X-Mentor-Resources, X-Mentor-Quota, X-Mentor-Focus, Server-Timing",
          },
        });
      },
    },
  },
});

