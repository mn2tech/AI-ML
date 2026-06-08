import { useState, useRef, useEffect } from "react";
import Head from "next/head";

// ── RAG helpers (client-side) ─────────────────────────────────────────────
function chunkText(text, size = 400, overlap = 80) {
  const words = text.split(/\s+/);
  const out = [];
  for (let i = 0; i < words.length; i += size - overlap) {
    const c = words.slice(i, i + size).join(" ");
    if (c.trim().length > 20) out.push(c);
  }
  return out;
}

function buildVocab(chunks) {
  const all = chunks.join(" ");
  const words = [...new Set(all.toLowerCase().split(/\W+/).filter((w) => w.length > 2))];
  return words.slice(0, 1000);
}

function embed(text, vocab) {
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  const tf = {};
  words.forEach((w) => (tf[w] = (tf[w] || 0) + 1));
  const vec = vocab.map((w) => (tf[w] || 0) / words.length);
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? vec.map((v) => v / norm) : vec;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

function retrieve(query, chunks, vocab, k = 4) {
  if (!chunks.length) return [];
  const qvec = embed(query, vocab);
  const ranked = chunks
    .map((c) => ({ ...c, score: cosine(qvec, c.vec) }))
    .sort((a, b) => b.score - a.score);
  const hits = ranked.slice(0, k).filter((c) => c.score > 0.001);
  return hits.length > 0 ? hits : ranked.slice(0, Math.min(k, ranked.length));
}

const PIPE_STEPS = ["Query", "Embed", "Retrieve", "Generate", "Done"];
const QUICK = [
  { label: "💡 What is RAG?", q: "What is RAG and how does it work?" },
  { label: "🔥 Top AI skills", q: "What AI skills are most in demand for jobs in 2026?" },
  { label: "💰 Salary info", q: "What salary can AI engineers expect?" },
  { label: "📄 Summarize", q: "Summarize the key points from all documents" },
];

const SAMPLE_DOC = {
  name: "sample-knowledge-base.md",
  text: `# RAG and AI Engineering Guide

## What is RAG?
Retrieval-Augmented Generation (RAG) combines document search with large language models. Instead of relying only on the model's training data, RAG retrieves relevant passages from your documents and feeds them as context to the LLM. This produces grounded, up-to-date answers with source citations.

## How RAG Works
1. **Ingest** — Documents are split into chunks (typically 300-500 tokens).
2. **Embed** — Each chunk is converted to a vector using TF-IDF or neural embeddings.
3. **Retrieve** — User queries are embedded and matched to chunks via cosine similarity.
4. **Generate** — Top-K chunks are sent to Claude/GPT as context for the final answer.

## Top AI Skills in 2026
- Python and PyTorch/TensorFlow
- LLM fine-tuning and prompt engineering
- RAG pipeline design and vector databases (Pinecone, Chroma, FAISS)
- MLOps: Docker, Kubernetes, CI/CD for models
- Cloud AI services: AWS Bedrock, Azure OpenAI, GCP Vertex AI

## AI Engineer Salaries (2026)
- Entry-level AI/ML Engineer: $95,000 – $130,000
- Mid-level (3-5 yrs): $130,000 – $175,000
- Senior AI Engineer: $175,000 – $250,000+
- Staff/Principal: $250,000 – $350,000+ (FAANG/top startups)
`,
};

function indexDocument(name, text, existingChunks = [], existingDocs = []) {
  const cs = chunkText(text).map((t, i) => ({ text: t, source: name, id: `${name}-${i}`, vec: null }));
  if (cs.length === 0) return null;
  const newChunks = [...existingChunks, ...cs];
  const newDocs = [...existingDocs, { name, size: text.length }];
  const v = buildVocab(newChunks.map((c) => c.text));
  newChunks.forEach((c) => { if (!c.vec) c.vec = embed(c.text, v); });
  return { chunks: newChunks, docs: newDocs, vocab: v };
}

export default function Home() {
  const [docs, setDocs] = useState([]);
  const [chunks, setChunks] = useState([]);
  const [vocab, setVocab] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pipeStep, setPipeStep] = useState(-1);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    const indexed = indexDocument(SAMPLE_DOC.name, SAMPLE_DOC.text);
    if (indexed) {
      setChunks(indexed.chunks);
      setDocs(indexed.docs);
      setVocab(indexed.vocab);
    }
  }, []);

  async function handleFiles(files) {
    const newChunks = [...chunks];
    const newDocs = [...docs];
    let anyNew = false;

    for (const file of files) {
      if (docs.find((d) => d.name === file.name)) continue;
      const text = await file.text();
      const cs = chunkText(text).map((t, i) => ({ text: t, source: file.name, id: `${file.name}-${i}`, vec: null }));
      if (cs.length === 0) continue;
      newChunks.push(...cs);
      newDocs.push({ name: file.name, size: file.size });
      anyNew = true;
    }

    if (anyNew) {
      const v = buildVocab(newChunks.map((c) => c.text));
      newChunks.forEach((c) => { if (!c.vec) c.vec = embed(c.text, v); });
      setVocab(v);
      setChunks(newChunks);
      setDocs(newDocs);
    }
  }

  async function sendQuery(query) {
    if (!query.trim() || loading) return;
    setInput("");
    setLoading(true);
    setMessages((m) => [...m, { role: "user", text: query }]);

    for (let i = 0; i <= 3; i++) {
      setPipeStep(i);
      await new Promise((r) => setTimeout(r, 280));
    }

    const hits = retrieve(query, chunks, vocab);
    if (hits.length === 0) {
      setMessages((m) => [...m, { role: "assistant", text: "No searchable content found. Upload a text-based file (TXT, MD, CSV, etc.) with enough text to chunk.", sources: [] }]);
      setPipeStep(-1);
      setLoading(false);
      return;
    }

    const payload = hits.map(({ text, source }) => ({ text, source }));

    try {
      const res = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, chunks: payload }),
      });
      const data = await res.json();
      setPipeStep(4);
      setMessages((m) => [...m, { role: "assistant", text: data.answer || data.error, sources: data.sources || [] }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: "Error: " + e.message, sources: [] }]);
    }

    setTimeout(() => setPipeStep(-1), 2000);
    setLoading(false);
  }

  const ready = chunks.length > 0;

  return (
    <>
      <Head>
        <title>DocMind RAG</title>
        <meta name="description" content="RAG-powered document Q&A — portfolio AI project" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: "100vh", background: "#0d0d14", color: "#eeebff", fontFamily: "'DM Mono', monospace", padding: "20px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, paddingBottom: 16, borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(124,110,247,0.14)", border: "1px solid #7c6ef7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🧠</div>
            <div>
              <div style={{ fontFamily: "Syne, sans-serif", fontSize: 18, fontWeight: 700 }}>DocMind RAG</div>
              <div style={{ fontSize: 10, color: "#4a4768", textTransform: "uppercase", letterSpacing: "0.08em" }}>Retrieval-Augmented Generation</div>
            </div>
          </div>
          <div style={{ fontSize: 10, padding: "4px 12px", borderRadius: 20, background: "rgba(74,222,128,0.1)", color: "#4ade80", border: "0.5px solid rgba(74,222,128,0.3)", display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ade80", display: "inline-block" }}></span>
            Claude API · Live
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>
          {/* Sidebar */}
          <aside>
            <div style={{ background: "#16161f", border: "0.5px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", borderBottom: "0.5px solid rgba(255,255,255,0.07)", fontSize: 10, color: "#4a4768", textTransform: "uppercase", letterSpacing: "0.1em" }}>📁 Knowledge Base</div>

              {/* Upload zone */}
              <label style={{ display: "block", margin: 10, border: "1px dashed rgba(255,255,255,0.13)", borderRadius: 8, padding: "16px 10px", textAlign: "center", cursor: "pointer", transition: "all 0.2s" }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files)); }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>☁️</div>
                <div style={{ fontSize: 11, color: "#8883aa" }}>Drop files or <span style={{ color: "#a594f9" }}>browse</span></div>
                <div style={{ fontSize: 10, color: "#4a4768", marginTop: 3 }}>TXT · MD · CSV · PY · JS</div>
                <input type="file" multiple accept=".txt,.md,.csv,.py,.js,.html,.json" style={{ display: "none" }}
                  onChange={(e) => handleFiles(Array.from(e.target.files))} />
              </label>

              {/* Doc list */}
              {docs.length > 0 && (
                <div style={{ padding: "0 8px 8px" }}>
                  {docs.map((d) => (
                    <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 6, background: "#1e1e2a", border: "0.5px solid #7c6ef7", marginBottom: 3 }}>
                      <span style={{ fontSize: 12 }}>📄</span>
                      <span style={{ fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: "8px 8px", borderTop: "0.5px solid rgba(255,255,255,0.07)" }}>
                {[["Docs", docs.length], ["Chunks", chunks.length]].map(([label, val]) => (
                  <div key={label} style={{ background: "#1e1e2a", borderRadius: 6, padding: "7px 8px", textAlign: "center" }}>
                    <div style={{ fontFamily: "Syne, sans-serif", fontSize: 18, fontWeight: 700, color: "#a594f9" }}>{val}</div>
                    <div style={{ fontSize: 9, color: "#4a4768", textTransform: "uppercase" }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Tech tags */}
              <div style={{ padding: "8px 12px", borderTop: "0.5px solid rgba(255,255,255,0.07)", display: "flex", flexWrap: "wrap", gap: 3 }}>
                {["TF-IDF", "Cosine Sim", "Top-K", "Claude API"].map((t) => (
                  <span key={t} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 20, background: "#1e1e2a", color: "#8883aa", border: "0.5px solid rgba(255,255,255,0.07)" }}>{t}</span>
                ))}
              </div>
            </div>
          </aside>

          {/* Chat */}
          <div style={{ background: "#16161f", border: "0.5px solid rgba(255,255,255,0.07)", borderRadius: 12, display: "flex", flexDirection: "column", height: "calc(100vh - 120px)" }}>
            <div style={{ padding: "10px 14px", borderBottom: "0.5px solid rgba(255,255,255,0.07)", fontSize: 10, color: "#4a4768", textTransform: "uppercase", letterSpacing: "0.1em" }}>💬 Q&A Chat</div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              {messages.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, textAlign: "center" }}>
                  <div style={{ fontSize: 40 }}>🧠</div>
                  <div style={{ fontFamily: "Syne, sans-serif", fontSize: 15, fontWeight: 700 }}>{ready ? "Ready to answer!" : "Upload docs to begin"}</div>
                  <div style={{ fontSize: 12, color: "#8883aa", maxWidth: 260, lineHeight: 1.6 }}>
                    {ready ? "Click a quick button or type your question below." : "Add documents in the sidebar, then ask questions."}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 8, flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: m.role === "assistant" ? "rgba(124,110,247,0.14)" : "#1e1e2a", border: `0.5px solid ${m.role === "assistant" ? "#7c6ef7" : "rgba(255,255,255,0.13)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>
                    {m.role === "assistant" ? "🧠" : "👤"}
                  </div>
                  <div style={{ maxWidth: "80%" }}>
                    <div style={{ padding: "9px 13px", fontSize: 13, lineHeight: 1.65, borderRadius: m.role === "assistant" ? "3px 10px 10px 10px" : "10px 3px 10px 10px", background: m.role === "assistant" ? "#1e1e2a" : "rgba(124,110,247,0.14)", border: `0.5px solid ${m.role === "assistant" ? "rgba(255,255,255,0.07)" : "rgba(124,110,247,0.25)"}` }}
                      dangerouslySetInnerHTML={{ __html: m.text?.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>") }} />
                    {m.sources?.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 5 }}>
                        {[...new Set(m.sources)].map((s) => (
                          <span key={s} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "0.5px solid rgba(251,191,36,0.25)" }}>📄 {s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: "rgba(124,110,247,0.14)", border: "0.5px solid #7c6ef7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>🧠</div>
                  <div style={{ padding: "9px 13px", background: "#1e1e2a", borderRadius: "3px 10px 10px 10px", border: "0.5px solid rgba(255,255,255,0.07)", display: "flex", gap: 4, alignItems: "center" }}>
                    {[0, 1, 2].map((i) => <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#a594f9", display: "inline-block", animation: `blink 1.2s ${i * 0.2}s infinite` }}></span>)}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Pipeline */}
            {pipeStep >= 0 && (
              <div style={{ padding: "8px 14px", borderTop: "0.5px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                {PIPE_STEPS.map((s, i) => (
                  <span key={s}>
                    <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.05em", color: i < pipeStep ? "#4ade80" : i === pipeStep ? "#a594f9" : "#4a4768", background: i === pipeStep ? "rgba(124,110,247,0.14)" : "transparent" }}>{s}</span>
                    {i < PIPE_STEPS.length - 1 && <span style={{ color: "#4a4768", fontSize: 9 }}> › </span>}
                  </span>
                ))}
              </div>
            )}

            {/* Quick prompts */}
            {ready && (
              <div style={{ padding: "8px 10px", borderTop: "0.5px solid rgba(255,255,255,0.07)", display: "flex", flexWrap: "wrap", gap: 5 }}>
                {QUICK.map(({ label, q }) => (
                  <button key={label} onClick={() => sendQuery(q)} disabled={loading}
                    style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, padding: "5px 11px", borderRadius: 20, background: "#1e1e2a", border: "0.5px solid #7c6ef7", color: "#a594f9", cursor: "pointer", transition: "all 0.15s" }}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div style={{ padding: 10, borderTop: "0.5px solid rgba(255,255,255,0.07)", display: "flex", gap: 8 }}>
              <input value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendQuery(input); }}
                placeholder={ready ? "Ask anything about your documents…" : "Upload documents first…"}
                disabled={!ready || loading}
                style={{ flex: 1, background: "#1e1e2a", border: "0.5px solid rgba(255,255,255,0.13)", borderRadius: 8, padding: "9px 12px", fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#eeebff", outline: "none" }} />
              <button onClick={() => sendQuery(input)} disabled={!ready || loading || !input.trim()}
                style={{ width: 38, height: 38, borderRadius: 8, background: "#7c6ef7", border: "none", cursor: "pointer", fontSize: 16, color: "white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>→</button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        @keyframes blink { 0%,80%,100%{opacity:0.2;transform:scale(0.8)} 40%{opacity:1;transform:scale(1)} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>
    </>
  );
}
