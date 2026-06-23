import { useState, useRef, useEffect, useCallback } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { buildChunks } from "../lib/chunker";
import { retrieve } from "../lib/vectorStore";

// ── Theme tokens ────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: "#0d0d14",
    surface: "#16161f",
    surface2: "#1e1e2a",
    text: "#eeebff",
    muted: "#8883aa",
    dim: "#4a4768",
    accent: "#7c6ef7",
    accentLight: "#a594f9",
    border: "rgba(255,255,255,0.07)",
    border2: "rgba(255,255,255,0.13)",
    userBg: "rgba(124,110,247,0.14)",
    success: "#4ade80",
  },
  light: {
    bg: "#f0eff8",
    surface: "#ffffff",
    surface2: "#f5f4ff",
    text: "#1a1833",
    muted: "#5c5878",
    dim: "#9896b0",
    accent: "#7c6ef7",
    accentLight: "#6b5ce7",
    border: "rgba(0,0,0,0.08)",
    border2: "rgba(0,0,0,0.12)",
    userBg: "rgba(124,110,247,0.12)",
    success: "#16a34a",
  },
};

const PIPE_STEPS = ["Query", "Embed", "Retrieve", "Generate", "Done"];
const PASTE_DOC_MIN_CHARS = 300;
const QUICK = [
  { label: "💡 What is RAG?", q: "What is RAG and how does it work?" },
  { label: "🔥 Top AI skills", q: "What AI skills are most in demand for jobs in 2026?" },
  { label: "💰 Salary info", q: "What salary can AI engineers expect?" },
  { label: "📄 Summarize", q: "Summarize the key points from all documents" },
];

const SAMPLE_DOC = {
  name: "sample-knowledge-base.md",
  type: "md",
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

function fileIcon(name) {
  if (name.startsWith("pasted-text-")) return "📋";
  if (name.startsWith("gdrive-")) return "📁";
  if (name.toLowerCase().endsWith(".pdf")) return "📕";
  if (name.toLowerCase().endsWith(".csv")) return "📊";
  if (name.toLowerCase().endsWith(".md")) return "📝";
  return "📄";
}

function fileType(name) {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext || "txt";
}

/** File picker accept string matching a doc's type */
function acceptForDoc(doc) {
  const type = doc.type || fileType(doc.name);
  const map = {
    pdf: ".pdf",
    md: ".md,.markdown,.txt",
    csv: ".csv",
    txt: ".txt,.md",
    py: ".py",
    js: ".js,.jsx,.ts,.tsx",
    html: ".html,.htm",
    json: ".json",
  };
  return map[type] || `.${type}`;
}

function formatMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

export default function Home() {
  const [theme, setTheme] = useState("dark");
  const [docs, setDocs] = useState([]);
  const [chunks, setChunks] = useState([]);
  const [vocab, setVocab] = useState([]);
  const [embedMethod, setEmbedMethod] = useState("tfidf");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [pipeStep, setPipeStep] = useState(-1);
  const [uploading, setUploading] = useState(false);
  const [retrievedChunks, setRetrievedChunks] = useState([]);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [deletingDocs, setDeletingDocs] = useState(new Set());
  const [docBusy, setDocBusy] = useState(false);
  const [visitCount, setVisitCount] = useState(null);
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveConfigured, setDriveConfigured] = useState(true);
  const [driveModal, setDriveModal] = useState(false);
  const [driveFiles, setDriveFiles] = useState([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveImporting, setDriveImporting] = useState(null);
  const [driveSelected, setDriveSelected] = useState(new Set());
  const [bulkProgress, setBulkProgress] = useState(null); // { done, total, current }
  const bottomRef = useRef(null);
  const router = useRouter();
  const inputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const replacingDocRef = useRef(null);

  const t = THEMES[theme];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // Auto-resize chat textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // Load theme preference
  useEffect(() => {
    const saved = localStorage.getItem("docmind-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  // Track visits — count once per browser per day, show total in header
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const visitKey = `docmind-visit-${today}`;
    const alreadyCounted = localStorage.getItem(visitKey);

    fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ increment: !alreadyCounted }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.count != null) setVisitCount(data.count);
        if (!alreadyCounted) localStorage.setItem(visitKey, "1");
      })
      .catch(() => {});
  }, []);

  // Check Google Drive connection status
  const checkDriveStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/google/status");
      const data = await res.json();
      setDriveConnected(Boolean(data.connected));
      setDriveConfigured(data.configured !== false);
    } catch {
      setDriveConnected(false);
    }
  }, []);

  useEffect(() => {
    checkDriveStatus();
  }, [checkDriveStatus]);

  // Handle OAuth redirect query params
  useEffect(() => {
    if (!router.isReady) return;
    const { drive, reason } = router.query;
    if (drive === "connected") {
      setDriveConnected(true);
      setMessages((m) => [...m, { role: "assistant", text: "Google Drive connected. Click **Import from Drive** to add files.", sources: [] }]);
      router.replace("/", undefined, { shallow: true });
    } else if (drive === "error") {
      setMessages((m) => [...m, { role: "assistant", text: `Google Drive connection failed${reason ? `: ${reason}` : ""}.`, sources: [] }]);
      router.replace("/", undefined, { shallow: true });
    }
  }, [router.isReady, router.query]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("docmind-theme", next);
  };

  /** Call /api/embed to vectorize texts (pass sharedVocab for TF-IDF query embedding) */
  const embedTexts = useCallback(async (texts, sharedVocab = null) => {
    const res = await fetch("/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts, vocab: sharedVocab }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Embedding failed");
    return data;
  }, []);

  /** Index a document: chunk → embed → update state */
  const indexDocument = useCallback(async (name, text, type, size, existingChunks, existingDocs) => {
    const newChunkObjs = buildChunks(text, name);
    if (!newChunkObjs.length) return null;

    const allChunks = [...existingChunks, ...newChunkObjs];
    // Always re-embed all chunks so vectors share the same space (vocab or OpenAI dims)
    const textsToEmbed = allChunks.map((c) => c.text);
    const sharedVocab = embedMethod === "tfidf" ? vocab : null;
    const { embeddings, vocab: newVocab, method } = await embedTexts(textsToEmbed, sharedVocab);

    const embeddedChunks = allChunks.map((c, i) => ({ ...c, vec: embeddings[i] }));
    if (method === "tfidf" && newVocab) setVocab(newVocab);

    setEmbedMethod(method);
    const newDocs = [...existingDocs, { name, size, type, chunkCount: newChunkObjs.length }];

    return { chunks: embeddedChunks, docs: newDocs };
  }, [embedTexts, embedMethod, vocab]);

  /** Re-embed all chunks after delete/replace (rebuilds TF-IDF vocab from scratch) */
  const reembedAll = useCallback(async (newDocs, rawChunks) => {
    if (!rawChunks.length) {
      setDocs([]);
      setChunks([]);
      setVocab([]);
      return;
    }
    const textsToEmbed = rawChunks.map((c) => c.text);
    const { embeddings, vocab: newVocab, method } = await embedTexts(textsToEmbed, null);
    const embedded = rawChunks.map((c, i) => ({ ...c, vec: embeddings[i] }));
    if (method === "tfidf" && newVocab) setVocab(newVocab);
    setEmbedMethod(method);
    setChunks(embedded);
    setDocs(newDocs);
  }, [embedTexts]);

  /** Reset chat + retrieved chunks (used after doc changes) */
  function resetChatWithNotice(notice) {
    setRetrievedChunks([]);
    setMessages(notice ? [{ role: "assistant", text: notice, sources: [] }] : []);
  }

  // Load sample doc on mount
  useEffect(() => {
    (async () => {
      try {
        const result = await indexDocument(
          SAMPLE_DOC.name, SAMPLE_DOC.text, SAMPLE_DOC.type,
          SAMPLE_DOC.text.length, [], []
        );
        if (result) {
          setChunks(result.chunks);
          setDocs(result.docs);
        }
      } catch (e) {
        console.error("Sample doc load failed:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Extract text from file — PDF goes through /api/parse */
  async function extractFileText(file) {
    if (file.name.toLowerCase().endsWith(".pdf")) {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/pdf", "X-Filename": file.name },
        body: file,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "PDF parse failed");
      return data.text;
    }
    return file.text();
  }

  /** Index pasted or typed text as a virtual document */
  async function pasteAsDocument(text) {
    const trimmed = text.trim();
    if (!trimmed || uploading || docBusy) return false;

    const name = `pasted-text-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    setUploading(true);

    try {
      const result = await indexDocument(name, trimmed, "txt", trimmed.length, [...chunks], [...docs]);

      if (!result) {
        setMessages((m) => [...m, { role: "assistant", text: "Could not chunk pasted text — try a longer passage.", sources: [] }]);
        return false;
      }

      setChunks(result.chunks);
      setDocs(result.docs);
      const chunkCount = result.docs.find((d) => d.name === name)?.chunkCount ?? "?";
      setMessages((m) => [...m, {
        role: "assistant",
        text: `Added pasted text (${chunkCount} chunk${chunkCount === 1 ? "" : "s"}). Ask a question below.`,
        sources: [],
      }]);
      setInput("");
      return true;
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: `Paste error: ${e.message}`, sources: [] }]);
      return false;
    } finally {
      setUploading(false);
    }
  }

  /** Auto-index long pasted text (Option A) */
  function handleInputPaste(e) {
    const text = e.clipboardData?.getData("text/plain");
    if (!text || text.trim().length < PASTE_DOC_MIN_CHARS) return;

    e.preventDefault();
    pasteAsDocument(text);
  }

  async function handlePasteAsDocClick() {
    if (!input.trim()) return;
    await pasteAsDocument(input);
  }

  function connectGoogleDrive() {
    window.location.href = "/api/auth/google";
  }

  async function disconnectGoogleDrive() {
    await fetch("/api/auth/google/disconnect", { method: "POST" });
    setDriveConnected(false);
    setDriveModal(false);
    setMessages((m) => [...m, { role: "assistant", text: "Google Drive disconnected.", sources: [] }]);
  }

  async function openDriveModal() {
    setDriveModal(true);
    setDriveLoading(true);
    setDriveFiles([]);
    setDriveSelected(new Set());
    setBulkProgress(null);
    try {
      const res = await fetch("/api/drive/list");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to list files");
      setDriveFiles(data.files || []);
    } catch (e) {
      setDriveModal(false);
      setMessages((m) => [...m, { role: "assistant", text: `Drive error: ${e.message}`, sources: [] }]);
    }
    setDriveLoading(false);
  }

  // Toggle a single file checkbox
  function toggleDriveSelect(fileId) {
    setDriveSelected((prev) => {
      const next = new Set(prev);
      next.has(fileId) ? next.delete(fileId) : next.add(fileId);
      return next;
    });
  }

  // Toggle select all / deselect all
  function toggleSelectAll() {
    const importable = driveFiles.filter((f) => !docs.find((d) => d.name === `gdrive-${f.name}`));
    if (driveSelected.size === importable.length) {
      setDriveSelected(new Set());
    } else {
      setDriveSelected(new Set(importable.map((f) => f.id)));
    }
  }

  // Import all selected files with progress tracking
  async function importSelectedDriveFiles() {
    if (uploading || docBusy || driveImporting || driveSelected.size === 0) return;

    const filesToImport = driveFiles.filter((f) => driveSelected.has(f.id));
    setUploading(true);
    setBulkProgress({ done: 0, total: filesToImport.length, current: filesToImport[0]?.name });

    let currentChunks = [...chunks];
    let currentDocs = [...docs];
    const imported = [];
    const failed = [];

    for (let i = 0; i < filesToImport.length; i++) {
      const file = filesToImport[i];
      setDriveImporting(file.id);
      setBulkProgress({ done: i, total: filesToImport.length, current: file.name });

      try {
        const res = await fetch("/api/drive/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: file.id, name: file.name, mimeType: file.mimeType }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Import failed");

        const docName = `gdrive-${data.name}`;
        const result = await indexDocument(docName, data.text, data.type, data.size, currentChunks, currentDocs);
        if (result) {
          currentChunks = result.chunks;
          currentDocs = result.docs;
          imported.push(data.name);
        }
      } catch (e) {
        failed.push(`${file.name}: ${e.message}`);
      }
    }

    setChunks(currentChunks);
    setDocs(currentDocs);
    setDriveImporting(null);
    setUploading(false);
    setBulkProgress(null);
    setDriveSelected(new Set());
    setDriveModal(false);

    if (imported.length > 0) {
      setMessages((m) => [...m, {
        role: "assistant",
        text: `✅ Imported ${imported.length} file${imported.length > 1 ? "s" : ""} from Drive:\n${imported.map((n) => `• ${n}`).join("\n")}${failed.length > 0 ? `\n\n⚠️ ${failed.length} failed:\n${failed.join("\n")}` : ""}`,
        sources: [],
      }]);
    } else {
      setMessages((m) => [...m, { role: "assistant", text: `Drive import failed:\n${failed.join("\n")}`, sources: [] }]);
    }
  }

  async function importDriveFile(file) {
    if (uploading || docBusy || driveImporting) return;
    if (docs.find((d) => d.name === `gdrive-${file.name}`)) {
      setMessages((m) => [...m, { role: "assistant", text: `Already imported: ${file.name}`, sources: [] }]);
      return;
    }

    setDriveImporting(file.id);
    setUploading(true);

    try {
      const res = await fetch("/api/drive/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id, name: file.name, mimeType: file.mimeType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      const docName = `gdrive-${data.name}`;
      const result = await indexDocument(docName, data.text, data.type, data.size, [...chunks], [...docs]);
      if (result) {
        setChunks(result.chunks);
        setDocs(result.docs);
        const chunkCount = result.docs.find((d) => d.name === docName)?.chunkCount ?? "?";
        setMessages((m) => [...m, { role: "assistant", text: `Imported from Drive: **${data.name}** (${chunkCount} chunks)`, sources: [] }]);
        setDriveModal(false);
      }
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: `Drive import error: ${e.message}`, sources: [] }]);
    }

    setDriveImporting(null);
    setUploading(false);
  }

  async function handleFiles(files) {
    setUploading(true);
    let currentChunks = [...chunks];
    let currentDocs = [...docs];

    try {
      for (const file of files) {
        if (currentDocs.find((d) => d.name === file.name)) continue;

        const text = await extractFileText(file);
        const result = await indexDocument(
          file.name, text, fileType(file.name), file.size,
          currentChunks, currentDocs
        );
        if (result) {
          currentChunks = result.chunks;
          currentDocs = result.docs;
        }
      }
      setChunks(currentChunks);
      setDocs(currentDocs);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: `Upload error: ${e.message}`, sources: [] }]);
    }
    setUploading(false);
  }

  /** Remove a document and rebuild vectors */
  async function deleteDocument(docName) {
    if (docBusy || deletingDocs.has(docName)) return;
    setDocBusy(true);
    setDeletingDocs((prev) => new Set([...prev, docName]));

    const newDocs = docs.filter((d) => d.name !== docName);
    const newChunks = chunks.filter((c) => c.source !== docName);

    setTimeout(async () => {
      try {
        await reembedAll(newDocs, newChunks);
        resetChatWithNotice(`Removed: ${docName}`);
      } catch (e) {
        setMessages((m) => [...m, { role: "assistant", text: `Delete error: ${e.message}`, sources: [] }]);
      } finally {
        setDeletingDocs((prev) => {
          const next = new Set(prev);
          next.delete(docName);
          return next;
        });
        setDocBusy(false);
      }
    }, 300);
  }

  /** Open file picker to replace a document in-place */
  function triggerReplace(doc) {
    if (docBusy || uploading) return;
    replacingDocRef.current = doc;
    const input = replaceInputRef.current;
    if (!input) return;
    input.accept = acceptForDoc(doc);
    input.value = "";
    input.click();
  }

  /** Handle file selected for replace */
  async function handleReplaceFile(e) {
    const file = e.target.files?.[0];
    const targetDoc = replacingDocRef.current;
    replacingDocRef.current = null;
    if (!file || !targetDoc) return;

    setDocBusy(true);
    setUploading(true);

    try {
      const docIndex = docs.findIndex((d) => d.name === targetDoc.name);
      if (docIndex === -1) return;

      const text = await extractFileText(file);
      const newChunkObjs = buildChunks(text, file.name);
      if (!newChunkObjs.length) throw new Error("No searchable content in replacement file.");

      const remainingDocs = docs.filter((d) => d.name !== targetDoc.name);
      const newDoc = { name: file.name, size: file.size, type: fileType(file.name), chunkCount: newChunkObjs.length };
      const newDocs = [...remainingDocs.slice(0, docIndex), newDoc, ...remainingDocs.slice(docIndex)];

      // Preserve chunk order by doc position in list
      const orderedChunks = [];
      for (const d of newDocs) {
        if (d.name === file.name) {
          orderedChunks.push(...newChunkObjs);
        } else {
          orderedChunks.push(...chunks.filter((c) => c.source === d.name));
        }
      }

      await reembedAll(newDocs, orderedChunks);
      resetChatWithNotice(`Replaced: ${targetDoc.name} → ${file.name}`);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: `Replace error: ${e.message}`, sources: [] }]);
    }

    setUploading(false);
    setDocBusy(false);
  }

  /** Clear all documents and chat */
  async function clearAllDocuments() {
    if (docBusy || uploading) return;
    setDocBusy(true);
    setDeletingDocs(new Set(docs.map((d) => d.name)));

    setTimeout(async () => {
      setDocs([]);
      setChunks([]);
      setVocab([]);
      setRetrievedChunks([]);
      setMessages([]);
      setDeletingDocs(new Set());
      setDocBusy(false);
    }, 300);
  }

  async function sendQuery(query) {
    if (!query.trim() || loading) return;

    if (!chunks.length) {
      setMessages((m) => [...m,
        { role: "user", text: query.trim() },
        { role: "assistant", text: "No documents yet. Paste text here (300+ chars auto-adds) or upload files in the sidebar.", sources: [] },
      ]);
      setInput("");
      return;
    }

    setInput("");
    setLoading(true);
    setRetrievedChunks([]);
    setMessages((m) => [...m, { role: "user", text: query }]);

    try {
      // Step 1: Embed query (must use same vocab as chunks for TF-IDF)
      setPipeStep(0);
      const queryVocab = embedMethod === "tfidf" && vocab.length ? vocab : null;
      const { embeddings } = await embedTexts([query], queryVocab);
      const queryVec = embeddings[0];

      setPipeStep(1);
      await new Promise((r) => setTimeout(r, 150));

      // Step 2: Retrieve
      setPipeStep(2);
      const hits = retrieve(queryVec, chunks, 4);
      setRetrievedChunks(hits);

      if (!hits.length) {
        setMessages((m) => [...m, { role: "assistant", text: "No searchable content found. Upload documents with enough text to chunk.", sources: [] }]);
        setPipeStep(-1);
        setLoading(false);
        return;
      }

      setPipeStep(3);

      // Build history from last 6 messages (exclude current user msg we just added)
      const history = messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));

      const payload = hits.map(({ text, source, scorePct, id }) => ({ text, source, scorePct, id }));

      // Step 3: Stream from Claude
      const res = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, chunks: payload, history, stream: true }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "RAG request failed");
      }

      // Add placeholder assistant message for streaming
      setMessages((m) => [...m, { role: "assistant", text: "", sources: [], streaming: true }]);
      setStreaming(true);
      setLoading(false);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let sources = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "sources") {
              sources = evt.sources;
            } else if (evt.type === "token") {
              fullText += evt.text;
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", text: fullText, sources, streaming: true };
                return copy;
              });
            } else if (evt.type === "error") {
              throw new Error(evt.error);
            }
          } catch (parseErr) {
            if (parseErr.message !== "Unexpected end of JSON input") throw parseErr;
          }
        }
      }

      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", text: fullText, sources, streaming: false };
        return copy;
      });
      setStreaming(false);
      setPipeStep(4);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: "Error: " + e.message, sources: [] }]);
      setStreaming(false);
    }

    setTimeout(() => setPipeStep(-1), 2000);
    setLoading(false);
  }

  function clearChat() {
    setMessages([]);
    setRetrievedChunks([]);
  }

  function copyMessage(text, idx) {
    navigator.clipboard.writeText(text.replace(/<[^>]+>/g, ""));
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  const ready = chunks.length > 0;
  const embedLabel = embedMethod === "openai" ? "OpenAI Embeddings" : "TF-IDF";

  return (
    <>
      <Head>
        <title>DocMind RAG</title>
        <meta name="description" content="RAG-powered document Q&A — portfolio AI project" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      </Head>

      <div className="app-root" style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "'DM Mono', monospace", padding: "16px" }}>
        {/* Header */}
        <div className="header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 14, borderBottom: `0.5px solid ${t.border}`, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(124,110,247,0.14)", border: `1px solid ${t.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🧠</div>
            <div>
              <div style={{ fontFamily: "Syne, sans-serif", fontSize: 18, fontWeight: 700 }}>DocMind RAG</div>
              <div style={{ fontSize: 10, color: t.dim, textTransform: "uppercase", letterSpacing: "0.08em" }}>Retrieval-Augmented Generation</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {visitCount != null && visitCount > 0 && (
              <div style={{ fontSize: 10, padding: "4px 12px", borderRadius: 20, background: "rgba(124,110,247,0.1)", color: t.accentLight, border: `0.5px solid rgba(124,110,247,0.3)`, display: "flex", alignItems: "center", gap: 5 }}>
                👥 {visitCount.toLocaleString()} {visitCount === 1 ? "person has" : "people have"} tried DocMind
              </div>
            )}
            <button onClick={toggleTheme} title="Toggle theme"
              style={{ background: t.surface2, border: `0.5px solid ${t.border2}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 14, color: t.text }}>
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <div style={{ fontSize: 10, padding: "4px 12px", borderRadius: 20, background: "rgba(74,222,128,0.1)", color: t.success, border: `0.5px solid rgba(74,222,128,0.3)`, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: t.success, display: "inline-block" }}></span>
              Claude · {embedLabel}
            </div>
          </div>
        </div>

        <div className="layout-grid" style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 16 }}>
          {/* Sidebar */}
          <aside>
            <div style={{ background: t.surface, border: `0.5px solid ${t.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", borderBottom: `0.5px solid ${t.border}`, fontSize: 10, color: t.dim, textTransform: "uppercase", letterSpacing: "0.1em" }}>📁 Knowledge Base</div>

              <label style={{ display: "block", margin: 10, border: `1px dashed ${t.border2}`, borderRadius: 8, padding: "16px 10px", textAlign: "center", cursor: uploading ? "wait" : "pointer", opacity: uploading ? 0.6 : 1 }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files)); }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{uploading ? "⏳" : "☁️"}</div>
                <div style={{ fontSize: 11, color: t.muted }}>{uploading ? "Processing…" : <>Drop files or <span style={{ color: t.accentLight }}>browse</span></>}</div>
                <div style={{ fontSize: 10, color: t.dim, marginTop: 3 }}>TXT · MD · CSV · PDF · PY · JS</div>
                <input type="file" multiple accept=".txt,.md,.csv,.pdf,.py,.js,.html,.json" style={{ display: "none" }}
                  disabled={uploading}
                  onChange={(e) => handleFiles(Array.from(e.target.files))} />
              </label>

              {/* Google Drive */}
              {driveConfigured && (
                <div style={{ padding: "0 10px 10px", borderBottom: docs.length > 0 ? `0.5px solid ${t.border}` : "none" }}>
                  {!driveConnected ? (
                    <button
                      type="button"
                      onClick={connectGoogleDrive}
                      disabled={uploading || docBusy}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: 8,
                        background: "rgba(66,133,244,0.12)",
                        border: "0.5px solid rgba(66,133,244,0.4)",
                        color: "#8ab4f8",
                        cursor: "pointer",
                        fontSize: 11,
                        fontFamily: "'DM Mono', monospace",
                      }}
                    >
                      📁 Connect Google Drive
                    </button>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 9, color: t.success }}>
                        <span>● Drive connected</span>
                        <button
                          type="button"
                          onClick={disconnectGoogleDrive}
                          style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 9, fontFamily: "'DM Mono', monospace" }}
                        >
                          Disconnect
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={openDriveModal}
                        disabled={uploading || docBusy || driveLoading}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 8,
                          background: "rgba(66,133,244,0.12)",
                          border: "0.5px solid rgba(66,133,244,0.4)",
                          color: "#8ab4f8",
                          cursor: "pointer",
                          fontSize: 11,
                          fontFamily: "'DM Mono', monospace",
                        }}
                      >
                        {driveLoading ? "Loading…" : "📂 Import from Drive"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Doc list with chunk counts + management */}
              {docs.length > 0 && (
                <div style={{ padding: "0 8px 8px" }}>
                  {docs.map((d) => (
                    <div
                      key={d.name}
                      className={`doc-item${deletingDocs.has(d.name) ? " doc-item-deleting" : ""}`}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 6, background: t.surface2, border: `0.5px solid ${t.accent}`, marginBottom: 3 }}
                    >
                      <span style={{ fontSize: 12, flexShrink: 0 }}>{fileIcon(d.name)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                        <div style={{ fontSize: 9, color: t.dim }}>{d.chunkCount ?? "?"} chunks</div>
                      </div>
                      <div className="doc-actions" style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        <button
                          type="button"
                          title="Replace"
                          disabled={docBusy || uploading}
                          onClick={() => triggerReplace(d)}
                          style={{ width: 22, height: 22, borderRadius: 5, background: "rgba(124,110,247,0.2)", border: "0.5px solid #7c6ef7", color: t.accentLight, cursor: docBusy || uploading ? "not-allowed" : "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontFamily: "'DM Mono', monospace", opacity: docBusy || uploading ? 0.4 : 1 }}
                        >↺</button>
                        <button
                          type="button"
                          title="Delete"
                          disabled={docBusy || uploading}
                          onClick={() => deleteDocument(d.name)}
                          style={{ width: 22, height: 22, borderRadius: 5, background: "rgba(248,113,113,0.2)", border: "0.5px solid #f87171", color: "#f87171", cursor: docBusy || uploading ? "not-allowed" : "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontFamily: "'DM Mono', monospace", opacity: docBusy || uploading ? 0.4 : 1 }}
                        >✕</button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={clearAllDocuments}
                    disabled={docBusy || uploading}
                    style={{ width: "100%", marginTop: 6, padding: "6px 10px", borderRadius: 6, background: "transparent", border: `0.5px solid ${t.border2}`, color: t.muted, cursor: docBusy || uploading ? "not-allowed" : "pointer", fontSize: 10, fontFamily: "'DM Mono', monospace", opacity: docBusy || uploading ? 0.4 : 1 }}
                  >
                    Clear all
                  </button>
                  <input
                    ref={replaceInputRef}
                    type="file"
                    style={{ display: "none" }}
                    onChange={handleReplaceFile}
                  />
                </div>
              )}

              {/* Retrieved chunks highlight */}
              {retrievedChunks.length > 0 && (
                <div style={{ padding: "8px", borderTop: `0.5px solid ${t.border}` }}>
                  <div style={{ fontSize: 9, color: t.dim, textTransform: "uppercase", marginBottom: 6, letterSpacing: "0.08em" }}>Last Retrieved</div>
                  {retrievedChunks.map((c) => (
                    <div key={c.id} style={{ fontSize: 9, padding: "4px 6px", marginBottom: 3, borderRadius: 4, background: t.surface2, border: `0.5px solid ${t.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ color: t.accentLight }}>{c.source}</span>
                        <span style={{ color: t.success }}>{c.scorePct}%</span>
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: t.border, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${c.scorePct}%`, background: t.accent, borderRadius: 2 }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: "8px 8px", borderTop: `0.5px solid ${t.border}` }}>
                {[["Docs", docs.length], ["Chunks", chunks.length]].map(([label, val]) => (
                  <div key={label} style={{ background: t.surface2, borderRadius: 6, padding: "7px 8px", textAlign: "center" }}>
                    <div style={{ fontFamily: "Syne, sans-serif", fontSize: 18, fontWeight: 700, color: t.accentLight }}>{val}</div>
                    <div style={{ fontSize: 9, color: t.dim, textTransform: "uppercase" }}>{label}</div>
                  </div>
                ))}
              </div>

              <div style={{ padding: "8px 12px", borderTop: `0.5px solid ${t.border}`, display: "flex", flexWrap: "wrap", gap: 3 }}>
                {[embedLabel, "Cosine Sim", "Top-K", "Streaming", "Claude API"].map((tag) => (
                  <span key={tag} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 20, background: t.surface2, color: t.muted, border: `0.5px solid ${t.border}` }}>{tag}</span>
                ))}
              </div>
            </div>
          </aside>

          {/* Chat */}
          <div style={{ background: t.surface, border: `0.5px solid ${t.border}`, borderRadius: 12, display: "flex", flexDirection: "column", height: "calc(100vh - 110px)", minHeight: 400 }}>
            <div style={{ padding: "10px 14px", borderBottom: `0.5px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: t.dim, textTransform: "uppercase", letterSpacing: "0.1em" }}>💬 Q&A Chat</span>
              {messages.length > 0 && (
                <button onClick={clearChat}
                  style={{ fontSize: 10, padding: "3px 10px", borderRadius: 6, background: "transparent", border: `0.5px solid ${t.border2}`, color: t.muted, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>
                  Clear chat
                </button>
              )}
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              {messages.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, textAlign: "center" }}>
                  <div style={{ fontSize: 40 }}>🧠</div>
                  <div style={{ fontFamily: "Syne, sans-serif", fontSize: 15, fontWeight: 700 }}>{ready ? "Ready to answer!" : "Upload docs to begin"}</div>
                  <div style={{ fontSize: 12, color: t.muted, maxWidth: 280, lineHeight: 1.6 }}>
                    {ready
                      ? "Paste text, upload files, or ask questions. Long paste auto-adds as a document."
                      : "Paste text here or upload files in the sidebar to begin."}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 8, flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: m.role === "assistant" ? "rgba(124,110,247,0.14)" : t.surface2, border: `0.5px solid ${m.role === "assistant" ? t.accent : t.border2}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>
                    {m.role === "assistant" ? "🧠" : "👤"}
                  </div>
                  <div style={{ maxWidth: "85%", position: "relative" }}>
                    <div style={{ padding: "9px 13px", fontSize: 13, lineHeight: 1.65, borderRadius: m.role === "assistant" ? "3px 10px 10px 10px" : "10px 3px 10px 10px", background: m.role === "assistant" ? t.surface2 : t.userBg, border: `0.5px solid ${m.role === "assistant" ? t.border : "rgba(124,110,247,0.25)"}` }}>
                      <span dangerouslySetInnerHTML={{ __html: formatMarkdown(m.text) }} />
                      {m.streaming && <span className="stream-cursor" style={{ color: t.accent }}>▍</span>}
                    </div>
                    {m.role === "assistant" && m.text && !m.streaming && (
                      <button onClick={() => copyMessage(m.text, i)} title="Copy"
                        style={{ position: "absolute", top: 4, right: 4, background: t.surface, border: `0.5px solid ${t.border}`, borderRadius: 4, padding: "2px 6px", fontSize: 9, cursor: "pointer", color: t.muted, fontFamily: "'DM Mono', monospace" }}>
                        {copiedIdx === i ? "✓ Copied" : "Copy"}
                      </button>
                    )}
                    {m.sources?.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                        {m.sources.map((s, si) => (
                          <div key={si} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "0.5px solid rgba(251,191,36,0.25)", whiteSpace: "nowrap" }}>
                              {fileIcon(s.source)} {s.source}
                              {s.scorePct != null && ` · ${s.scorePct}%`}
                            </span>
                            {s.scorePct != null && (
                              <div style={{ flex: 1, maxWidth: 80, height: 4, borderRadius: 2, background: t.border, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${s.scorePct}%`, background: "#fbbf24", borderRadius: 2 }} />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && !streaming && (
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: "rgba(124,110,247,0.14)", border: `0.5px solid ${t.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>🧠</div>
                  <div style={{ padding: "9px 13px", background: t.surface2, borderRadius: "3px 10px 10px 10px", border: `0.5px solid ${t.border}`, display: "flex", gap: 4, alignItems: "center" }}>
                    {[0, 1, 2].map((i) => <span key={i} className="dot-blink" style={{ width: 6, height: 6, borderRadius: "50%", background: t.accentLight, display: "inline-block", animationDelay: `${i * 0.2}s` }}></span>)}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Pipeline */}
            {pipeStep >= 0 && (
              <div style={{ padding: "8px 14px", borderTop: `0.5px solid ${t.border}`, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                {PIPE_STEPS.map((s, i) => (
                  <span key={s}>
                    <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.05em", color: i < pipeStep ? t.success : i === pipeStep ? t.accentLight : t.dim, background: i === pipeStep ? "rgba(124,110,247,0.14)" : "transparent" }}>{s}</span>
                    {i < PIPE_STEPS.length - 1 && <span style={{ color: t.dim, fontSize: 9 }}> › </span>}
                  </span>
                ))}
              </div>
            )}

            {/* Quick prompts */}
            {ready && (
              <div style={{ padding: "8px 10px", borderTop: `0.5px solid ${t.border}`, display: "flex", flexWrap: "wrap", gap: 5 }}>
                {QUICK.map(({ label, q }) => (
                  <button key={label} onClick={() => sendQuery(q)} disabled={loading || streaming}
                    style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, padding: "5px 11px", borderRadius: 20, background: t.surface2, border: `0.5px solid ${t.accent}`, color: t.accentLight, cursor: "pointer" }}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Input — multiline textarea (Option B) + paste-as-doc (Option A) */}
            <div style={{ padding: 10, borderTop: `0.5px solid ${t.border}` }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onPaste={handleInputPaste}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendQuery(input);
                    }
                  }}
                  placeholder="Paste text or ask a question… (Shift+Enter for new line)"
                  disabled={loading || streaming || uploading}
                  rows={1}
                  style={{
                    flex: 1,
                    background: t.surface2,
                    border: `0.5px solid ${t.border2}`,
                    borderRadius: 8,
                    padding: "9px 12px",
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 13,
                    color: t.text,
                    outline: "none",
                    resize: "none",
                    minHeight: 38,
                    maxHeight: 160,
                    lineHeight: 1.5,
                  }}
                />
                <button
                  onClick={() => sendQuery(input)}
                  disabled={loading || streaming || uploading || !input.trim()}
                  title="Send"
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 8,
                    background: t.accent,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 16,
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    opacity: (loading || streaming || uploading || !input.trim()) ? 0.5 : 1,
                  }}
                >→</button>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 9, color: t.dim }}>
                  Enter to send · Shift+Enter new line · Paste 300+ chars to auto-add
                </span>
                <button
                  type="button"
                  onClick={handlePasteAsDocClick}
                  disabled={loading || streaming || uploading || input.trim().length < 50}
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 10,
                    padding: "4px 10px",
                    borderRadius: 6,
                    background: "rgba(124,110,247,0.2)",
                    border: "0.5px solid #7c6ef7",
                    color: t.accentLight,
                    cursor: (loading || streaming || uploading || input.trim().length < 50) ? "not-allowed" : "pointer",
                    opacity: (loading || streaming || uploading || input.trim().length < 50) ? 0.5 : 1,
                  }}
                >
                  📋 Paste as doc
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Google Drive file picker modal */}
        {driveModal && (() => {
          const alreadyImported = (f) => Boolean(docs.find((d) => d.name === `gdrive-${f.name}`));
          const importableFiles = driveFiles.filter((f) => !alreadyImported(f));
          const allSelected = importableFiles.length > 0 && driveSelected.size === importableFiles.length;
          const isBusy = Boolean(driveImporting) || Boolean(bulkProgress);

          return (
            <div
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}
              onClick={() => !isBusy && setDriveModal(false)}
            >
              <div
                style={{ background: t.surface, border: `0.5px solid ${t.border}`, borderRadius: 12, width: "100%", maxWidth: 460, maxHeight: "75vh", display: "flex", flexDirection: "column" }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div style={{ padding: "12px 14px", borderBottom: `0.5px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "Syne, sans-serif" }}>Import from Google Drive</span>
                  <button type="button" onClick={() => !isBusy && setDriveModal(false)} style={{ background: "none", border: "none", color: t.muted, cursor: isBusy ? "not-allowed" : "pointer", fontSize: 16 }}>✕</button>
                </div>

                {/* Progress bar — shown during bulk import */}
                {bulkProgress && (
                  <div style={{ padding: "8px 14px", borderBottom: `0.5px solid ${t.border}`, background: "rgba(124,110,247,0.08)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: t.accent, fontFamily: "'DM Mono', monospace" }}>
                        Importing {bulkProgress.done + 1} of {bulkProgress.total}…
                      </span>
                      <span style={{ fontSize: 10, color: t.muted, fontFamily: "'DM Mono', monospace" }}>
                        {Math.round((bulkProgress.done / bulkProgress.total) * 100)}%
                      </span>
                    </div>
                    <div style={{ height: 3, background: t.surface2, borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(bulkProgress.done / bulkProgress.total) * 100}%`, background: t.accent, borderRadius: 99, transition: "width 0.3s ease" }} />
                    </div>
                    <div style={{ fontSize: 9, color: t.dim, marginTop: 3, fontFamily: "'DM Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {bulkProgress.current}
                    </div>
                  </div>
                )}

                {/* Select All toolbar */}
                {!driveLoading && importableFiles.length > 0 && !bulkProgress && (
                  <div style={{ padding: "6px 14px", borderBottom: `0.5px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 10, color: t.muted, fontFamily: "'DM Mono', monospace" }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        disabled={isBusy}
                        style={{ accentColor: t.accent, width: 13, height: 13 }}
                      />
                      {allSelected ? "Deselect all" : `Select all (${importableFiles.length})`}
                    </label>
                    {driveSelected.size > 0 && (
                      <span style={{ fontSize: 10, color: t.accent, fontFamily: "'DM Mono', monospace" }}>
                        {driveSelected.size} selected
                      </span>
                    )}
                  </div>
                )}

                {/* File list */}
                <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
                  {driveLoading ? (
                    <div style={{ padding: 20, textAlign: "center", color: t.muted, fontSize: 12 }}>Loading files…</div>
                  ) : driveFiles.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: t.muted, fontSize: 12 }}>No importable files found.</div>
                  ) : (
                    driveFiles.map((f) => {
                      const already = alreadyImported(f);
                      const isSelected = driveSelected.has(f.id);
                      const isThisImporting = driveImporting === f.id;
                      return (
                        <div
                          key={f.id}
                          onClick={() => !isBusy && !already && toggleDriveSelect(f.id)}
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 10px",
                            marginBottom: 4,
                            borderRadius: 8,
                            background: isThisImporting ? "rgba(124,110,247,0.2)" : isSelected ? "rgba(124,110,247,0.1)" : t.surface2,
                            border: `0.5px solid ${isSelected ? t.accent : t.border}`,
                            cursor: isBusy || already ? "not-allowed" : "pointer",
                            opacity: already ? 0.45 : 1,
                            textAlign: "left",
                            fontFamily: "'DM Mono', monospace",
                            color: t.text,
                            transition: "background 0.15s, border 0.15s",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected || already}
                            onChange={() => !isBusy && !already && toggleDriveSelect(f.id)}
                            disabled={isBusy || already}
                            onClick={(e) => e.stopPropagation()}
                            style={{ accentColor: t.accent, width: 13, height: 13, flexShrink: 0 }}
                          />
                          <span style={{ fontSize: 14 }}>
                            {f.mimeType === "application/pdf" ? "📕" : f.mimeType?.includes("spreadsheet") ? "📊" : f.mimeType?.includes("document") ? "📝" : "📄"}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                            <div style={{ fontSize: 9, color: t.dim }}>
                              {already ? "✓ Already imported" : isThisImporting ? "Importing…" : f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : ""}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer — Import button */}
                {!driveLoading && !bulkProgress && (
                  <div style={{ padding: "10px 14px", borderTop: `0.5px solid ${t.border}`, display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setDriveModal(false)}
                      disabled={isBusy}
                      style={{ flex: 1, padding: "8px 0", borderRadius: 8, background: t.surface2, border: `0.5px solid ${t.border}`, color: t.muted, fontSize: 11, cursor: isBusy ? "not-allowed" : "pointer", fontFamily: "'DM Mono', monospace" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={importSelectedDriveFiles}
                      disabled={isBusy || driveSelected.size === 0}
                      style={{
                        flex: 2,
                        padding: "8px 0",
                        borderRadius: 8,
                        background: driveSelected.size > 0 ? t.accent : t.surface2,
                        border: "none",
                        color: driveSelected.size > 0 ? "#fff" : t.dim,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: isBusy || driveSelected.size === 0 ? "not-allowed" : "pointer",
                        fontFamily: "Syne, sans-serif",
                        transition: "background 0.15s",
                      }}
                    >
                      {driveSelected.size === 0
                        ? "Select files to import"
                        : `Import ${driveSelected.size} file${driveSelected.size > 1 ? "s" : ""}`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        @keyframes blink { 0%,80%,100%{opacity:0.2;transform:scale(0.8)} 40%{opacity:1;transform:scale(1)} }
        @keyframes cursor-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes doc-fade-out { to { opacity: 0; transform: translateX(-8px); max-height: 0; margin: 0; padding: 0; } }
        .stream-cursor { animation: cursor-blink 0.8s step-end infinite; margin-left: 1px; }
        .dot-blink { animation: blink 1.2s infinite; }
        .doc-item { transition: opacity 0.3s ease, transform 0.3s ease; }
        .doc-item-deleting { animation: doc-fade-out 0.3s ease forwards; pointer-events: none; }
        .doc-item .doc-actions { opacity: 0; transition: opacity 0.15s ease; }
        .doc-item:hover .doc-actions { opacity: 1; }
        @media (hover: none) { .doc-item .doc-actions { opacity: 1; } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.3); border-radius: 4px; }
        @media (max-width: 768px) {
          .layout-grid { grid-template-columns: 1fr !important; }
          .header { flex-direction: column; align-items: flex-start !important; }
        }
      `}</style>
    </>
  );
}
