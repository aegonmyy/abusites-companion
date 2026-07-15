import { NextResponse } from "next/server";
import { extractPdfText } from "@/lib/pdf-extract";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB — generous for a scanned-text PDF, not a scanned-image-per-page one

/**
 * Server-side PDF text extraction for the Notes "PDF" intake mode. Runs
 * entirely locally (pdfjs-dist, no network). Returns extracted text; the
 * client then feeds that text through the exact same
 * notesSummarySystemPrompt / /api/llm ("json") path as the "paste text"
 * mode — this route only handles the extraction step, not summarization,
 * so every model call still funnels through the single /api/llm entry
 * point.
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
    const { text, pageCount, truncated } = await extractPdfText(buffer);
    if (!text.trim()) {
      return NextResponse.json(
        { error: "No extractable text found in this PDF — it may be scanned images without a text layer." },
        { status: 422 },
      );
    }
    return NextResponse.json({ text, pageCount, truncated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Could not read PDF: ${message}` }, { status: 422 });
  }
}
