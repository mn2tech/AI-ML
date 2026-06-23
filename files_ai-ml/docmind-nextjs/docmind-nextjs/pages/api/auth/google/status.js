import { getAuthenticatedClient, isGoogleConfigured, parseReqCookies } from "../../../../lib/googleAuth";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  if (!isGoogleConfigured()) {
    return res.json({ connected: false, configured: false });
  }

  const cookies = parseReqCookies(req);
  const hasToken = Boolean(cookies.gdrive_refresh_token || cookies.gdrive_access_token);

  if (!hasToken) {
    return res.json({ connected: false, configured: true });
  }

  try {
    const auth = await getAuthenticatedClient(req, res);
    if (!auth) return res.json({ connected: false, configured: true });
    return res.json({ connected: true, configured: true });
  } catch {
    return res.json({ connected: false, configured: true });
  }
}
