import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { query, chunks } = req.body;
  if (!query || !chunks?.length) {
    return res.status(400).json({ error: "Missing query or chunks" });
  }

  const context = chunks
    .map((c) => `[Source: ${c.source}]\n${c.text}`)
    .join("\n\n---\n\n");

  const sources = [...new Set(chunks.map((c) => c.source))];

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system:
        "You are a RAG-powered document Q&A assistant. Answer using ONLY the provided document context. Be concise (2-5 sentences). Use **bold** for key terms. If the context doesn't contain the answer, say so clearly.",
      messages: [
        {
          role: "user",
          content: `Document context:\n${context}\n\nQuestion: ${query}`,
        },
      ],
    });

    res.json({ answer: response.content[0].text, sources });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
