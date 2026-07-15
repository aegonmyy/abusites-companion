"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseModelJson } from "@/lib/parse-model-json";

type ParsedNote = {
  summary?: string;
  key_concepts?: string[];
  quiz?: unknown[];
};

/** Strips the "data:image/...;base64," prefix — Ollama's images field wants raw base64. */
function stripDataUrlPrefix(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(stripDataUrlPrefix(reader.result as string));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function UploadGlyph() {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full"
      style={{ width: 44, height: 44, background: "var(--primary-soft)", color: "var(--primary)" }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 16V5" />
        <path d="m7 10 5-5 5 5" />
        <path d="M5 19h14" />
      </svg>
    </span>
  );
}

export default function NewNotePage() {
  const router = useRouter();
  const [mode, setMode] = useState<"text" | "image" | "pdf">("text");
  const [title, setTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "extracting" | "generating" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function onImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : null);
  }

  function onPdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPdfFile(e.target.files?.[0] ?? null);
  }

  async function extractPdfText(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/notes/extract-pdf", { method: "POST", body: formData });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error ?? "Could not extract text from this PDF.");
    }
    const d = await res.json();
    return d.text as string;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      const settingsRes = await fetch("/api/settings");
      const settings = await settingsRes.json();
      const language = settings.language ?? "en";

      const { notesSummarySystemPrompt, notesSummaryFromImageSystemPrompt } = await import("@/lib/prompts");

      let llmBody: Record<string, unknown>;
      let sourceType: string;
      let extractedPdfText: string | null = null;

      if (mode === "text") {
        if (!rawText.trim()) throw new Error("Paste some text first.");
        setStatus("generating");
        sourceType = "text";
        llmBody = {
          routeTag: "json",
          system: notesSummarySystemPrompt(language),
          messages: [{ role: "user", content: rawText }],
        };
      } else if (mode === "pdf") {
        if (!pdfFile) throw new Error("Choose a PDF first.");
        setStatus("extracting");
        sourceType = "pdf";
        extractedPdfText = await extractPdfText(pdfFile);
        setStatus("generating");
        llmBody = {
          routeTag: "json",
          system: notesSummarySystemPrompt(language),
          messages: [{ role: "user", content: extractedPdfText }],
        };
      } else {
        if (!imageFile) throw new Error("Choose a photo first.");
        setStatus("generating");
        sourceType = "image";
        const b64 = await fileToBase64(imageFile);
        llmBody = {
          routeTag: "json",
          system: notesSummaryFromImageSystemPrompt(language),
          messages: [
            {
              role: "user",
              content: "Read the attached photo of study material and summarize it per the required JSON shape.",
              images: [b64],
            },
          ],
        };
      }

      const llmRes = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(llmBody),
      });
      if (!llmRes.ok || !llmRes.body) {
        const d = await llmRes.json().catch(() => ({}));
        throw new Error(d.error ?? "Local model call failed.");
      }

      const reader = llmRes.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Model did not return a parseable summary.");
      const parsed = parseModelJson(jsonMatch[0]) as ParsedNote;
      if (!parsed.summary) throw new Error("Model's response had no summary.");

      const defaultTitle = mode === "text" ? rawText.slice(0, 60) : mode === "pdf" ? pdfFile!.name.replace(/\.pdf$/i, "") : "Photo note";
      const noteRes = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || defaultTitle,
          sourceType,
          rawText: mode === "text" ? rawText : mode === "pdf" ? extractedPdfText : null,
          summary: parsed.summary,
          keyConcepts: parsed.key_concepts ?? [],
          quiz: parsed.quiz ?? [],
        }),
      });
      if (!noteRes.ok) {
        const d = await noteRes.json();
        throw new Error(d.error ?? "Could not save note.");
      }
      const note = await noteRes.json();
      router.push(`/notes/${note.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  const busy = status === "extracting" || status === "generating";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="new-note-form">
      <div>
        <h1 className="text-xl font-semibold">New note</h1>
        <p className="text-sm muted mt-1">
          Paste text, upload a PDF, or snap a photo — the local model reads it and builds a
          summary, key concepts, and a short quiz.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap" role="tablist">
        <button
          type="button"
          role="tab"
          data-testid="mode-text-tab"
          aria-selected={mode === "text"}
          onClick={() => setMode("text")}
          className={"tab" + (mode === "text" ? " tab-active" : "")}
        >
          Paste text
        </button>
        <button
          type="button"
          role="tab"
          data-testid="mode-pdf-tab"
          aria-selected={mode === "pdf"}
          onClick={() => setMode("pdf")}
          className={"tab" + (mode === "pdf" ? " tab-active" : "")}
        >
          PDF
        </button>
        <button
          type="button"
          role="tab"
          data-testid="mode-image-tab"
          aria-selected={mode === "image"}
          onClick={() => setMode("image")}
          className={"tab" + (mode === "image" ? " tab-active" : "")}
        >
          Photo
        </button>
      </div>

      <div className="card p-5 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Title (optional)
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            data-testid="note-title-input"
            className="field font-normal"
            placeholder="e.g. Photosynthesis — chapter 4"
          />
        </label>

        {mode === "text" && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Notes text
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              data-testid="note-text-input"
              className="field font-normal"
              rows={8}
              placeholder="Paste your notes here…"
            />
          </label>
        )}

        {mode === "pdf" && (
          <div className="flex flex-col gap-2 text-sm">
            <label
              className="flex flex-col items-center justify-center gap-2 text-center cursor-pointer px-4 py-8 rounded-xl"
              style={{ border: "2px dashed var(--border-strong)", background: "var(--card-muted)" }}
            >
              <UploadGlyph />
              <span className="text-sm">
                <span className="faint">Drop your PDF here and </span>
                <span style={{ color: "var(--primary)", fontWeight: 600 }}>Browse</span>
              </span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={onPdfChange}
                data-testid="note-pdf-input"
                className="sr-only"
              />
            </label>
            {pdfFile && (
              <div className="flex items-center gap-2 text-sm">
                <span className="chip">.PDF</span>
                <span className="muted">{pdfFile.name}</span>
              </div>
            )}
            <p className="text-xs faint">
              Text extraction happens locally (no upload leaves this machine). Scanned-image-only
              PDFs with no text layer won&apos;t work — use the Photo mode for those instead.
            </p>
          </div>
        )}

        {mode === "image" && (
          <div className="flex flex-col gap-2 text-sm">
            <label
              className="flex flex-col items-center justify-center gap-2 text-center cursor-pointer px-4 py-8 rounded-xl"
              style={{ border: "2px dashed var(--border-strong)", background: "var(--card-muted)" }}
            >
              <UploadGlyph />
              <span className="text-sm">
                <span className="faint">Drop a photo here and </span>
                <span style={{ color: "var(--primary)", fontWeight: 600 }}>Browse</span>
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={onImageChange}
                data-testid="note-image-input"
                className="sr-only"
              />
            </label>
            {imagePreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagePreview}
                alt="Preview"
                data-testid="note-image-preview"
                className="max-h-64 rounded-xl object-contain"
                style={{ border: "1px solid var(--border)" }}
              />
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm" style={{ color: "var(--bad)" }}>{error}</p>}

      <button
        type="submit"
        disabled={busy}
        data-testid="generate-note-button"
        className="btn btn-primary btn-block"
      >
        {status === "extracting" ? "Reading PDF…" : status === "generating" ? "Summarizing…" : "Generate note"}
      </button>
    </form>
  );
}
