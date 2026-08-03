/**
 * Server-only embedding helper for the RAG library.
 *
 * Uses the Lovable AI Gateway's OpenAI-compatible /embeddings endpoint.
 * The `library_chunks.embedding` column is vector(1536), so we request
 * 1536 dimensions explicitly.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";

export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

/** Max inputs we send in a single request (well under provider caps). */
const MAX_BATCH = 64;

type EmbeddingResponse = {
  data: { index: number; embedding: number[] }[];
  usage?: { prompt_tokens?: number; total_tokens?: number };
};

class EmbeddingError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "EmbeddingError";
    this.status = status;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedBatch(inputs: string[], apiKey: string): Promise<number[][]> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${GATEWAY_URL}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: inputs,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (res.ok) {
      const json = (await res.json()) as EmbeddingResponse;
      const rows = [...(json.data ?? [])].sort((a, b) => a.index - b.index);
      if (rows.length !== inputs.length) {
        throw new EmbeddingError(
          `Embedding count mismatch: expected ${inputs.length}, got ${rows.length}`,
          502,
        );
      }
      return rows.map((r) => r.embedding);
    }

    const body = await res.text();

    // Terminal statuses — surface immediately with a useful message.
    if (res.status === 402) {
      throw new EmbeddingError(
        "AI credits exhausted. Add credits in Settings → Plans & credits.",
        402,
      );
    }
    if (res.status === 403 || res.status === 404) {
      throw new EmbeddingError(
        "Embeddings are not enabled for this workspace.",
        res.status,
      );
    }
    if (res.status !== 429 && res.status < 500) {
      throw new EmbeddingError(`Embedding request failed: ${body}`, res.status);
    }

    lastError = new EmbeddingError(`Embedding request failed: ${body}`, res.status);
    // Retryable: 429 / 5xx — back off with jitter.
    await sleep(500 * 2 ** attempt + Math.random() * 250);
  }

  throw lastError instanceof Error
    ? lastError
    : new EmbeddingError("Embedding request failed", 500);
}

/** Embed a batch of texts. Returns vectors in the same order as the inputs. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new EmbeddingError("Missing LOVABLE_API_KEY", 500);

  const cleaned = texts.map((t) => t.replace(/\s+/g, " ").trim());
  if (cleaned.some((t) => t.length === 0)) {
    throw new EmbeddingError("Cannot embed empty text", 400);
  }

  const out: number[][] = [];
  for (let i = 0; i < cleaned.length; i += MAX_BATCH) {
    const batch = cleaned.slice(i, i + MAX_BATCH);
    out.push(...(await embedBatch(batch, apiKey)));
  }
  return out;
}

/** Embed a single text and return its vector. */
export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}

/** pgvector accepts a `[1,2,3]` string literal for insert/query params. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
