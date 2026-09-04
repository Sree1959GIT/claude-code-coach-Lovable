/**
 * Phase D4 — provider registry. Swap the browser adapters for a remote
 * sandbox later by changing only this file.
 */

import type { CanvasLanguage } from "@/components/StudyCanvasTabs";
import { createJavaScriptProvider } from "./javascript-provider";
import { createPythonProvider } from "./python-provider";
import type { ExecutionProvider } from "./types";

export * from "./types";

const factories: Record<CanvasLanguage, () => ExecutionProvider> = {
  javascript: createJavaScriptProvider,
  python: createPythonProvider,
};

const cache = new Map<CanvasLanguage, ExecutionProvider>();

/** Returns a memoised provider for the language (browser only). */
export function getExecutionProvider(language: CanvasLanguage): ExecutionProvider {
  if (typeof window === "undefined") {
    throw new Error("Code execution is only available in the browser");
  }
  let provider = cache.get(language);
  if (!provider) {
    provider = factories[language]();
    cache.set(language, provider);
  }
  return provider;
}

export function disposeExecutionProviders(): void {
  for (const provider of cache.values()) provider.dispose();
  cache.clear();
}
