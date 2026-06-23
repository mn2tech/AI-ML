import { getAuthenticatedClient, isGoogleConfigured } from "../../../lib/googleAuth";
import { downloadDriveFile } from "../../../lib/googleDrive";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!isGoogleConfigured()) {
    return res.status(503).json({ error: "Google Drive not configured." });
  }

  const auth = await getAuthenticatedClient(req, res);
  if (!auth) {
    return res.status(401).json({ error: "Not connected to Google Drive." });
  }

  const { fileId, name, mimeType } = req.body || {};
  if (!fileId || !name || !mimeType) {
    return res.status(400).json({ error: "Missing fileId, name, or mimeType" });
  }

  try {
    const file = await downloadDriveFile(auth, { id: fileId, name, mimeType });
    res.json(file);
  } catch (err) {
    console.error("Drive import error:", err);
    res.status(500).json({ error: err.message || "Failed to import file" });
  }
}
