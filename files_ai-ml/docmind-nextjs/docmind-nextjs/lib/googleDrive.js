import { google } from "googleapis";
import { extractPdfText, isPdfFile, isPdfMime } from "./pdfParser";

const EXPORT_MIME = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

function isImportable(file) {
  const { mimeType, name } = file;
  if (!mimeType && !name) return false;
  if (EXPORT_MIME[mimeType]) return true;
  if (isPdfMime(mimeType, name)) return true;
  if (mimeType?.startsWith("text/")) return true;
  if (mimeType === "application/json") return true;
  return false;
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
    files: (res.data.files || []).filter(isImportable),
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
  return "📄";
}
