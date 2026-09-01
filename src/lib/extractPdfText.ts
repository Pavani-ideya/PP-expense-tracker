/**
 * Extracts text from a PDF statement. Uses `unpdf` (a serverless-friendly wrapper around
 * pdf.js that needs no worker thread / filesystem-relative asset paths, which matters since
 * this runs inside a bundled Next.js API route).
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(doc, { mergePages: false });
  // `text` is an array of per-page strings when mergePages is false.
  const pages = Array.isArray(text) ? text : [text];
  return pages.join("\n");
}
