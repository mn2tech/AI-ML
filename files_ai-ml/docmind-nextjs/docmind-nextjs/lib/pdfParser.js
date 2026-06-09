// Server-side PDF text extraction — pdf-parse v1 (Node-safe, no DOMMatrix)

export async function extractPdfText(buffer) {
  // Use require to keep pdf-parse out of the client bundle (CJS, server-only)
  const pdfParse = require("pdf-parse");
  const data = await pdfParse(buffer);
  return data.text?.trim() || "";
}

export function isPdfFile(name) {
  return name?.toLowerCase().endsWith(".pdf");
}
