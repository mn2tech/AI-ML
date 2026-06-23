import { clearTokenCookies } from "../../../../lib/googleAuth";

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  clearTokenCookies(res);
  res.json({ ok: true });
}
