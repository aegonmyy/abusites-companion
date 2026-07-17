"use client";

// New-note screen. Rewired for the segments architecture: the upload-time
// call is now the fast "json" segment-split call (table of contents only —
// titles + one-line previews), not the old single summary+quiz call. Deep
// explanations are generated later, on demand, per segment (see
// /notes/[id]/SegmentsView.tsx). Depth (quick/standard/deep) is chosen here
// and stored per-note; it only affects the per-segment explanation calls
// made later, not this screen's own call.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseModelJson } from "@/lib/parse-model-json";
import LoadingSpinner from "@/components/LoadingSpinner";
import FullPageLoader from "@/components/FullPageLoader";
import type { DepthPreference } from "@/lib/notes-depth";

type ParsedSegments = {
  title?: string;
  segments?: { segment_id?: string; title?: string; summary?: string }[];
};

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
    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 16V5" />
        <path d="m7 10 5-5 5 5" />
        <path d="M5 19h14" />
      </svg>
    </span>
  );
}

const TABS: { value: "text" | "pdf" | "image"; label: string; testid: string }[] = [
  { value: "text", label: "Paste text", testid: "mode-text-tab" },
  { value: "pdf", label: "PDF", testid: "mode-pdf-tab" },
  { value: "image", label: "Photo", testid: "mode-image-tab" },
];

const DEPTH_OPTIONS: { value: DepthPreference; label: string; hint: string; testid: string }[] = [
  { value: "quick", label: "Quick", hint: "Shorter explanations, fastest per segment", testid: "depth-quick" },
  { value: "standard", label: "Standard", hint: "Balanced depth and speed", testid: "depth-standard" },
  { value: "deep", label: "Deep", hint: "Most thorough, slowest per segment", testid: "depth-deep" },
];

export default function NewNotePage() {
  const router = useRouter();
  const [mode, setMode] = useState<"text" | "image" | "pdf">("text");
  const [title, setTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [depth, setDepth] = useState<DepthPreference>("standard");
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

      const { notesSegmentSplitSystemPrompt, notesSegmentSplitFromImageSystemPrompt } = await import(
        "@/lib/prompts"
      );

      let llmBody: Record<string, unknown>;
      let sourceType: string;
      let extractedPdfText: string | null = null;

      if (mode === "text") {
        if (!rawText.trim()) throw new Error("Paste some text first.");
        setStatus("generating");
        sourceType = "text";
        llmBody = {
          routeTag: "json",
          system: notesSegmentSplitSystemPrompt(language),
          // Segment structure is a small, cheap call — cap it well below the
          // full syllabus's 1500-token budget (a table of contents doesn't
          // need that much room).
          numPredictOverride: 700,
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
          system: notesSegmentSplitSystemPrompt(language),
          numPredictOverride: 700,
          messages: [{ role: "user", content: extractedPdfText }],
        };
      } else {
        if (!imageFile) throw new Error("Choose a photo first.");
        setStatus("generating");
        sourceType = "image";
        const b64 = await fileToBase64(imageFile);
        llmBody = {
          routeTag: "json",
          system: notesSegmentSplitFromImageSystemPrompt(language),
          numPredictOverride: 700,
          messages: [
            {
              role: "user",
              content: "Read the attached photo of study material and split it per the required JSON shape.",
              images: [b64],
            },
          ],
        };
      }

      const attempt = async (body: Record<string, unknown>) => {
        const llmRes = await fetch("/api/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
        if (!jsonMatch) throw new Error("Model did not return parseable segments.");
        const parsed = parseModelJson(jsonMatch[0]) as ParsedSegments;
        if (!Array.isArray(parsed.segments) || parsed.segments.length === 0) {
          throw new Error("Model's response had no segments.");
        }
        return parsed;
      };

      let parsed: ParsedSegments;
      try {
        parsed = await attempt(llmBody);
      } catch {
        parsed = await attempt({
          ...llmBody,
          system:
            (llmBody.system as string) +
            "\n\nIMPORTANT: Return ONLY valid, minified JSON on a single line. Do not put line breaks, tabs, or backslashes inside any string value.",
        });
      }

      const defaultTitle =
        mode === "text"
          ? rawText.slice(0, 60)
          : mode === "pdf"
            ? pdfFile!.name.replace(/\.pdf$/i, "")
            : "Photo note";

      const noteRes = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || parsed.title || defaultTitle,
          sourceType,
          rawText: mode === "text" ? rawText : mode === "pdf" ? extractedPdfText : null,
          segments: parsed.segments,
          depthPreference: depth,
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
    <div className="min-h-dvh px-6 py-12">
      {busy ? (
        <FullPageLoader
          message={status === "extracting" ? "Reading PDF…" : "Finding the segments…"}
        />
      ) : null}
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">
              Turn raw notes into active recall.
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70">
              Paste text, upload a PDF, or snap a photo. It gets split into
              segments right away. Open a segment to see it explained in depth.
            </p>
          </div>
          <a
            href="/notes"
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 transition hover:border-white/40"
          >
            Back to notes
          </a>
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute -left-24 top-16 h-56 w-56 rounded-full bg-emerald-500/20 blur-[90px]" />
          <div className="pointer-events-none absolute right-4 top-6 h-64 w-64 rounded-full bg-sky-500/20 blur-[110px]" />

          <form onSubmit={handleSubmit} className="relative" data-testid="new-note-form">
            <div className="mb-6 flex flex-wrap items-center gap-3" role="tablist">
              {TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  data-testid={tab.testid}
                  aria-selected={mode === tab.value}
                  onClick={() => setMode(tab.value)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${
                    mode === tab.value
                      ? "border border-white/60 bg-white text-slate-900"
                      : "border border-white/20 bg-white/5 text-white/70 hover:border-white/40"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <section className="card-deep card-deep-glow rounded-3xl p-6 text-white">
              <div className="flex flex-col gap-5">
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-white/90">
                  Title (optional)
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    data-testid="note-title-input"
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-normal text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                    placeholder="e.g. Photosynthesis, chapter 4"
                  />
                </label>

                {mode === "text" && (
                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-white/90">
                    Notes text
                    <textarea
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      data-testid="note-text-input"
                      rows={10}
                      className="w-full resize-none rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-normal text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                      placeholder="Paste your notes here…"
                    />
                  </label>
                )}

                {mode === "pdf" && (
                  <div className="flex flex-col gap-2 text-sm">
                    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/20 bg-white/5 px-4 py-8 text-center">
                      <UploadGlyph />
                      <span className="text-sm text-white/70">
                        Drop your PDF here and <span className="font-semibold text-white">Browse</span>
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
                        <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
                          .PDF
                        </span>
                        <span className="text-white/60">{pdfFile.name}</span>
                      </div>
                    )}
                    <p className="text-xs text-white/40">
                      Nothing leaves your device. Scanned PDFs with no
                      selectable text won&apos;t work, use Photo mode for
                      those instead.
                    </p>
                  </div>
                )}

                {mode === "image" && (
                  <div className="flex flex-col gap-2 text-sm">
                    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/20 bg-white/5 px-4 py-8 text-center">
                      <UploadGlyph />
                      <span className="text-sm text-white/70">
                        Drop a photo here and <span className="font-semibold text-white">Browse</span>
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
                        className="max-h-64 rounded-xl border border-white/10 object-contain"
                      />
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-1.5 text-sm font-semibold text-white/90">
                  Explanation depth
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Explanation depth">
                    {DEPTH_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={depth === opt.value}
                        data-testid={opt.testid}
                        onClick={() => setDepth(opt.value)}
                        className={`flex flex-col items-start gap-0.5 rounded-2xl border px-4 py-2.5 text-left ${
                          depth === opt.value
                            ? "border-white/60 bg-white text-slate-900"
                            : "border-white/20 bg-white/5 text-white/70 hover:border-white/40"
                        }`}
                      >
                        <span className="text-sm font-semibold">{opt.label}</span>
                        <span className={`text-xs font-normal ${depth === opt.value ? "text-slate-700" : "text-white/50"}`}>
                          {opt.hint}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs font-normal text-white/40">
                    Applies when you open a segment later. You can&apos;t change it for
                    this note afterward.
                  </p>
                </div>

                {error && <p className="text-sm text-rose-300">{error}</p>}

                <button
                  type="submit"
                  disabled={busy}
                  data-testid="generate-note-button"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 disabled:opacity-60"
                >
                  {busy && <LoadingSpinner size={16} className="text-slate-900" label="Working" />}
                  {status === "extracting"
                    ? "Reading PDF…"
                    : status === "generating"
                      ? "Finding segments…"
                      : "Generate note"}
                </button>
              </div>
            </section>
          </form>
        </div>
      </div>
    </div>
  );
}
