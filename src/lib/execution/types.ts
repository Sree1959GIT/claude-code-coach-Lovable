/**
 * Phase D4 — swappable code execution provider interface.
 *
 * The Study Canvas never talks to Pyodide or a worker directly: it asks the
 * registry for a provider by language. Today both providers run in the browser;
 * a remote-container provider can be dropped in later without UI changes.
 */

import type { CanvasLanguage } from "@/components/StudyCanvasTabs";

export type ExecutionStream = "stdout" | "stderr";

export type ExecutionChunk = { stream: ExecutionStream; text: string };

export type ExecutionRequest = {
  code: string;
  /** Hard wall-clock limit in ms. Defaults to 10_000. */
  timeoutMs?: number;
  /** Streaming output callback, called as the program prints. */
  onOutput?: (chunk: ExecutionChunk) => void;
  /** Abort the run early (cancel button). */
  signal?: AbortSignal;
};

export type ExecutionResult = {
  ok: boolean;
  /** Serialised return value of the last expression, when there is one. */
  value: string | null;
  stdout: string;
  stderr: string;
  /** Present when the program threw or the runtime failed. */
  error: string | null;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
};

export interface ExecutionProvider {
  readonly id: string;
  readonly language: CanvasLanguage;
  /** Human label for the console pane ("Pyodide 0.26 (WASM)"). */
  readonly label: string;
  run(request: ExecutionRequest): Promise<ExecutionResult>;
  /** Release the underlying worker / WASM instance. */
  dispose(): void;
}

export const DEFAULT_TIMEOUT_MS = 10_000;

export function emptyResult(patch: Partial<ExecutionResult>): ExecutionResult {
  return {
    ok: false,
    value: null,
    stdout: "",
    stderr: "",
    error: null,
    durationMs: 0,
    timedOut: false,
    cancelled: false,
    ...patch,
  };
}
