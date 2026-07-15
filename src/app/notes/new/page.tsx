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
        <p className="text-sm text-black/60 dark:text-white/60 mt-1">
          Paste text, upload a PDF, or snap a photo — the local model reads it and builds a
          summary, key concepts, and a short quiz.
        </p>
      </div>

      <div className="flex gap-2 text-sm" role="tablist">
        <button
          type="button"
          role="tab"
          data-testid="mode-text-tab"
          aria-selected={mode === "text"}
          onClick={() => setMode("text")}
          className={
            "rounded-full px-3 py-1.5 border " +
            (mode === "text"
              ? "bg-black text-white dark:bg-white dark:text-black border-transparent"
              : "border-black/10 dark:border-white/10")
          }
        >
          Paste text
        </button>
        <button
          type="button"
          role="tab"
          data-testid="mode-pdf-tab"
          aria-selected={mode === "pdf"}
          onClick={() => setMode("pdf")}
          className={
            "rounded-full px-3 py-1.5 border " +
            (mode === "pdf"
              ? "bg-black text-white dark:bg-white dark:text-black border-transparent"
              : "border-black/10 dark:border-white/10")
          }
        >
          PDF
        </button>
        <button
          type="button"
          role="tab"
          data-testid="mode-image-tab"
          aria-selected={mode === "image"}
          onClick={() => setMode("image")}
          className={
            "rounded-full px-3 py-1.5 border " +
            (mode === "image"
              ? "bg-black text-white dark:bg-white dark:text-black border-transparent"
              : "border-black/10 dark:border-white/10")
          }
        >
          Photo
        </button>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Title (optional)
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          data-testid="note-title-input"
          className="border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 bg-transparent"
          placeholder="e.g. Photosynthesis — chapter 4"
        />
      </label>

      {mode === "text" && (
        <label className="flex flex-col gap-1 text-sm">
          Notes text
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            data-testid="note-text-input"
            className="border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 bg-transparent"
            rows={8}
            placeholder="Paste your notes here…"
          />
        </label>
      )}

      {mode === "pdf" && (
        <div className="flex flex-col gap-2 text-sm">
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={onPdfChange}
            data-testid="note-pdf-input"
          />
          {pdfFile && <p className="text-xs text-black/60 dark:text-white/60">{pdfFile.name}</p>}
          <p className="text-xs text-black/50 dark:text-white/50">
            Text extraction happens locally (no upload leaves this machine). Scanned-image-only
            PDFs with no text layer won&apos;t work — use the Photo mode for those instead.
          </p>
        </div>
      )}

      {mode === "image" && (
        <div className="flex flex-col gap-2 text-sm">
          <input
            type="file"
            accept="image/*"
            onChange={onImageChange}
            data-testid="note-image-input"
          />
          {imagePreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagePreview}
              alt="Preview"
              data-testid="note-image-preview"
              className="max-h-64 rounded-lg border border-black/10 dark:border-white/10 object-contain"
            />
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        data-testid="generate-note-button"
        className="self-start rounded-full bg-black text-white dark:bg-white dark:text-black px-5 py-2 text-sm font-medium disabled:opacity-50"
      >
        {status === "extracting" ? "Reading PDF…" : status === "generating" ? "Summarizing…" : "Generate note"}
      </button>
    </form>
  );
}
