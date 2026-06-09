// In-memory vector store utilities — TF-IDF fallback + cosine retrieval

const VOCAB_LIMIT = 1000;

/** Build shared vocabulary from all chunk texts */
export function buildVocab(texts) {
  const all = texts.join(" ");
  const words = [...new Set(all.toLowerCase().split(/\W+/).filter((w) => w.length > 2))];
  return words.slice(0, VOCAB_LIMIT);
}

/** TF-IDF embedding for a single text against a vocabulary */
export function tfidfEmbed(text, vocab) {
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  const tf = {};
  words.forEach((w) => (tf[w] = (tf[w] || 0) + 1));
  const vec = vocab.map((w) => (tf[w] || 0) / Math.max(words.length, 1));
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? vec.map((v) => v / norm) : vec;
}

/** Embed multiple texts with TF-IDF (fallback when OpenAI unavailable) */
export function tfidfEmbedBatch(texts, existingVocab = null) {
  const vocab = existingVocab?.length ? existingVocab : buildVocab(texts);
  return {
    embeddings: texts.map((t) => tfidfEmbed(t, vocab)),
    vocab,
    method: "tfidf",
  };
}

/** Cosine similarity between two vectors */
export function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

/**
 * Retrieve top-K chunks by cosine similarity.
 * Returns chunks with score (0–1) and scorePct (0–100).
 */
export function retrieve(queryVec, chunks, k = 4) {
  if (!chunks.length || !queryVec?.length) return [];

  const ranked = chunks
    .map((c) => {
      const score = cosineSimilarity(queryVec, c.vec);
      return { ...c, score, scorePct: Math.round(Math.max(0, Math.min(1, score)) * 100) };
    })
    .sort((a, b) => b.score - a.score);

  const hits = ranked.slice(0, k).filter((c) => c.score > 0.001);
  const result = hits.length > 0 ? hits : ranked.slice(0, Math.min(k, ranked.length));

  // Normalize scores to 0–100% relative to top hit for display
  const maxScore = Math.max(result[0]?.score ?? 0, 1e-9);
  return result.map((c) => ({
    ...c,
    scorePct: Math.round((c.score / maxScore) * 100),
  }));
}

/** In-memory store class for managing chunks per session */
export class VectorStore {
  constructor() {
    this.chunks = [];
    this.vocab = [];
    this.embeddingMethod = "tfidf";
  }

  addChunks(newChunks) {
    this.chunks.push(...newChunks);
  }

  setVocab(vocab) {
    this.vocab = vocab;
  }

  setMethod(method) {
    this.embeddingMethod = method;
  }

  getChunkCountBySource(source) {
    return this.chunks.filter((c) => c.source === source).length;
  }

  retrieve(queryVec, k = 4) {
    return retrieve(queryVec, this.chunks, k);
  }

  get allChunks() {
    return this.chunks;
  }
}
