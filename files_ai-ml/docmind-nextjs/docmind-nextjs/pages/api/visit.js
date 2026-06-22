import { kv } from "@vercel/kv";

const VISIT_KEY = "docmind:visits";

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export default async function handler(req, res) {
  if (!kvConfigured()) {
    return res.status(200).json({ count: null, unavailable: true });
  }

  try {
    if (req.method === "GET") {
      const count = Number((await kv.get(VISIT_KEY)) || 0);
      return res.json({ count });
    }

    if (req.method === "POST") {
      const { increment = false } = req.body || {};
      let count = Number((await kv.get(VISIT_KEY)) || 0);

      if (increment) {
        count = Number(await kv.incr(VISIT_KEY));
      }

      return res.json({ count });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Visit counter error:", err);
    return res.status(200).json({ count: null, unavailable: true });
  }
}
