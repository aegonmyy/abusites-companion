"use client";

// Ported from the earlier reference design's app/study-mode/SyllabusView.tsx. ALL markup/classes
// are the earlier reference design's verbatim (the topic/unit glass cards, Start/Completed/Locked
// subunit states, prerequisite chips, the split chat+syllabus grid, the
// assistant markdown bubbles, scroll-to-bottom, "Re-explain deeper"). Only the
// data layer is rewired to the local target:
//   - Gemini SSE streaming  ->  plain-text stream from /api/llm (routeTag chat)
//   - /api/study-mode/subunit / progress  ->  /api/llm + /api/study/subunit/progress
//   - progress load          ->  /api/study/syllabus/{id} (completed states only)
// The target's SubunitProgress row has no messages column, so per-subunit chat
// history is not persisted across reloads (completed state is). The earlier reference design's
// AI-detected "missing prerequisite" chat chips are now wired to a real local
// call (routeTag "json", prereqDetectionSystemPrompt) instead of the earlier reference design's
// separate cloud model pool — see detectMissingPrereqs below. The
// syllabus-tree prerequisite locking/labels are unrelated and unchanged.

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { subunitTutorSystemPrompt, prereqDetectionSystemPrompt, type StartLanguage } from "@/lib/prompts";
import { parseModelJson } from "@/lib/parse-model-json";
import LoadingSpinner from "@/components/LoadingSpinner";

type Syllabus = {
  topic: string;
  units: Unit[];
};

type Unit = {
  unit_id: number;
  title: string;
  description: string;
  subunits: Subunit[];
};

type Subunit = {
  subunit_id: string;
  title: string;
  key_concepts: string[];
  prerequisites: string[];
};

// Normalizes the local syllabus JSON (which omits unit.description and
// subunit.prerequisites) into the shape the earlier reference design's markup reads, so no field
// access ever hits undefined. Data-shape adapter only — markup untouched.
const parseSyllabus = (raw: string): Syllabus | null => {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(withoutFence) as {
      topic?: string;
      units?: {
        unit_id: number;
        title: string;
        description?: string;
        subunits?: {
          subunit_id: string;
          title: string;
          key_concepts?: string[];
          prerequisites?: string[];
        }[];
      }[];
    };
    return {
      topic: parsed.topic ?? "",
      units: (parsed.units ?? []).map((unit) => ({
        unit_id: unit.unit_id,
        title: unit.title,
        description: unit.description ?? "",
        subunits: (unit.subunits ?? []).map((su) => ({
          subunit_id: su.subunit_id,
          title: su.title,
          key_concepts: su.key_concepts ?? [],
          prerequisites: su.prerequisites ?? [],
        })),
      })),
    };
  } catch {
    return null;
  }
};

type SyllabusViewProps = {
  raw: string;
  syllabusId?: string;
  onExit?: () => void;
  /** Chosen at intake time (StudyIntakeForm), passed down from the loaded
   * StudySyllabus record — see prompts.ts's StartLanguage. */
  startLanguage: StartLanguage;
};

export default function SyllabusView({ raw, syllabusId, onExit, startLanguage }: SyllabusViewProps) {
  const syllabus = useMemo(() => parseSyllabus(raw), [raw]);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [chatOpen, setChatOpen] = useState(false);
  const [activeSubunit, setActiveSubunit] = useState<{
    unitTitle: string;
    subunitTitle: string;
    subunitId: string;
    keyConcepts: string[];
  } | null>(null);
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [messagesBySubunit, setMessagesBySubunit] = useState<
    Record<string, { role: "user" | "assistant"; content: string }[]>
  >({});
  const messagesSnapshot = useRef<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [missingPrereqs, setMissingPrereqs] = useState<{ concept: string; prompt: string }[]>([]);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  };

  useEffect(() => {
    messagesSnapshot.current = messages;
    if (activeSubunit) {
      setMessagesBySubunit((prev) => ({
        ...prev,
        [activeSubunit.subunitId]: messages,
      }));
    }
  }, [messages, activeSubunit]);

  useEffect(() => {
    if (!syllabusId) return;
    let mounted = true;
    const loadProgress = async () => {
      try {
        const response = await fetch(
          `/api/study/syllabus/${encodeURIComponent(syllabusId)}`,
        );
        if (!response.ok) return;
        const payload = (await response.json()) as {
          progress?: { subunitId: string; completed: boolean }[];
        };
        if (!mounted) return;
        const nextCompleted: Record<string, boolean> = {};
        (payload.progress ?? []).forEach((entry) => {
          nextCompleted[entry.subunitId] = entry.completed;
        });
        setCompleted(nextCompleted);
      } catch {
        // ignore load errors
      }
    };
    loadProgress();
    return () => {
      mounted = false;
    };
  }, [syllabusId]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const handleScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      setShowScrollDown(!nearBottom);
    };
    handleScroll();
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [chatOpen, messages]);

  // Plain-text stream reader for the local /api/llm endpoint (replaces
  // the earlier reference design's Gemini SSE JSON-chunk parser). Appends decoded chunks straight
  // to the active assistant bubble.
  const streamResponse = async (
    response: Response,
    onText: (text: string) => void,
  ) => {
    if (!response.body) return { assembled: "" };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assembled = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk) {
        assembled += chunk;
        onText(chunk);
      }
    }
    if (!assembled) onText("(Local model unavailable — is Ollama running?)");
    return { assembled };
  };

  const callTutor = async (
    subunitTitle: string,
    keyConcepts: string[],
    history: { role: "user" | "assistant"; content: string }[],
    // true only for a real message the student typed (handleSend) — false
    // for the synthetic auto-teach trigger (handleStart), which has no real
    // text to adapt to. See prompts.ts's generatedLanguageLine/
    // followUpLanguageLine split for why this distinction matters.
    isFollowUp = false,
  ) => {
    const lastUserMessage = isFollowUp ? (history[history.length - 1]?.content ?? "") : "";
    const system = subunitTutorSystemPrompt(
      startLanguage,
      syllabus?.topic ?? "",
      subunitTitle,
      keyConcepts,
      isFollowUp,
      lastUserMessage,
    );
    return fetch("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routeTag: "chat", system, messages: history }),
    });
  };

  // Study-mode-only side call: after a tutor response finishes streaming,
  // asks the local model (routeTag "json", low temperature/small token
  // budget — this is just a handful of short concept+prompt pairs) which
  // prerequisite concepts the student might be missing, and surfaces them
  // as clickable chips. Fire-and-forget from the caller's perspective and
  // fully defensive: any failure (bad JSON, network hiccup, empty response)
  // is swallowed here so it can never break or block the main tutor reply,
  // matching this app's existing "side-call failures stay silent" pattern.
  const detectMissingPrereqs = async (responseText: string) => {
    if (!responseText.trim()) return;
    try {
      const system = prereqDetectionSystemPrompt(startLanguage);
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeTag: "json",
          system,
          messages: [{ role: "user", content: `Tutor response:\n<<<\n${responseText}\n>>>` }],
        }),
      });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;
      const parsed = parseModelJson(jsonMatch[0]) as {
        missing_prerequisites?: { concept?: string; prompt?: string }[];
      };
      const items = Array.isArray(parsed.missing_prerequisites) ? parsed.missing_prerequisites : [];
      const clean = items
        .filter(
          (item): item is { concept: string; prompt: string } =>
            !!item && typeof item.concept === "string" && typeof item.prompt === "string" && item.prompt.trim().length > 0,
        )
        .slice(0, 3);
      setMissingPrereqs(clean);
    } catch {
      // Silent by design — see comment above.
    }
  };

  const persistProgress = async (subunitId: string, completedValue: boolean) => {
    if (!syllabusId) return;
    try {
      await fetch("/api/study/subunit/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          syllabusId,
          subunitId,
          completed: completedValue,
        }),
      });
    } catch {
      // ignore persistence errors
    }
  };

  const handleStart = async (
    unit: Unit,
    subunit: Subunit,
    promptOverride?: string,
    labelOverride?: string,
  ) => {
    const actionLabel = labelOverride ?? "Start";
    const currentSubunitId = activeSubunit?.subunitId;
    const nextSubunitId = subunit.subunit_id;
    if (currentSubunitId && currentSubunitId !== nextSubunitId) {
      setMessagesBySubunit((prev) => ({
        ...prev,
        [currentSubunitId]: messagesSnapshot.current,
      }));
    }

    const savedMessages = messagesBySubunit[nextSubunitId] ?? [];
    const instruction =
      promptOverride ??
      `Explain the subunit "${subunit.title}" in detail, simply and with a short worked example.`;

    setChatOpen(true);
    setActiveSubunit({
      unitTitle: unit.title,
      subunitTitle: subunit.title,
      subunitId: subunit.subunit_id,
      keyConcepts: subunit.key_concepts,
    });
    setMessages([
      ...savedMessages,
      {
        role: "user",
        content: `${actionLabel} ${subunit.subunit_id} · ${subunit.title}`,
      },
      { role: "assistant", content: "" },
    ]);
    setMissingPrereqs([]);

    const modelHistory = [
      ...savedMessages,
      { role: "user" as const, content: instruction },
    ];
    const response = await callTutor(
      subunit.title,
      subunit.key_concepts,
      modelHistory,
    );

    const { assembled } = await streamResponse(response, (text) => {
      setMessages((prev) => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        if (lastIndex < 0 || updated[lastIndex].role !== "assistant") {
          updated.push({ role: "assistant", content: text });
        } else {
          updated[lastIndex] = {
            ...updated[lastIndex],
            content: updated[lastIndex].content + text,
          };
        }
        return updated;
      });
    });

    await persistProgress(subunit.subunit_id, true);
    void detectMissingPrereqs(assembled);
  };

  const handleSend = async (override?: string) => {
    const content = (override ?? chatInput).trim();
    if (!content || !activeSubunit) return;
    setChatInput("");
    const priorHistory = messagesSnapshot.current.filter((m) => m.content);
    const modelHistory = [
      ...priorHistory,
      { role: "user" as const, content },
    ];

    setMessages((prev) => [
      ...prev,
      { role: "user", content },
      { role: "assistant", content: "" },
    ]);
    setMissingPrereqs([]);

    const response = await callTutor(
      activeSubunit.subunitTitle,
      activeSubunit.keyConcepts,
      modelHistory,
      true,
    );

    const { assembled } = await streamResponse(response, (text) => {
      setMessages((prev) => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        if (lastIndex < 0 || updated[lastIndex].role !== "assistant") {
          updated.push({ role: "assistant", content: text });
        } else {
          updated[lastIndex] = {
            ...updated[lastIndex],
            content: updated[lastIndex].content + text,
          };
        }
        return updated;
      });
    });

    await persistProgress(
      activeSubunit.subunitId,
      Boolean(completed[activeSubunit.subunitId]),
    );
    void detectMissingPrereqs(assembled);
  };

  if (!syllabus) {
    return (
      <div className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-6 text-rose-100">
        <p className="text-sm">
          We couldn’t read the syllabus response. Try generating it again.
        </p>
      </div>
    );
  }

  const subunitCount = syllabus.units.reduce(
    (count, unit) => count + unit.subunits.length,
    0,
  );

  const renderSyllabus = (compact: boolean) => (
    <div className="flex flex-col gap-4">
      {onExit ? (
        <div className="flex items-center justify-between">
          <div />
          <button
            type="button"
            onClick={onExit}
            className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/70 hover:border-white/40"
          >
            Back to syllabus builder
          </button>
        </div>
      ) : null}
      <div
        className={`card-deep rounded-2xl text-white ${
          compact ? "p-4" : "p-6"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
              Topic
            </p>
            <h2 className={`${compact ? "text-xl" : "text-2xl"} mt-2 font-semibold`}>
              {syllabus.topic}
            </h2>
          </div>
          <div className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
            {syllabus.units.length} units · {subunitCount} subunits
          </div>
        </div>
      </div>

      {syllabus.units.map((unit) => (
        <div
          key={unit.unit_id}
          className={`card-deep rounded-2xl text-white ${
            compact ? "p-4" : "p-6"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
                Unit {unit.unit_id}
              </p>
              <h3 className={`${compact ? "text-lg" : "text-xl"} mt-2 font-semibold`}>
                {unit.title}
              </h3>
              <p className="mt-2 text-sm text-white/70">{unit.description}</p>
            </div>
            <div className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/60">
              {unit.subunits.length} subunits
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {unit.subunits.map((subunit) => {
              const isCompleted = Boolean(completed[subunit.subunit_id]);
              const isUnlocked =
                subunit.prerequisites.length === 0 ||
                subunit.prerequisites.every((prereq) => completed[prereq]);
              const buttonLabel = isCompleted
                ? "Completed"
                : isUnlocked
                  ? "Start"
                  : "Locked";
              const isDisabled = !isUnlocked || isCompleted;
              const showRetake = isCompleted;
              return (
                <div
                  key={subunit.subunit_id}
                  className="card-deep rounded-xl p-4"
                  data-testid={`subunit-${subunit.subunit_id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {subunit.subunit_id} · {subunit.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isDisabled}
                      onClick={() => {
                        if (isDisabled) return;
                        setCompleted((prev) => ({
                          ...prev,
                          [subunit.subunit_id]: true,
                        }));
                        handleStart(unit, subunit);
                      }}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          !isDisabled
                            ? "border border-white/20 bg-white/10 text-white/80 hover:border-white/40"
                            : "cursor-not-allowed border border-white/10 bg-white/5 text-white/30"
                        }`}
                      >
                        {buttonLabel}
                      </button>
                      {showRetake ? (
                        <button
                          type="button"
                          onClick={() => {
                            handleStart(
                              unit,
                              subunit,
                              "You explained this earlier, but I still didn’t understand it. Please explain it more clearly.",
                              "Retake",
                            );
                          }}
                          className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 hover:border-white/40"
                        >
                          Retake
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {subunit.prerequisites.length > 0 ? (
                    <p className="mt-2 text-xs text-white/50">
                      Prerequisites: {subunit.prerequisites.join(", ")}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {isUnlocked ? (
                      subunit.key_concepts.map((concept) => (
                        <span
                          key={concept}
                          className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/70"
                        >
                          {concept}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/40">
                        Complete prerequisites to unlock.
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  if (!chatOpen) {
    return renderSyllabus(false);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <section
        id="study-chat-panel"
        className="card-deep flex flex-col self-start rounded-2xl p-4 text-white sm:p-6 lg:self-start"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
              Study chat
            </p>
            <h3 className="mt-2 text-lg font-semibold">
              {activeSubunit
                ? `${activeSubunit.subunitId} · ${activeSubunit.subunitTitle}`
                : "Session"}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/70 hover:border-white/40"
            >
              Close chat
            </button>
          </div>
        </div>
        <div className="relative mt-4">
          <div
            ref={messagesRef}
            className="flex h-[420px] flex-col gap-3 overflow-y-auto pr-2"
            data-testid="chat-log"
          >
            {messages.length === 0 ? (
              <p className="text-sm text-white/60">
                Start a subunit to begin.
              </p>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`rounded-2xl px-4 py-3 text-sm ${
                    message.role === "user"
                      ? "self-end bg-white/15 text-white"
                      : "self-start bg-white/5 text-white/80"
                  }`}
                >
                  {message.role === "assistant" ? (
                    message.content ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {message.content}
                      </ReactMarkdown>
                    ) : (
                      <LoadingSpinner size={18} label="Thinking" />
                    )
                  ) : (
                    message.content || "…"
                  )}
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>
          {showScrollDown ? (
            <button
              type="button"
              onClick={scrollToBottom}
              className="absolute bottom-4 right-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xs text-white shadow-lg backdrop-blur transition hover:border-white/40"
              aria-label="Scroll to bottom"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          ) : null}
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center">
          <input
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask a question..."
            data-testid="chat-input"
            className="w-full min-w-0 flex-1 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none sm:w-auto"
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!chatInput.trim()}
            data-testid="chat-send-button"
            className="w-full shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60 sm:w-auto"
          >
            Send
          </button>
        </div>
        {messages.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleSend("Please re-explain that, going deeper.")}
              className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/70 hover:border-white/40"
            >
              Re-explain deeper
            </button>
          </div>
        ) : null}
        {missingPrereqs.length > 0 ? (
          <div className="mt-3 flex flex-none flex-wrap gap-2">
            {missingPrereqs.map((item) => (
              <button
                key={`${item.concept}-${item.prompt}`}
                type="button"
                onClick={() => handleSend(item.prompt)}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70 transition hover:border-white/30 hover:text-white"
              >
                {item.prompt}
              </button>
            ))}
          </div>
        ) : null}
      </section>
      <section className="lg:pt-2">{renderSyllabus(true)}</section>
    </div>
  );
}
