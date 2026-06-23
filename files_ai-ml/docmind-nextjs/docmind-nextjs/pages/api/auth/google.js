import { createOAuth2Client, DRIVE_SCOPE, getBaseUrl, isGoogleConfigured } from "../../../lib/googleAuth";

export default function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  if (!isGoogleConfigured()) {
    return res.status(503).json({ error: "Google Drive not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." });
  }

  const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;
  const client = createOAuth2Client(redirectUri);

  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [DRIVE_SCOPE],
  });

  res.redirect(url);
}
