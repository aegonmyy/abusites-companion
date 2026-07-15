/**
 * Local PDF text extraction — pdfjs-dist (Mozilla's PDF.js), legacy Node
 * build. Pure JS, no native module, no compile step: `npm view pdfjs-dist
 * dependencies` shows zero required dependencies (only an *optional*
 * `@napi-rs/canvas`, used for page-image rendering, which this app never
 * imports — text extraction alone never touches it). This is the same
 * portability bar applied to the rest of the stack (react-markdown/
 * remark/rehype/katex are all pure JS too) — nothing here needs a
 * platform-specific prebuilt binary, so it runs the same on the Windows
 * EliteBook target as it does in dev.
 *
 * Pinned to 5.4.624, not the latest 6.x — 6.x requires Node >=22.13, and
 * this project targets Node 20+ (see README). 5.4.624 supports
 * Node >=20.16.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Hard cap on extracted text handed to the model — a 200-page textbook
 * PDF must not blow the 4096-token num_ctx budget (or take minutes to
 * summarize on the target CPU). Short input, same as short output, is a
 * deliberate product decision. */
const MAX_EXTRACTED_CHARS = 6000;

const standardFontDataUrl =
  pathToFileURL(path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts") + path.sep).href;

export type PdfExtractResult = {
  text: string;
  pageCount: number;
  truncated: boolean;
};

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  const data = new Uint8Array(buffer);
  const doc = await getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
    standardFontDataUrl,
  }).promise;

  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n";
    if (text.length >= MAX_EXTRACTED_CHARS) break;
  }

  const truncated = text.length > MAX_EXTRACTED_CHARS;
  return {
    text: truncated ? text.slice(0, MAX_EXTRACTED_CHARS) : text.trim(),
    pageCount: doc.numPages,
    truncated,
  };
}

/** Convenience wrapper for tests/scripts that only have a file path. */
export async function extractPdfTextFromFile(filePath: string): Promise<PdfExtractResult> {
  return extractPdfText(readFileSync(filePath));
}
