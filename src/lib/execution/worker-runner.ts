/**
 * Phase D4 — shared plumbing for browser workers.
 *
 * Both providers spawn a Blob-URL worker (so nothing needs to be resolved at
 * runtime by the bundler) and speak the same tiny message protocol:
 *   worker -> host: {type:"output", stream, text}
 *                   {type:"done", value}
 *                   {type:"error", error}
 *   host -> worker: {type:"run", code}
 */

import {
  DEFAULT_TIMEOUT_MS,
  emptyResult,
  type ExecutionRequest,
  type ExecutionResult,
} from "./types";

export type WorkerMessage =
  | { type: "output"; stream: "stdout" | "stderr"; text: string }
  | { type: "done"; value: string | null }
  | { type: "error"; error: string };

export function createBlobWorker(source: string): Worker {
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  const worker = new Worker(url, { type: "module" });
  // Safe to revoke immediately: the worker already holds the resource.
  URL.revokeObjectURL(url);
  return worker;
}

/**
 * Run `code` in a freshly spawned worker. A worker is never reused across runs
 * so cancellation and timeouts can terminate it outright — this is also the
 * cheapest way to guarantee a clean global scope per execution.
 */
export function runInWorker(
  makeWorker: () => Worker,
  request: ExecutionRequest,
): Promise<ExecutionResult> {
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const started = Date.now();
  let stdout = "";
  let stderr = "";

  return new Promise<ExecutionResult>((resolve) => {
    let worker: Worker;
    try {
      worker = makeWorker();
    } catch (err) {
      resolve(
        emptyResult({
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - started,
        }),
      );
      return;
    }

    let settled = false;
    const finish = (patch: Partial<ExecutionResult>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      resolve(
        emptyResult({ stdout, stderr, durationMs: Date.now() - started, ...patch }),
      );
    };

    const timer = setTimeout(
      () =>
        finish({
          timedOut: true,
          error: `Execution timed out after ${Math.round(timeoutMs / 1000)}s`,
        }),
      timeoutMs,
    );

    const onAbort = () => finish({ cancelled: true, error: "Execution cancelled" });
    if (request.signal?.aborted) {
      onAbort();
      return;
    }
    request.signal?.addEventListener("abort", onAbort);

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const msg = event.data;
      if (msg.type === "output") {
        if (msg.stream === "stdout") stdout += msg.text;
        else stderr += msg.text;
        request.onOutput?.({ stream: msg.stream, text: msg.text });
        return;
      }
      if (msg.type === "done") {
        finish({ ok: true, value: msg.value });
        return;
      }
      finish({ error: msg.error });
    };

    worker.onerror = (event) => finish({ error: event.message || "Worker crashed" });

    worker.postMessage({ type: "run", code: request.code });
  });
}
