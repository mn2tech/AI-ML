import {
  createOAuth2Client,
  getBaseUrl,
  isGoogleConfigured,
  setTokenCookies,
} from "../../../../lib/googleAuth";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const base = getBaseUrl(req);

  if (!isGoogleConfigured()) {
    return res.redirect(`${base}/?drive=error&reason=config`);
  }

  const { code, error } = req.query;
  if (error) {
    return res.redirect(`${base}/?drive=error&reason=${encodeURIComponent(String(error))}`);
  }
  if (!code) {
    return res.redirect(`${base}/?drive=error&reason=no_code`);
  }

  try {
    const redirectUri = `${base}/api/auth/google/callback`;
    const client = createOAuth2Client(redirectUri);
    const { tokens } = await client.getToken(String(code));
    setTokenCookies(res, tokens);
    res.redirect(`${base}/?drive=connected`);
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    res.redirect(`${base}/?drive=error&reason=token_exchange`);
  }
}
