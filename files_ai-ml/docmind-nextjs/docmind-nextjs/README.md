# 🧠 DocMind RAG — Next.js + Vercel

A production-ready RAG document Q&A app with PDF support, OpenAI embeddings, streaming responses, and chat memory.

## ✨ Features

- **PDF upload** — Server-side text extraction via `pdf-parse`
- **Real embeddings** — OpenAI `text-embedding-3-small` with TF-IDF fallback
- **Streaming** — Token-by-token Claude responses via SSE
- **Chat memory** — Last 6 messages sent as conversation context
- **Smart chunking** — Paragraph-aware, ~500 tokens with 100-token overlap
- **UI** — Dark/light mode, mobile responsive, relevance scores, copy button
- **Visit counter** — Public "people have tried DocMind" badge (Upstash Redis)
- **Google Drive** — Connect account and import Docs, Sheets, PDFs, and text files
- **Analytics** — Vercel Analytics for private traffic insights

---

## 🚀 Deploy to Vercel

1. Push to GitHub
2. Import at **https://vercel.com/new**
3. Set **Root Directory** to `files_ai-ml/docmind-nextjs/docmind-nextjs`
4. Add environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | ✅ Yes | Claude API key for Q&A |
| `OPENAI_API_KEY` | Optional | Enables real embeddings (falls back to TF-IDF) |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth client ID (Drive import) |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth client secret |
| `NEXT_PUBLIC_APP_URL` | Optional | Live app URL for OAuth redirects |
| `KV_REST_API_URL` | Optional | Upstash Redis URL (visit counter) |
| `KV_REST_API_TOKEN` | Optional | Upstash Redis token (visit counter) |

5. **Google Drive** (optional): Enable Drive API + OAuth in [Google Cloud Console](https://console.cloud.google.com). Add redirect URI:
   `https://YOUR-APP.vercel.app/api/auth/google/callback`

6. **Enable visit counter** (optional): Vercel Dashboard → **Storage** → add **Upstash Redis** integration.

7. **Enable analytics** (optional): Vercel Dashboard → **Analytics** → Enable.

8. Click **Deploy**

---

## 🏃 Run Locally

```bash
cd files_ai-ml/docmind-nextjs/docmind-nextjs
npm install
cp .env.local.example .env.local
# Edit .env.local with your keys
npm run dev
# Open http://localhost:3000
```

---

## 📁 Project Structure

```
docmind-nextjs/
├── pages/
│   ├── index.js          # Main UI (React)
│   └── api/
│       ├── rag.js        # Claude streaming + chat history
│       ├── embed.js      # OpenAI embeddings (TF-IDF fallback)
│       ├── parse.js      # PDF text extraction
│       ├── visit.js      # Visit counter (Upstash Redis)
│       ├── auth/google.js
│       ├── auth/google/callback.js
│       └── drive/list.js, import.js
├── lib/
│   ├── googleAuth.js     # Google OAuth helpers
│   ├── googleDrive.js    # Drive list + download
│   ├── chunker.js        # Smart paragraph chunking
│   ├── vectorStore.js    # Cosine similarity + TF-IDF
│   └── pdfParser.js      # pdf-parse wrapper
├── .env.local.example
├── next.config.js
└── README.md
```

---

## 🧠 Architecture

```
Browser (React)              Server (Next.js API)           External APIs
─────────────────            ────────────────────           ─────────────
Upload PDF          →        POST /api/parse        →       pdf-parse
Chunk documents     →        POST /api/embed        →       OpenAI embeddings
Cosine retrieve     ←        (or TF-IDF fallback)
Stream chat         ↔        POST /api/rag (SSE)    →       Claude Sonnet
```

---

## 🔧 Tech Stack

- **Frontend**: Next.js 14 + React 18
- **LLM**: Claude Sonnet (Anthropic API, streaming)
- **Embeddings**: OpenAI text-embedding-3-small (TF-IDF fallback)
- **PDF**: pdf-parse (server-side)
- **Vector Search**: Cosine similarity
- **Hosting**: Vercel (serverless)

---

## 💼 Portfolio Highlights

- End-to-end RAG pipeline with real embeddings
- Serverless streaming API design
- Graceful fallbacks (TF-IDF when OpenAI unavailable)
- PDF ingestion, chat memory, responsive UI
- Production deployment on Vercel
