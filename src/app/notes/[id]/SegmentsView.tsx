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
import MicButton from "@/components/MicButton";
import SendGlyph from "@/components/SendGlyph";
import MathText from "@/components/MathText";
import { notesSegmentExplanationSystemPrompt, notesSegmentChatSystemPrompt, type Language } from "@/lib/prompts";
import { DEPTH_NUM_PREDICT, type DepthPreference } from "@/lib/notes-depth";

export type Segment = { segment_id: string; title: string; summary: string };

type ChatMsg = { role: "user" | "assistant"; content: string };

type SegmentsViewProps = {
  noteId: string;
  documentTitle: string;
  segments: Segment[];
  depthPreference: DepthPreference;
  language: Language;
  initialExplanations: Record<string, string>;
  /** The note's original source text (paste/PDF-extracted). Passed to the
   * explanation prompt so it's grounded in what the student actually
   * uploaded rather than the model's own background knowledge of a topic
   * implied by the segment title. Capped below to stay well inside num_ctx
   * (4096) even for a long paste. */
  sourceText: string | null;
  /** Cloud mode (Google AI Studio's Gemma 4) doesn't support audio input at
   * all — confirmed via the live API: "Audio input modality is not enabled
   * for this model". The mic is hidden rather than shown-and-failing. */
  modelSource: "local" | "cloud";
};

// ~6000 chars is comfortably under num_ctx (4096 tokens) once the rest of
// the system prompt + response budget is accounted for, even at a rough
// ~3 chars/token for dense text. A segment only ever needs a slice of a
// long document anyway (the model is told to use only the relevant part).
const MAX_SOURCE_EXCERPT_CHARS = 6000;

export default function SegmentsView({
  noteId,
  documentTitle,
  segments,
  depthPreference,
  language,
  initialExplanations,
  sourceText,
  modelSource,
}: SegmentsViewProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>(initialExplanations);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  // Per-segment ("tab-specific") follow-up chat — each segment gets its own
  // conversation, scoped to that segment's own explanation + source excerpt,
  // rather than one chat shared across the whole document.
  const [chats, setChats] = useState<Record<string, ChatMsg[]>>({});
  const [chatInputs, setChatInputs] = useState<Record<string, string>>({});
  const [chatStreamingId, setChatStreamingId] = useState<string | null>(null);

  async function openSegment(segment: Segment) {
    setOpenId(segment.segment_id);
    setErrorId(null);

    // Already generated (this session or a prior one) — cached, instant,
    // no model call at all.
    if (explanations[segment.segment_id]) return;

    setLoadingId(segment.segment_id);
    setExplanations((prev) => ({ ...prev, [segment.segment_id]: "" }));

    try {
      const sourceExcerpt = (sourceText ?? "").trim().slice(0, MAX_SOURCE_EXCERPT_CHARS);
      const system = notesSegmentExplanationSystemPrompt(
        language,
        documentTitle,
        segment.title,
        segment.summary,
        depthPreference,
        sourceExcerpt,
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

  function chatSystemFor(segment: Segment): string {
    const sourceExcerpt = (sourceText ?? "").trim().slice(0, MAX_SOURCE_EXCERPT_CHARS);
    return notesSegmentChatSystemPrompt(
      language,
      documentTitle,
      segment.title,
      segment.summary,
      explanations[segment.segment_id] ?? "",
      sourceExcerpt,
    );
  }

  async function streamChatReply(segmentId: string, res: Response) {
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (!chunk) continue;
      setChats((prev) => {
        const log = prev[segmentId] ?? [];
        const copy = [...log];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + chunk };
        return { ...prev, [segmentId]: copy };
      });
    }
  }

  function replaceLastChatMessage(segmentId: string, content: string) {
    setChats((prev) => {
      const log = prev[segmentId] ?? [];
      const copy = [...log];
      copy[copy.length - 1] = { ...copy[copy.length - 1], content };
      return { ...prev, [segmentId]: copy };
    });
  }

  async function sendChat(segment: Segment) {
    const segmentId = segment.segment_id;
    const content = (chatInputs[segmentId] ?? "").trim();
    if (!content || chatStreamingId) return;
    const history = chats[segmentId] ?? [];
    const nextHistory = [...history, { role: "user" as const, content }];
    setChats((prev) => ({ ...prev, [segmentId]: [...nextHistory, { role: "assistant", content: "" }] }));
    setChatInputs((prev) => ({ ...prev, [segmentId]: "" }));
    setChatStreamingId(segmentId);
    try {
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeTag: "chat", system: chatSystemFor(segment), messages: nextHistory }),
      });
      if (!res.ok || !res.body) throw new Error("Local model call failed.");
      await streamChatReply(segmentId, res);
    } catch {
      replaceLastChatMessage(segmentId, "(Local model unavailable — is Ollama running?)");
    } finally {
      setChatStreamingId(null);
    }
  }

  async function sendChatAudio(segment: Segment, audio: { base64: string; format: string }) {
    const segmentId = segment.segment_id;
    if (chatStreamingId) return;
    const history = chats[segmentId] ?? [];
    setChats((prev) => ({
      ...prev,
      [segmentId]: [...history, { role: "user", content: "🎤 (voice message)" }, { role: "assistant", content: "" }],
    }));
    setChatStreamingId(segmentId);
    try {
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeTag: "audio", system: chatSystemFor(segment), messages: history, audio }),
      });
      if (!res.ok || !res.body) throw new Error("Local model call failed.");
      await streamChatReply(segmentId, res);
    } catch {
      replaceLastChatMessage(segmentId, "(Local model unavailable — is Ollama running?)");
    } finally {
      setChatStreamingId(null);
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

                  {isCached ? (
                    <div className="mt-5 flex flex-col gap-2 border-t border-white/10 pt-4" data-testid={`segment-${segment.segment_id}-chat`}>
                      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
                        Ask about this segment
                      </span>
                      {(chats[segment.segment_id] ?? []).length > 0 && (
                        <div className="flex flex-col gap-2" data-testid={`segment-${segment.segment_id}-chat-log`}>
                          {(chats[segment.segment_id] ?? []).map((m, i) => (
                            <div
                              key={i}
                              className={`max-w-full rounded-2xl px-3 py-2 text-sm ${
                                m.role === "user" ? "self-end bg-white/15 text-white" : "self-start bg-white/5 text-white/80"
                              }`}
                            >
                              {m.role === "assistant" && !m.content ? (
                                <LoadingSpinner size={16} label="Thinking" />
                              ) : m.role === "assistant" ? (
                                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                                  {m.content}
                                </ReactMarkdown>
                              ) : (
                                <MathText text={m.content} />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          sendChat(segment);
                        }}
                        className="mt-1 flex items-center gap-2"
                      >
                        <input
                          value={chatInputs[segment.segment_id] ?? ""}
                          onChange={(e) =>
                            setChatInputs((prev) => ({ ...prev, [segment.segment_id]: e.target.value }))
                          }
                          placeholder="Ask a follow-up about this segment…"
                          data-testid={`segment-${segment.segment_id}-chat-input`}
                          className="min-w-0 flex-1 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={chatStreamingId === segment.segment_id}
                          data-testid={`segment-${segment.segment_id}-chat-send`}
                          className="inline-flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-full bg-white text-slate-900 disabled:opacity-60"
                          aria-label="Send"
                        >
                          <SendGlyph />
                        </button>
                        {modelSource === "local" && (
                          <MicButton
                            disabled={chatStreamingId === segment.segment_id}
                            onRecorded={(audio) => sendChatAudio(segment, audio)}
                          />
                        )}
                      </form>
                    </div>
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
