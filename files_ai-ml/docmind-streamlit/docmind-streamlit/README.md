# 🧠 DocMind RAG — Streamlit App

A production-ready RAG (Retrieval-Augmented Generation) document Q&A app built with Claude AI.

## 🚀 Deploy to Streamlit Cloud (Free, 10 minutes)

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit: DocMind RAG app"
git remote add origin https://github.com/YOUR_USERNAME/docmind-rag
git push -u origin main
```

### Step 2 — Deploy on Streamlit Cloud
1. Go to **https://share.streamlit.io**
2. Sign in with GitHub
3. Click **"New app"**
4. Select your repo → branch: `main` → file: `app.py`
5. Click **Deploy!**

### Step 3 — Add your API Key (Secrets)
In Streamlit Cloud dashboard → your app → **Settings → Secrets**:
```toml
ANTHROPIC_API_KEY = "sk-ant-your-key-here"
```

Then update `app.py` line ~90 to read from secrets:
```python
api_key = st.secrets.get("ANTHROPIC_API_KEY", "")
```

Your app will be live at:
`https://YOUR_USERNAME-docmind-rag-app-XXXXX.streamlit.app`

---

## 🏃 Run Locally

```bash
pip install -r requirements.txt
streamlit run app.py
```

---

## 🧠 How RAG Works (what this demonstrates)

| Step | What happens |
|------|-------------|
| **Ingest** | Documents split into overlapping 400-word chunks |
| **Vectorize** | TF-IDF embeddings built from vocabulary |
| **Retrieve** | Cosine similarity finds top-K relevant chunks |
| **Inject** | Chunks added to Claude's context window |
| **Generate** | Claude answers using ONLY retrieved context |

## 📁 Project Structure
```
docmind-rag/
├── app.py           # Main Streamlit app
├── requirements.txt # Dependencies
└── README.md        # This file
```

## 🔧 Tech Stack
- **Frontend**: Streamlit
- **LLM**: Claude (Anthropic API)
- **Embeddings**: TF-IDF (swap for OpenAI/Cohere for production)
- **Vector Search**: NumPy cosine similarity (swap for Pinecone/Chroma for scale)
- **Language**: Python 3.11+

## 💼 Portfolio Value
This project demonstrates:
- RAG architecture (most in-demand AI skill in 2026)
- LLM API integration
- Vector similarity search
- Production deployment
- Clean Python code structure
