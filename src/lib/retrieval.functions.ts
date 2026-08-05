/**
 * Client-callable server functions for RAG retrieval.
 * Read-only: the library is public study material.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SearchInput = z.object({
  query: z.string().min(2).max(1000),
  matchCount: z.number().int().min(1).max(20).default(6),
  minSimilarity: z.number().min(0).max(1).default(0.15),
});

export const searchLibrary = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SearchInput.parse(input))
  .handler(async ({ data }) => {
    const { retrieveChunks, buildContextBlock } = await import("./retrieval.server");
    try {
      const matches = await retrieveChunks(data);
      return { matches, context: buildContextBlock(matches), error: null as string | null };
    } catch (err) {
      return {
        matches: [],
        context: "",
        error: err instanceof Error ? err.message : "Library search unavailable",
      };
    }
  });
