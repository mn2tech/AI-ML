import { google } from "googleapis";
import { extractPdfText } from "./pdfParser";

const EXPORT_MIME = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

function isImportable(mimeType) {
  if (!mimeType) return false;
  if (EXPORT_MIME[mimeType]) return true;
  if (mimeType === "application/pdf") return true;
  if (mimeType.startsWith("text/")) return true;
  if (mimeType === "application/json") return true;
  return false;
}

function typeFromName(name, mimeType) {
  if (name?.includes(".")) return name.split(".").pop().toLowerCase();
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType?.includes("spreadsheet")) return "csv";
  return "txt";
}

/** List recent importable Drive files */
export async function listDriveFiles(auth, pageToken) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: "trashed = false and mimeType != 'application/vnd.google-apps.folder'",
    fields: "nextPageToken, files(id, name, mimeType, size, modifiedTime)",
    pageSize: 40,
    orderBy: "modifiedTime desc",
    pageToken: pageToken || undefined,
  });

  return {
    files: (res.data.files || []).filter((f) => isImportable(f.mimeType)),
    nextPageToken: res.data.nextPageToken || null,
  };
}

/** Download or export a Drive file as searchable text */
export async function downloadDriveFile(auth, { id, name, mimeType }) {
  const drive = google.drive({ version: "v3", auth });

  if (EXPORT_MIME[mimeType]) {
    const exportMime = EXPORT_MIME[mimeType];
    const res = await drive.files.export(
      { fileId: id, mimeType: exportMime },
      { responseType: "text" }
    );
    const text = (typeof res.data === "string" ? res.data : String(res.data)).trim();
    if (!text) throw new Error("Exported file is empty.");
    return {
      name,
      text,
      type: exportMime === "text/csv" ? "csv" : typeFromName(name, mimeType),
      size: text.length,
    };
  }

  if (mimeType === "application/pdf") {
    const res = await drive.files.get(
      { fileId: id, alt: "media" },
      { responseType: "arraybuffer" }
    );
    const buffer = Buffer.from(res.data);
    const text = await extractPdfText(buffer);
    if (!text) throw new Error("Could not extract text from PDF.");
    return { name, text, type: "pdf", size: buffer.length };
  }

  const res = await drive.files.get(
    { fileId: id, alt: "media" },
    { responseType: "text" }
  );
  const text = (typeof res.data === "string" ? res.data : String(res.data)).trim();
  if (!text) throw new Error("File is empty or unsupported.");
  return { name, text, type: typeFromName(name, mimeType), size: text.length };
}

export function driveFileIcon(mimeType) {
  if (mimeType === "application/pdf") return "📕";
  if (mimeType?.includes("spreadsheet")) return "📊";
  if (mimeType?.includes("document")) return "📝";
  if (mimeType?.includes("presentation")) return "📽️";
  return "📄";
}
