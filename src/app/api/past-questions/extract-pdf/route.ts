import { NextResponse } from "next/server";
import { extractPdfText } from "@/lib/pdf-extract";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB
// Much larger than the Notes default (6000): a full past paper must be read
// whole, not truncated to the first few questions. The client chunks this
// text itself across many model calls (see the PDF-to-CBT upload flow).
const MAX_EXTRACTED_CHARS = 60000;

/**
 * Local PDF text extraction for the student PDF-to-CBT pipeline (Stage 1).
 * Same pdfjs-dist path as Notes' extract-pdf, no network, but with a large
 * char cap since the whole exam is needed. Text-PDFs only for now: a
 * scanned/image PDF with no text layer returns a clear 422, matching the
 * feature's stated v1 scope.
 */
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with a 'file' field." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' field." }, { status: 400 });
  }
  if (file.type && file.type !== "application/pdf" && !file.name?.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "File must be a PDF." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "PDF too large (max 20MB)." }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const { text, pageCount, truncated } = await extractPdfText(buffer, MAX_EXTRACTED_CHARS);
    if (!text.trim()) {
      return NextResponse.json(
        {
          error:
            "No extractable text found in this PDF — it looks like scanned images without a text layer. For now, please use a text-based PDF (one where you can select the text).",
        },
        { status: 422 },
      );
    }
    return NextResponse.json({ text, pageCount, truncated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Could not read PDF: ${message}` }, { status: 422 });
  }
}
