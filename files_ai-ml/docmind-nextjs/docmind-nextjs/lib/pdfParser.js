// Server-side PDF text extraction using pdf-parse

export async function extractPdfText(buffer) {
  // Dynamic import avoids bundling issues on serverless
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  return data.text?.trim() || "";
}

export function isPdfFile(name) {
  return name?.toLowerCase().endsWith(".pdf");
}
