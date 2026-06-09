// Smart chunking: split by paragraphs first, then by size with overlap.
// Token approximation: ~1.3 words per token → 500 tokens ≈ 385 words, 100 tokens ≈ 75 words.

export const CHUNK_WORDS = 385;
export const OVERLAP_WORDS = 75;
export const MIN_CHUNK_CHARS = 20;

/** Approximate token count from word count */
export function estimateTokens(text) {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.3);
}

/**
 * Chunk text by paragraphs first, then sub-chunk large paragraphs.
 * @param {string} text - Raw document text
 * @param {number} chunkSize - Max words per chunk (~500 tokens)
 * @param {number} overlap - Word overlap between chunks (~100 tokens)
 * @returns {string[]} Array of text chunks
 */
export function chunkText(text, chunkSize = CHUNK_WORDS, overlap = OVERLAP_WORDS) {
  if (!text?.trim()) return [];

  const paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const chunks = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/);

    if (words.length <= chunkSize) {
      if (para.length >= MIN_CHUNK_CHARS) chunks.push(para);
      continue;
    }

    // Sub-chunk large paragraphs with overlap
    for (let i = 0; i < words.length; i += chunkSize - overlap) {
      const slice = words.slice(i, i + chunkSize).join(" ");
      if (slice.length >= MIN_CHUNK_CHARS) chunks.push(slice);
    }
  }

  // Fallback: if no paragraph breaks, chunk the whole text
  if (chunks.length === 0 && text.trim().length >= MIN_CHUNK_CHARS) {
    const words = text.replace(/\s+/g, " ").trim().split(/\s+/);
    for (let i = 0; i < words.length; i += chunkSize - overlap) {
      const slice = words.slice(i, i + chunkSize).join(" ");
      if (slice.length >= MIN_CHUNK_CHARS) chunks.push(slice);
    }
  }

  return chunks;
}

/** Build chunk objects for a document */
export function buildChunks(text, source) {
  return chunkText(text).map((t, i) => ({
    id: `${source}-${i}`,
    text: t,
    source,
    vec: null,
    score: 0,
  }));
}
