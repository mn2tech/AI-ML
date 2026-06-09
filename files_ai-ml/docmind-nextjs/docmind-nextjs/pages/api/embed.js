import OpenAI from "openai";
import { tfidfEmbedBatch } from "../../lib/vectorStore";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { texts, vocab: sharedVocab } = req.body;
  if (!texts?.length) {
    return res.status(400).json({ error: "Missing texts array" });
  }

  try {
    // OpenAI text-embedding-3-small (1536 dims)
    if (openai) {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: texts,
      });

      const embeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);

      return res.json({ embeddings, method: "openai", dimensions: embeddings[0]?.length || 1536 });
    }

    // Fallback: TF-IDF vectors (reuse shared vocab for query embedding)
    const { embeddings, vocab, method } = tfidfEmbedBatch(texts, sharedVocab);
    return res.json({ embeddings, vocab, method, dimensions: embeddings[0]?.length || 0 });
  } catch (err) {
    console.error("Embed error:", err);

    // Graceful fallback if OpenAI fails mid-request
    try {
      const { embeddings, vocab, method } = tfidfEmbedBatch(texts, sharedVocab);
      return res.json({ embeddings, vocab, method, dimensions: embeddings[0]?.length || 0, fallback: true });
    } catch {
      res.status(500).json({ error: err.message });
    }
  }
}
