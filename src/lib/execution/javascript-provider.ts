/**
 * Phase D4 — JavaScript execution provider: isolated Blob worker, no DOM, no
 * network affordances beyond what the worker scope already exposes.
 */

import type { ExecutionProvider, ExecutionRequest } from "./types";
import { createBlobWorker, runInWorker } from "./worker-runner";

const JS_WORKER_SOURCE = String.raw`
const send = (stream, args) => {
  const text = args
    .map((a) => {
      if (typeof a === "string") return a;
      try { return JSON.stringify(a, null, 2); } catch { return String(a); }
    })
    .join(" ");
  self.postMessage({ type: "output", stream, text: text + "\n" });
};

self.console = {
  log: (...a) => send("stdout", a),
  info: (...a) => send("stdout", a),
  debug: (...a) => send("stdout", a),
  warn: (...a) => send("stderr", a),
  error: (...a) => send("stderr", a),
};

const serialize = (v) => {
  if (v === undefined) return null;
  if (typeof v === "string") return v;
  try { return JSON.stringify(v, null, 2) ?? String(v); } catch { return String(v); }
};

self.onmessage = async (event) => {
  const { code } = event.data;
  try {
    // Indirect eval keeps the program in worker global scope; await allows
    // top-level promises to settle before the run is reported complete.
    const result = await (0, eval)(code);
    self.postMessage({ type: "done", value: serialize(result) });
  } catch (err) {
    const message = err && err.stack ? err.stack : String(err);
    self.postMessage({ type: "error", error: message });
  }
};
`;

export function createJavaScriptProvider(): ExecutionProvider {
  return {
    id: "worker-js",
    language: "javascript",
    label: "Isolated Web Worker",
    run: (request: ExecutionRequest) =>
      runInWorker(() => createBlobWorker(JS_WORKER_SOURCE), request),
    dispose() {
      // Workers are per-run and terminated by runInWorker.
    },
  };
}
