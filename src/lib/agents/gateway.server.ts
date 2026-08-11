/**
 * Sub-task 16 — Gateway resilience: retry policy + non-model fallback.
 * Server-only. Shared by the explainer and evaluator streams.
 */

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export type GatewayStreamArgs = {
  url: string;
  apiKey: string;
  body: unknown;
  /** Total attempts, including the first. */
  attempts?: number;
  label?: string;
};

export function gatewayError(status: number, body: string, label = "Mentor"): Error {
  if (status === 429) return new Error(`${label} is rate limited. Try again in a moment.`);
  if (status === 402) return new Error("AI credits exhausted. Add credits in Lovable settings.");
  return new Error(`${label} call failed: ${status} ${body.slice(0, 160)}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST to the gateway and return the SSE body, retrying transient failures with
 * exponential backoff (250ms, 750ms). Non-retryable statuses throw immediately.
 */
export async function fetchGatewayStream(
  args: GatewayStreamArgs,
): Promise<ReadableStream<Uint8Array>> {
  const attempts = Math.max(1, args.attempts ?? 3);
  let lastError: Error = new Error(`${args.label ?? "Mentor"} unavailable`);

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(args.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(args.body),
      });
      if (res.ok && res.body) return res.body;

      const text = await res.text().catch(() => "");
      lastError = gatewayError(res.status, text, args.label);
      if (!RETRYABLE.has(res.status)) throw lastError;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      // A thrown non-retryable gateway error must not be retried.
      if (e === lastError && !e.message.includes("rate limited")) throw e;
      lastError = e;
    }
    if (i < attempts - 1) await sleep(250 * Math.pow(3, i));
  }
  throw lastError;
}

/** Encode plain text as the OpenAI-style SSE frames the mentor panel expects. */
export function textToSseStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = text.match(/[\s\S]{1,80}/g) ?? [text];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        const frame = JSON.stringify({ choices: [{ delta: { content: chunk } }] });
        controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

export type FallbackArgs = {
  reason: string;
  stem?: string | null;
  keyConcept?: string | null;
  selectedOption?: string | null;
  passages?: { title: string; snippet?: string }[];
};

/**
 * Deterministic, model-free answer used when the gateway stays unavailable.
 * Follows the same written + [[brief]] spoken contract as the agents so the
 * panel, highlighter and critic all keep working.
 */
export function buildFallbackAnswer(args: FallbackArgs): string {
  const written: string[] = [
    `The mentor model is temporarily unavailable (${args.reason}), so here is a grounded fallback while it recovers.`,
  ];
  if (args.stem) {
    written.push(
      `Re-read the stem and underline its decisive qualifier words — "${args.stem.slice(0, 180)}" — because the correct option must satisfy every one of them, not just the general topic.`,
    );
  }
  if (args.keyConcept) {
    written.push(`The concept under test here is ${args.keyConcept}.`);
  }
  if (args.selectedOption) {
    written.push(
      `For option ${args.selectedOption}, check it clause by clause against those qualifiers and against the closest rival option; the one that fails a qualifier is the distractor.`,
    );
  }
  if (args.passages?.length) {
    written.push(
      `Relevant library material: ${args.passages
        .slice(0, 3)
        .map((p, i) => `[${i + 1}] ${p.title}`)
        .join(", ")}.`,
    );
  }
  written.push("Ask again in a moment for the full explanation.");

  const spoken = [
    "[[none]] The mentor model is briefly unavailable, so here's a quick fallback.",
    args.stem ? "[[stem]] Re-read the stem and mark the qualifier words that any correct option has to satisfy." : "",
    args.selectedOption
      ? `[[opt:${args.selectedOption}]] Then test your option against each of those qualifiers one at a time.`
      : "[[none]] Try again in a moment for the full explanation.",
  ]
    .filter(Boolean)
    .join(" ");

  return `${written.join(" ")}\n\n[[brief]] ${spoken}`;
}
