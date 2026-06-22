import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

const SYSTEM_PROMPT =
  "You are a RAG-powered document Q&A assistant. Answer using ONLY the provided document context. Be concise (2-5 sentences). Use **bold** for key terms. If the context doesn't contain the answer, say so clearly. When the user asks follow-up questions, use conversation history for context but still ground answers in the documents.";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { query, chunks, history = [], stream = true } = req.body;
  if (!query || !chunks?.length) {
    return res.status(400).json({ error: "Missing query or chunks" });
  }

  const context = chunks
    .map((c) => `[Source: ${c.source}${c.scorePct != null ? ` | Relevance: ${c.scorePct}%` : ""}]\n${c.text}`)
    .join("\n\n---\n\n");

  const sourceDetails = chunks.map((c) => ({
    source: c.source,
    scorePct: c.scorePct ?? null,
    id: c.id ?? null,
  }));

  // Build messages: last 6 history turns + current question with context
  const historyMessages = history.slice(-6).map((m) => ({
    role: m.role,
    content: m.text,
  }));

  const userContent = `Document context:\n${context}\n\nQuestion: ${query}`;

  const messages = [
    ...historyMessages,
    { role: "user", content: userContent },
  ];

  // Ensure alternating roles — merge consecutive same-role if needed
  const cleaned = [];
  for (const msg of messages) {
    const role = msg.role === "assistant" ? "assistant" : "user";
    if (cleaned.length && cleaned[cleaned.length - 1].role === role) {
      cleaned[cleaned.length - 1].content += "\n" + msg.content;
    } else {
      cleaned.push({ role, content: msg.content });
    }
  }

  // Must start with user
  if (cleaned.length && cleaned[0].role !== "user") cleaned.shift();

  try {
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      // Send source metadata first
      res.write(`data: ${JSON.stringify({ type: "sources", sources: sourceDetails })}\n\n`);

      const anthropicStream = await client.messages.stream({
        model: MODEL,
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: cleaned,
      });

      for await (const event of anthropicStream) {
        if (
          event.type === "content_block_delta" &&
          event.delta?.type === "text_delta"
        ) {
          res.write(`data: ${JSON.stringify({ type: "token", text: event.delta.text })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } else {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: cleaned,
      });

      res.json({
        answer: response.content[0].text,
        sources: sourceDetails,
      });
    }
  } catch (err) {
    if (stream && !res.headersSent) {
      res.setHeader("Content-Type", "text/event-stream");
    }
    if (stream) {
      res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: err.message });
    }
  }
}
