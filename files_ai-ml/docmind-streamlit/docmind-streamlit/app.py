import streamlit as st
import anthropic
import numpy as np
import re
from collections import Counter

# ── Page config ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="DocMind RAG",
    page_icon="🧠",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Custom CSS ────────────────────────────────────────────────────────────────
st.markdown("""
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap');
  html, body, [class*="css"] { font-family: 'DM Mono', monospace; }
  .main { background: #0d0d14; }
  .stApp { background: #0d0d14; color: #eeebff; }

  .title-block { padding: 1rem 0 0.5rem; }
  .title-block h1 { font-family: 'Syne', sans-serif; font-size: 2rem; font-weight: 800;
    background: linear-gradient(135deg, #a594f9, #7c6ef7); -webkit-background-clip: text;
    -webkit-text-fill-color: transparent; margin: 0; }
  .title-block p { color: #8883aa; font-size: 0.8rem; text-transform: uppercase;
    letter-spacing: 0.1em; margin: 0.25rem 0 0; }

  .metric-card { background: #16161f; border: 0.5px solid rgba(255,255,255,0.08);
    border-radius: 10px; padding: 1rem; text-align: center; }
  .metric-n { font-family: 'Syne', sans-serif; font-size: 2rem; font-weight: 700; color: #a594f9; }
  .metric-l { font-size: 0.7rem; color: #4a4768; text-transform: uppercase; letter-spacing: 0.1em; }

  .pipeline { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0;
    font-size: 0.75rem; flex-wrap: wrap; }
  .pipe-step { padding: 0.25rem 0.75rem; border-radius: 20px; border: 0.5px solid rgba(255,255,255,0.1);
    color: #4a4768; background: #16161f; }
  .pipe-step.active { color: #a594f9; background: rgba(124,110,247,0.14);
    border-color: rgba(124,110,247,0.4); font-weight: 500; }
  .pipe-step.done { color: #4ade80; border-color: rgba(74,222,128,0.3); }
  .pipe-arrow { color: #4a4768; }

  .source-badge { display: inline-block; font-size: 0.7rem; padding: 0.15rem 0.6rem;
    border-radius: 20px; background: rgba(251,191,36,0.1); color: #fbbf24;
    border: 0.5px solid rgba(251,191,36,0.3); margin: 0.1rem; }

  div[data-testid="stChatMessage"] { background: #16161f;
    border: 0.5px solid rgba(255,255,255,0.07); border-radius: 10px; }

  .stButton button { background: rgba(124,110,247,0.14) !important;
    border: 0.5px solid #7c6ef7 !important; color: #a594f9 !important;
    border-radius: 20px !important; font-family: 'DM Mono', monospace !important;
    font-size: 0.8rem !important; transition: all 0.2s !important; }
  .stButton button:hover { background: rgba(124,110,247,0.25) !important; }

  .tech-tag { display: inline-block; font-size: 0.65rem; padding: 0.15rem 0.5rem;
    border-radius: 20px; background: #1e1e2a; color: #8883aa;
    border: 0.5px solid rgba(255,255,255,0.07); margin: 0.1rem; }

  .stTextInput input, .stTextArea textarea {
    background: #1e1e2a !important; border-color: rgba(255,255,255,0.13) !important;
    color: #eeebff !important; font-family: 'DM Mono', monospace !important; }
  .stFileUploader { background: #16161f; border-radius: 10px; }
</style>
""", unsafe_allow_html=True)

# ── RAG Core ──────────────────────────────────────────────────────────────────
def chunk_text(text: str, size: int = 400, overlap: int = 80) -> list[str]:
    words = text.split()
    chunks = []
    for i in range(0, len(words), size - overlap):
        chunk = " ".join(words[i:i + size])
        if len(chunk.strip()) > 20:
            chunks.append(chunk)
    return chunks

def build_vocab(chunks: list[str]) -> list[str]:
    all_text = " ".join(chunks)
    words = re.findall(r'\b[a-z]{3,}\b', all_text.lower())
    freq = Counter(words)
    return [w for w, _ in freq.most_common(1000)]

def tfidf_embed(text: str, vocab: list[str]) -> np.ndarray:
    words = re.findall(r'\b[a-z]{3,}\b', text.lower())
    total = len(words) if words else 1
    tf = Counter(words)
    vec = np.array([tf.get(w, 0) / total for w in vocab], dtype=np.float32)
    norm = np.linalg.norm(vec)
    return vec / norm if norm > 0 else vec

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    return float(np.dot(a, b) / denom) if denom > 0 else 0.0

def retrieve(query: str, top_k: int = 4) -> list[dict]:
    if not st.session_state.vocab or not st.session_state.chunks:
        return []
    qvec = tfidf_embed(query, st.session_state.vocab)
    scored = [
        {**c, "score": cosine_similarity(qvec, c["vec"])}
        for c in st.session_state.chunks
    ]
    scored.sort(key=lambda x: x["score"], reverse=True)
    return [c for c in scored[:top_k] if c["score"] > 0.003]

def answer_with_claude(query: str, context_chunks: list[dict]) -> tuple[str, list[str]]:
    client = anthropic.Anthropic(api_key=st.session_state.api_key)
    sources = list({c["source"] for c in context_chunks})

    if context_chunks:
        ctx = "\n\n---\n\n".join(
            f"[Source: {c['source']}]\n{c['text']}" for c in context_chunks
        )
        user_msg = f"Document context:\n{ctx}\n\nQuestion: {query}"
    else:
        user_msg = f"No relevant chunks found for: '{query}'. Tell the user politely."

    system = (
        "You are a RAG-powered document Q&A assistant. "
        "Answer using ONLY the provided document context. "
        "Be concise (2-5 sentences). Use **bold** for key terms. "
        "If the context doesn't contain the answer, say so clearly."
    )

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1000,
        system=system,
        messages=[{"role": "user", "content": user_msg}],
    )
    return response.content[0].text, sources

# ── Session state init ────────────────────────────────────────────────────────
for key, default in {
    "chunks": [],
    "vocab": [],
    "messages": [],
    "api_key": "",
}.items():
    if key not in st.session_state:
        st.session_state[key] = default

# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("""
    <div class='title-block'>
      <h1>🧠 DocMind RAG</h1>
      <p>Retrieval-Augmented Generation</p>
    </div>
    """, unsafe_allow_html=True)

    st.divider()

    # API Key
    api_key = st.text_input(
        "Anthropic API Key",
        type="password",
        placeholder="sk-ant-...",
        value=st.session_state.api_key,
        help="Get yours at console.anthropic.com",
    )
    if api_key:
        st.session_state.api_key = api_key
        st.success("✅ API key set")

    st.divider()

    # File upload
    st.markdown("**📁 Knowledge Base**")
    uploaded = st.file_uploader(
        "Upload documents",
        type=["txt", "md", "csv", "py", "js", "html", "json"],
        accept_multiple_files=True,
        help="Upload any text files to query",
    )

    if uploaded:
        new_sources = {c["source"] for c in st.session_state.chunks}
        added = []
        for f in uploaded:
            if f.name not in new_sources:
                text = f.read().decode("utf-8", errors="ignore")
                chunks = chunk_text(text)
                for i, ch in enumerate(chunks):
                    st.session_state.chunks.append({
                        "text": ch, "source": f.name,
                        "id": f"{f.name}-{i}", "vec": None,
                    })
                added.append(f.name)

        if added:
            vocab = build_vocab([c["text"] for c in st.session_state.chunks])
            st.session_state.vocab = vocab
            for c in st.session_state.chunks:
                if c["vec"] is None:
                    c["vec"] = tfidf_embed(c["text"], vocab)
            st.success(f"✅ Added: {', '.join(added)}")

    # Stats
    if st.session_state.chunks:
        sources = list({c["source"] for c in st.session_state.chunks})
        col1, col2 = st.columns(2)
        with col1:
            st.markdown(f"""
            <div class='metric-card'>
              <div class='metric-n'>{len(sources)}</div>
              <div class='metric-l'>Documents</div>
            </div>""", unsafe_allow_html=True)
        with col2:
            st.markdown(f"""
            <div class='metric-card'>
              <div class='metric-n'>{len(st.session_state.chunks)}</div>
              <div class='metric-l'>Chunks</div>
            </div>""", unsafe_allow_html=True)

        st.markdown("**📄 Loaded files:**")
        for s in sources:
            st.markdown(f"<span class='tech-tag'>📄 {s}</span>", unsafe_allow_html=True)

        if st.button("🗑️ Clear all documents"):
            st.session_state.chunks = []
            st.session_state.vocab = []
            st.rerun()

    st.divider()
    st.markdown("""
    <div style='font-size:0.7rem;color:#4a4768;line-height:1.6;'>
      <strong style='color:#8883aa;'>How it works:</strong><br>
      1. 📄 Docs split into chunks<br>
      2. 🔢 TF-IDF vectorization<br>
      3. 🔍 Cosine similarity search<br>
      4. 💉 Top-K context injection<br>
      5. 🤖 Claude generates answer<br><br>
      <span class='tech-tag'>LangChain pattern</span>
      <span class='tech-tag'>Vector DB ready</span>
      <span class='tech-tag'>Claude API</span>
    </div>
    """, unsafe_allow_html=True)

# ── Main area ─────────────────────────────────────────────────────────────────
st.markdown("<h2 style='color:#eeebff;font-family:Syne,sans-serif;'>Document Q&A</h2>", unsafe_allow_html=True)

# Quick prompts
if st.session_state.chunks:
    st.markdown("**Quick questions:**")
    cols = st.columns(4)
    quick = [
        ("💡 What is RAG?", "What is RAG and how does it work?"),
        ("🔥 Top AI skills", "What AI skills are most in demand for jobs in 2026?"),
        ("💰 Salary info", "What salary can AI engineers expect?"),
        ("📄 Summarize", "Summarize the key points from all documents"),
    ]
    for col, (label, prompt) in zip(cols, quick):
        with col:
            if st.button(label, use_container_width=True):
                st.session_state._quick_prompt = prompt

# Chat history
for msg in st.session_state.messages:
    with st.chat_message(msg["role"], avatar="🧠" if msg["role"] == "assistant" else "👤"):
        st.markdown(msg["content"])
        if msg.get("sources"):
            for src in msg["sources"]:
                st.markdown(f"<span class='source-badge'>📄 {src}</span>", unsafe_allow_html=True)

# Handle quick prompt
if hasattr(st.session_state, "_quick_prompt") and st.session_state._quick_prompt:
    prompt = st.session_state._quick_prompt
    st.session_state._quick_prompt = None
    st.session_state._pending = prompt
    st.rerun()

# Process pending query
if hasattr(st.session_state, "_pending") and st.session_state._pending:
    query = st.session_state._pending
    st.session_state._pending = None

    with st.chat_message("user", avatar="👤"):
        st.markdown(query)
    st.session_state.messages.append({"role": "user", "content": query})

    with st.chat_message("assistant", avatar="🧠"):
        # Pipeline display
        st.markdown("""
        <div class='pipeline'>
          <span class='pipe-step done'>Query</span><span class='pipe-arrow'>›</span>
          <span class='pipe-step done'>Embed</span><span class='pipe-arrow'>›</span>
          <span class='pipe-step done'>Retrieve</span><span class='pipe-arrow'>›</span>
          <span class='pipe-step active'>Generate</span><span class='pipe-arrow'>›</span>
          <span class='pipe-step'>Done</span>
        </div>
        """, unsafe_allow_html=True)

        if not st.session_state.api_key:
            st.error("⚠️ Please enter your Anthropic API key in the sidebar.")
        elif not st.session_state.chunks:
            st.error("⚠️ Please upload at least one document.")
        else:
            with st.spinner("Retrieving and generating..."):
                hits = retrieve(query)
                answer, sources = answer_with_claude(query, hits)

            st.markdown(answer)
            if sources:
                for src in sources:
                    st.markdown(f"<span class='source-badge'>📄 {src}</span>", unsafe_allow_html=True)

            st.session_state.messages.append({
                "role": "assistant",
                "content": answer,
                "sources": sources,
            })

# Chat input
if prompt := st.chat_input("Ask anything about your documents…"):
    st.session_state._pending = prompt
    st.rerun()

# Empty state
if not st.session_state.chunks and not st.session_state.messages:
    st.markdown("""
    <div style='text-align:center;padding:4rem 2rem;'>
      <div style='font-size:4rem;margin-bottom:1rem;'>🧠</div>
      <h3 style='color:#eeebff;font-family:Syne,sans-serif;'>Upload documents to begin</h3>
      <p style='color:#8883aa;max-width:400px;margin:0.5rem auto;line-height:1.6;'>
        Add your API key and upload any text files in the sidebar.
        Then ask questions — the AI retrieves relevant context to answer precisely.
      </p>
    </div>
    """, unsafe_allow_html=True)
