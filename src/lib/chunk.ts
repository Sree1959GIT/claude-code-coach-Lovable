/**
 * Sub-task 3: text chunker for the RAG library.
 *
 * Splits long documents into overlapping, semantically-ish coherent chunks
 * that stay comfortably under the embedding model's per-input token cap.
 * Pure functions only — safe to import from client or server code.
 */

export type Chunk = {
  index: number;
  content: string;
  /** Rough token estimate (~4 chars per token). */
  tokenCount: number;
};

export type ChunkOptions = {
  /** Target chunk size in characters. */
  maxChars?: number;
  /** Characters of overlap carried into the next chunk. */
  overlapChars?: number;
  /** Chunks shorter than this are merged into the previous chunk. */
  minChars?: number;
};

const DEFAULTS = {
  maxChars: 1200,
  overlapChars: 180,
  minChars: 220,
} as const;

/** Rough token estimate; good enough for budgeting embedding requests. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Split into paragraphs, then sentences when a paragraph is oversized. */
function splitUnits(text: string, maxChars: number): string[] {
  const units: string[] = [];
  for (const para of text.split(/\n{2,}/)) {
    const block = para.trim();
    if (!block) continue;
    if (block.length <= maxChars) {
      units.push(block);
      continue;
    }
    // Break oversized paragraph on sentence boundaries.
    const sentences = block.match(/[^.!?\n]+[.!?]*\s*|\n/g) ?? [block];
    let buffer = "";
    for (const sentence of sentences) {
      if (buffer.length + sentence.length > maxChars && buffer.trim()) {
        units.push(buffer.trim());
        buffer = "";
      }
      if (sentence.length > maxChars) {
        // Hard-wrap a pathological run-on (code blocks, tables, minified text).
        for (let i = 0; i < sentence.length; i += maxChars) {
          const slice = sentence.slice(i, i + maxChars).trim();
          if (slice) units.push(slice);
        }
        continue;
      }
      buffer += sentence;
    }
    if (buffer.trim()) units.push(buffer.trim());
  }
  return units;
}

function tailOverlap(text: string, overlapChars: number): string {
  if (overlapChars <= 0 || text.length <= overlapChars) return text;
  const tail = text.slice(-overlapChars);
  // Prefer starting the overlap at a sentence/word boundary.
  const boundary = tail.search(/(?<=[.!?])\s+|\n/);
  return (boundary >= 0 ? tail.slice(boundary) : tail).trimStart();
}

/**
 * Chunk a document into overlapping windows.
 * Never drops content — every character lands in at least one chunk.
 */
export function chunkText(input: string, options: ChunkOptions = {}): Chunk[] {
  const maxChars = options.maxChars ?? DEFAULTS.maxChars;
  const overlapChars = Math.min(options.overlapChars ?? DEFAULTS.overlapChars, Math.floor(maxChars / 2));
  const minChars = options.minChars ?? DEFAULTS.minChars;

  const text = normalize(input);
  if (!text) return [];

  const units = splitUnits(text, maxChars);
  const raw: string[] = [];
  let current = "";

  for (const unit of units) {
    const candidate = current ? `${current}\n\n${unit}` : unit;
    if (candidate.length > maxChars && current) {
      raw.push(current);
      const carry = tailOverlap(current, overlapChars);
      current = carry ? `${carry}\n\n${unit}` : unit;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) raw.push(current);

  // Merge a too-small trailing chunk back into its predecessor.
  if (raw.length > 1) {
    const last = raw[raw.length - 1]!;
    const prev = raw[raw.length - 2]!;
    if (last.length < minChars && prev.length + last.length <= maxChars * 1.3) {
      raw.splice(raw.length - 2, 2, `${prev}\n\n${last}`);
    }
  }

  return raw.map((content, index) => ({
    index,
    content: content.trim(),
    tokenCount: estimateTokens(content),
  }));
}

/**
 * Group chunks into batches that respect both a per-request item cap and a
 * rough token budget, for feeding `embedTexts` without provider rejections.
 */
export function batchChunks<T extends { tokenCount: number }>(
  chunks: T[],
  maxItems = 64,
  maxTokens = 120_000,
): T[][] {
  const batches: T[][] = [];
  let batch: T[] = [];
  let tokens = 0;
  for (const chunk of chunks) {
    if (batch.length >= maxItems || (batch.length > 0 && tokens + chunk.tokenCount > maxTokens)) {
      batches.push(batch);
      batch = [];
      tokens = 0;
    }
    batch.push(chunk);
    tokens += chunk.tokenCount;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
