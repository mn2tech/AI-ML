import { getAuthenticatedClient, isGoogleConfigured } from "../../../lib/googleAuth";
import { listDriveFiles } from "../../../lib/googleDrive";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  if (!isGoogleConfigured()) {
    return res.status(503).json({ error: "Google Drive not configured." });
  }

  const auth = await getAuthenticatedClient(req, res);
  if (!auth) {
    return res.status(401).json({ error: "Not connected to Google Drive." });
  }

  try {
    const { pageToken } = req.query;
    const result = await listDriveFiles(auth, pageToken ? String(pageToken) : undefined);
    res.json(result);
  } catch (err) {
    console.error("Drive list error:", err);
    res.status(500).json({ error: err.message || "Failed to list Drive files" });
  }
}
