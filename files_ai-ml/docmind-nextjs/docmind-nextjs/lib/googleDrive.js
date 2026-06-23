import { google } from "googleapis";
import { extractPdfText, isPdfFile, isPdfMime } from "./pdfParser";

const EXPORT_MIME = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

/** Whether we can extract searchable text from this Drive file */
export function isImportable(file) {
  const { mimeType, name } = file;
  if (!mimeType && !name) return false;
  if (EXPORT_MIME[mimeType]) return true;
  if (isPdfMime(mimeType, name)) return true;
  if (mimeType?.startsWith("text/")) return true;
  if (mimeType === "application/json") return true;
  return false;
}

/** Human-readable label for unsupported file types */
export function getUnsupportedLabel(file) {
  const { mimeType, name } = file;
  const lower = name?.toLowerCase() || "";

  if (mimeType === "application/vnd.google-apps.folder") return "Folder";
  if (mimeType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/.test(lower)) return "Image";
  if (mimeType?.startsWith("video/") || /\.(mp4|mov|avi|mkv)$/.test(lower)) return "Video";
  if (mimeType?.startsWith("audio/") || /\.(mp3|wav|m4a)$/.test(lower)) return "Audio";
  if (mimeType?.includes("wordprocessingml") || /\.(docx?|rtf)$/.test(lower)) return "Word doc";
  if (mimeType?.includes("spreadsheetml") || /\.xlsx?$/.test(lower)) return "Excel";
  if (mimeType?.includes("presentationml") || /\.pptx?$/.test(lower)) return "PowerPoint";
  if (mimeType === "application/zip" || lower.endsWith(".zip")) return "ZIP";
  if (mimeType === "application/vnd.google-apps.form") return "Google Form";
  if (mimeType === "application/vnd.google-apps.drawing") return "Google Drawing";
  if (mimeType === "application/vnd.google-apps.shortcut") return "Shortcut";
  if (mimeType === "application/vnd.google-apps.map") return "Google Map";
  return "Unsupported";
}

function typeFromName(name, mimeType) {
  if (name?.includes(".")) return name.split(".").pop().toLowerCase();
  if (isPdfMime(mimeType, name)) return "pdf";
  if (mimeType?.includes("spreadsheet")) return "csv";
  return "txt";
}

/** Download binary file from Drive as Buffer (stream — more reliable than arraybuffer) */
async function downloadBinary(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );

  const chunks = [];
  await new Promise((resolve, reject) => {
    res.data
      .on("data", (chunk) => chunks.push(Buffer.from(chunk)))
      .on("end", resolve)
      .on("error", reject);
  });

  return Buffer.concat(chunks);
}

/** List Drive files (all types) with importable flag — paginated */
export async function listDriveFiles(auth, pageToken) {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: "trashed = false and mimeType != 'application/vnd.google-apps.folder'",
    fields: "nextPageToken, files(id, name, mimeType, size, modifiedTime)",
    pageSize: 50,
    orderBy: "modifiedTime desc",
    pageToken: pageToken || undefined,
  });

  const files = (res.data.files || []).map((f) => {
    const importable = isImportable(f);
    return {
      ...f,
      importable,
      unsupportedLabel: importable ? null : getUnsupportedLabel(f),
    };
  });

  return {
    files,
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

  if (isPdfMime(mimeType, name)) {
    const buffer = await downloadBinary(drive, id);
    const text = await extractPdfText(buffer);
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

export function driveFileIcon(mimeType, name) {
  if (isPdfMime(mimeType, name)) return "📕";
  if (mimeType?.includes("spreadsheet")) return "📊";
  if (mimeType?.includes("document")) return "📝";
  if (mimeType?.includes("presentation")) return "📽️";
  if (mimeType?.startsWith("image/")) return "🖼️";
  if (mimeType?.startsWith("video/")) return "🎬";
  if (mimeType?.includes("wordprocessingml")) return "📘";
  return "📄";
}
