# 🧠 DocMind RAG — Next.js + Vercel

A production-ready RAG document Q&A app. Deploy to Vercel in 5 minutes.

## 🚀 Deploy to Vercel (Free, 5 minutes)

### Option A — One-click via Vercel CLI
```bash
npm install -g vercel
npm install
vercel deploy
```

### Option B — GitHub + Vercel Dashboard
1. Push this folder to GitHub
2. Go to **https://vercel.com/new**
3. Import your GitHub repo
4. Add environment variable:
   - Name: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-your-key-here`
5. Click **Deploy!**

Your app will be live at:
`https://docmind-rag-YOUR_USERNAME.vercel.app`

---

## 🏃 Run Locally

```bash
npm install
# Create .env.local file:
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > .env.local
npm run dev
# Open http://localhost:3000
```

---

## 📁 Project Structure
```
docmind-rag/
├── pages/
│   ├── index.js       # Main UI (React)
│   └── api/
│       └── rag.js     # Claude API route (server-side)
├── package.json
└── README.md
```

## 🧠 Architecture

```
Browser (React)          Server (Next.js API)       Claude API
─────────────────        ───────────────────        ──────────
User uploads docs   →   
TF-IDF vectorize    →   
Cosine similarity   →   
Top-K chunks        →   POST /api/rag         →    claude-sonnet
                    ←   Answer + sources      ←    Grounded response
Display in chat     ←
```

## 🔧 Tech Stack
- **Frontend**: Next.js 14 + React 18
- **Backend**: Next.js API Routes (serverless)
- **LLM**: Claude Sonnet (Anthropic API)
- **Embeddings**: TF-IDF (client-side, no external API needed)
- **Vector Search**: Cosine similarity (NumPy-style in JS)
- **Hosting**: Vercel (free tier)

## 💼 What this demonstrates for employers
- RAG architecture end-to-end
- Serverless API design
- React state management
- LLM prompt engineering
- Production deployment on Vercel
- Clean, well-structured codebase
