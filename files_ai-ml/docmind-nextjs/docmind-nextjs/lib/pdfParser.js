// Server-side PDF text extraction — pdf-parse v1 (Node-safe, no DOMMatrix)

export async function extractPdfText(buffer) {
  if (!buffer?.length) {
    throw new Error("PDF file is empty.");
  }

  const header = buffer.slice(0, 5).toString("ascii");
  if (!header.startsWith("%PDF")) {
    throw new Error("Downloaded file is not a valid PDF.");
  }

  const pdfParse = require("pdf-parse");
  const data = await pdfParse(buffer);
  const text = data.text?.trim() || "";

  if (!text) {
    throw new Error(
      "This PDF has no extractable text — it may be scanned or image-only. Try a text-based PDF, Google Doc, or paste the content."
    );
  }

  return text;
}

export function isPdfFile(name) {
  return name?.toLowerCase().endsWith(".pdf");
}

export function isPdfMime(mimeType, name) {
  return mimeType === "application/pdf" || isPdfFile(name);
}
