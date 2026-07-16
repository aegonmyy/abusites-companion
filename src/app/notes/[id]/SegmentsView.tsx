"use client";

// Notes' segment table-of-contents + on-demand deep explanation. Mirrors
// SyllabusView.tsx's subunit-tutor pattern closely: the segment list is
// shown immediately (already fetched, no generation needed to render it);
// opening a segment streams a deep explanation from /api/llm (routeTag
// "lesson") the same way SyllabusView streams a subunit's tutor reply, then
// persists it via POST /api/notes/[id]/segment so reopening loads from
// cache instantly instead of regenerating.

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import LoadingSpinner from "@/components/LoadingSpinner";
import { notesSegmentExplanationSystemPrompt, type Language } from "@/lib/prompts";
import { DEPTH_NUM_PREDICT, type DepthPreference } from "@/lib/notes-depth";

export type Segment = { segment_id: string; title: string; summary: string };

type SegmentsViewProps = {
  noteId: string;
  documentTitle: string;
  segments: Segment[];
  depthPreference: DepthPreference;
  language: Language;
  initialExplanations: Record<string, string>;
};

export default function SegmentsView({
  noteId,
  documentTitle,
  segments,
  depthPreference,
  language,
  initialExplanations,
}: SegmentsViewProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>(initialExplanations);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  async function openSegment(segment: Segment) {
    setOpenId(segment.segment_id);
    setErrorId(null);

    // Already generated (this session or a prior one) — cached, instant,
    // no model call at all.
    if (explanations[segment.segment_id]) return;

    setLoadingId(segment.segment_id);
    setExplanations((prev) => ({ ...prev, [segment.segment_id]: "" }));

    try {
      const system = notesSegmentExplanationSystemPrompt(
        language,
        documentTitle,
        segment.title,
        segment.summary,
      );
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeTag: "lesson",
          system,
          numPredictOverride: DEPTH_NUM_PREDICT[depthPreference],
          messages: [
            {
              role: "user",
              content: `Explain the segment "${segment.title}" in depth.`,
            },
          ],
        }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Local model call failed.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assembled = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          assembled += chunk;
          setExplanations((prev) => ({ ...prev, [segment.segment_id]: assembled }));
        }
      }

      if (!assembled.trim()) {
        throw new Error("Local model unavailable — is Ollama running?");
      }

      // Persist once generated — reopening this segment loads from this
      // cache without ever calling the model again.
      fetch(`/api/notes/${noteId}/segment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmentId: segment.segment_id, explanation: assembled }),
      }).catch(() => {});
    } catch (err) {
      setErrorId(segment.segment_id);
      setExplanations((prev) => ({
        ...prev,
        [segment.segment_id]: err instanceof Error ? err.message : "Something went wrong.",
      }));
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="segments-view">
      <div className="card-deep rounded-2xl p-4 text-white sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Segments</p>
            <h2 className="mt-2 text-xl font-semibold">{documentTitle}</h2>
          </div>
          <div className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
            {segments.length} segments · {depthPreference} depth
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3" data-testid="segments-list">
        {segments.map((segment) => {
          const isOpen = openId === segment.segment_id;
          const isLoading = loadingId === segment.segment_id;
          const isCached = Boolean(explanations[segment.segment_id]) && !isLoading;
          const isError = errorId === segment.segment_id;
          return (
            <div
              key={segment.segment_id}
              className="card-deep rounded-2xl p-4"
              data-testid={`segment-${segment.segment_id}`}
            >
              <button
                type="button"
                onClick={() => (isOpen ? setOpenId(null) : openSegment(segment))}
                className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                data-testid={`segment-${segment.segment_id}-toggle`}
              >
                <div>
                  <p className="text-sm font-semibold text-white">
                    {segment.segment_id} · {segment.title}
                  </p>
                  <p className="mt-1 text-xs text-white/60">{segment.summary}</p>
                </div>
                <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                  {isOpen ? "Close" : isCached ? "Open (ready)" : "Open"}
                </span>
              </button>

              {isOpen ? (
                <div className="mt-4 border-t border-white/10 pt-4 text-sm text-white/85" data-testid={`segment-${segment.segment_id}-explanation`}>
                  {isLoading && !explanations[segment.segment_id] ? (
                    <LoadingSpinner size={18} label="Explaining" />
                  ) : isError ? (
                    <p className="text-rose-300">{explanations[segment.segment_id]}</p>
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {explanations[segment.segment_id] || ""}
                    </ReactMarkdown>
                  )}
                  {isLoading ? (
                    <p className="mt-2 flex items-center gap-2 text-xs text-white/50">
                      <LoadingSpinner size={12} label="Generating" />
                      Generating…
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
