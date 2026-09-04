/**
 * Phase D4 — Python execution provider: Pyodide (CPython compiled to WASM)
 * loaded from the CDN inside a worker, so a runaway loop can be terminated.
 */

import type { ExecutionProvider, ExecutionRequest } from "./types";
import { createBlobWorker, runInWorker } from "./worker-runner";

export const PYODIDE_VERSION = "0.26.4";
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

const PY_WORKER_SOURCE = String.raw`
importScripts("${PYODIDE_CDN}pyodide.js");

const emit = (stream, text) =>
  self.postMessage({ type: "output", stream, text: text.endsWith("\n") ? text : text + "\n" });

let pyodidePromise = null;
const getPyodide = () => {
  if (!pyodidePromise) {
    pyodidePromise = self.loadPyodide({
      indexURL: "${PYODIDE_CDN}",
      stdout: (t) => emit("stdout", t),
      stderr: (t) => emit("stderr", t),
    });
  }
  return pyodidePromise;
};

self.onmessage = async (event) => {
  const { code } = event.data;
  try {
    const pyodide = await getPyodide();
    const result = await pyodide.runPythonAsync(code);
    let value = null;
    if (result !== undefined && result !== null) {
      value = typeof result === "string" ? result : String(result);
      if (result && typeof result.destroy === "function") result.destroy();
    }
    self.postMessage({ type: "done", value });
  } catch (err) {
    self.postMessage({ type: "error", error: err && err.message ? err.message : String(err) });
  }
};
`;

export function createPythonProvider(): ExecutionProvider {
  return {
    id: "pyodide-wasm",
    language: "python",
    label: `Pyodide ${PYODIDE_VERSION} (WASM)`,
    run: (request: ExecutionRequest) =>
      // classic worker: importScripts is unavailable in module workers.
      runInWorker(() => createBlobWorker(PY_WORKER_SOURCE), request),
    dispose() {
      // Workers are per-run and terminated by runInWorker.
    },
  };
}
