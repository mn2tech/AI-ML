import { extractPdfText } from "../../lib/pdfParser";

export const config = {
  api: { bodyParser: false },
};

/** Read raw request body into a Buffer */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const buffer = await readBody(req);
    const contentType = req.headers["content-type"] || "";

    // PDF upload via multipart or raw binary
    if (contentType.includes("application/pdf") || contentType.includes("multipart")) {
      let pdfBuffer = buffer;

      // Strip multipart boundary wrapper if present
      if (contentType.includes("multipart")) {
        const boundary = contentType.split("boundary=")[1];
        if (boundary) {
          const str = buffer.toString("binary");
          const start = str.indexOf("\r\n\r\n");
          const end = str.lastIndexOf(`\r\n--${boundary}`);
          if (start !== -1 && end !== -1) {
            pdfBuffer = Buffer.from(str.slice(start + 4, end), "binary");
          }
        }
      }

      const text = await extractPdfText(pdfBuffer);
      if (!text) {
        return res.status(422).json({ error: "Could not extract text from PDF. It may be scanned/image-only." });
      }
      return res.json({ text, pages: text.split(/\f/).length });
    }

    // JSON body with base64 PDF
    const body = JSON.parse(buffer.toString());
    if (body.base64) {
      const pdfBuffer = Buffer.from(body.base64, "base64");
      const text = await extractPdfText(pdfBuffer);
      if (!text) {
        return res.status(422).json({ error: "Could not extract text from PDF." });
      }
      return res.json({ text });
    }

    return res.status(400).json({ error: "Expected PDF file upload" });
  } catch (err) {
    console.error("PDF parse error:", err);
    res.status(500).json({ error: err.message || "PDF parsing failed" });
  }
}
