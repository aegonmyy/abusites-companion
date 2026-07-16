"use client";

// Note detail. Data logic (load note, quiz scoring, note-scoped chat + voice
// via /api/llm, bookmark, delete) is the local target's, unchanged. Markup is
// rebuilt in Grinnish's vocabulary: glass cards, concept chips as bordered
// pills, dark option buttons, and the Grinnish study-chat bubbles
// (self-end bg-white/15 / self-start bg-white/5) for the follow-up chat.

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MathText from "@/components/MathText";
import MicButton from "@/components/MicButton";
import SendGlyph from "@/components/SendGlyph";
import LoadingSpinner from "@/components/LoadingSpinner";
import { notesChatSystemPrompt, type Language } from "@/lib/prompts";

type QuizQuestion = {
  question: string;
  options: string[];
  correct_index: number;
};

type Note = {
  id: string;
  title: string;
  sourceType: string;
  rawText: string | null;
  summary: string;
  keyConcepts: string[];
  quiz: QuizQuestion[];
  createdAt: string;
};

type ChatMsg = { role: "user" | "assistant"; content: string };

export default function NoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [note, setNote] = useState<Note | null>(null);
  const [language, setLanguage] = useState<Language>("en");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch(`/api/notes/${id}`)
      .then((r) => r.json())
      .then(setNote);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setLanguage((d.language as Language) ?? "en"));
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  function choose(qIndex: number, optIndex: number) {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qIndex]: optIndex }));
  }

  const score = note
    ? note.quiz.reduce((acc, q, i) => (answers[i] === q.correct_index ? acc + 1 : acc), 0)
    : 0;

  async function bookmark() {
    if (!note) return;
    await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "note", refId: note.id, label: note.title }),
    });
    setBookmarked(true);
  }

  async function remove() {
    if (!note) return;
    await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
    router.push("/notes");
  }

  // Fills the already-pushed trailing empty assistant bubble as chunks
  // arrive. The bubble itself is pushed by the caller *before* the fetch
  // starts (not here) — this route's fetch() promise doesn't resolve until
  // Ollama already has a token ready (measured: headers and first body
  // chunk arrive within ~3ms of each other), so if the placeholder were
  // pushed only after fetch resolved, the "empty" state — and the loading
  // spinner it shows — would never be visible; the real wait (often 1s+)
  // would render nothing at all instead.
  async function streamAssistantReply(res: Response) {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      setChat((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + chunk };
        return copy;
      });
    }
  }

  function replaceLastAssistant(content: string) {
    setChat((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = { ...copy[copy.length - 1], content };
      return copy;
    });
  }

  async function send() {
    if (!input.trim() || !note || streaming) return;
    const userMsg: ChatMsg = { role: "user", content: input.trim() };
    const nextChat = [...chat, userMsg];
    setChat([...nextChat, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    const system = notesChatSystemPrompt(language, note.title, note.summary, note.keyConcepts);

    try {
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeTag: "chat", system, messages: nextChat }),
      });
      if (!res.ok || !res.body) throw new Error("Local model call failed.");
      await streamAssistantReply(res);
    } catch {
      replaceLastAssistant("(Local model unavailable — is Ollama running?)");
    } finally {
      setStreaming(false);
    }
  }

  async function sendAudio(audio: { base64: string; format: string }) {
    if (!note || streaming) return;
    setChat((prev) => [...prev, { role: "user", content: "🎤 (voice message)" }, { role: "assistant", content: "" }]);
    setStreaming(true);

    const system = notesChatSystemPrompt(language, note.title, note.summary, note.keyConcepts);

    try {
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeTag: "audio", system, messages: chat, audio }),
      });
      if (!res.ok || !res.body) throw new Error("Local model call failed.");
      await streamAssistantReply(res);
    } catch {
      replaceLastAssistant("(Local model unavailable — is Ollama running?)");
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5" data-testid="note-detail-page">
        {!note ? (
          <p className="text-sm text-white/70">Loading note…</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-white">{note.title}</h1>
                <MathText as="p" className="mt-2 text-sm text-white/70" text={note.summary} />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={bookmark}
                  data-testid="bookmark-note-button"
                  className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/80 hover:border-white/40"
                >
                  {bookmarked ? "Bookmarked" : "Bookmark"}
                </button>
                <button
                  type="button"
                  onClick={remove}
                  data-testid="delete-note-button"
                  className="rounded-full border border-rose-300/40 px-3 py-1 text-xs font-semibold text-rose-200 hover:border-rose-300/70"
                >
                  Delete
                </button>
              </div>
            </div>

            {note.keyConcepts.length > 0 && (
              <div className="flex flex-wrap gap-2" data-testid="note-key-concepts">
                {note.keyConcepts.map((k, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/70"
                  >
                    {k}
                  </span>
                ))}
              </div>
            )}

            {note.quiz.length > 0 && (
              <div
                className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-xl backdrop-blur"
                data-testid="note-quiz"
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Quiz</span>
                  {submitted && (
                    <span data-testid="note-quiz-score" className="text-sm font-semibold text-emerald-200">
                      {score} / {note.quiz.length}
                    </span>
                  )}
                </div>
                <ol className="flex flex-col gap-5">
                  {note.quiz.map((q, qi) => (
                    <li key={qi}>
                      <MathText as="p" className="mb-2 text-sm font-medium text-white" text={`${qi + 1}. ${q.question}`} />
                      <div className="flex flex-col gap-2">
                        {q.options.map((opt, oi) => {
                          const state = submitted
                            ? oi === q.correct_index
                              ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-50"
                              : answers[qi] === oi
                                ? "border-rose-400/70 bg-rose-500/10 text-rose-100"
                                : "border-white/10 bg-white/5 text-white"
                            : answers[qi] === oi
                              ? "border-emerald-400/70 bg-emerald-500/10 text-white"
                              : "border-white/10 bg-white/5 text-white hover:border-white/30";
                          return (
                            <button
                              key={oi}
                              type="button"
                              disabled={submitted}
                              onClick={() => choose(qi, oi)}
                              data-testid={`note-quiz-q${qi}-opt${oi}`}
                              className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm transition ${state}`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  ))}
                </ol>
                {!submitted && (
                  <button
                    type="button"
                    onClick={() => setSubmitted(true)}
                    data-testid="note-quiz-submit"
                    className="mt-5 rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900"
                  >
                    Submit
                  </button>
                )}
              </div>
            )}

            <div className="flex min-h-[18rem] flex-col gap-3 rounded-2xl border border-white/10 bg-white/10 p-5 text-white shadow-xl backdrop-blur">
              <span className="text-sm font-semibold text-white">Ask about this note</span>
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto" data-testid="note-chat-log">
                {chat.map((m, i) => (
                  <div
                    key={i}
                    className={`rounded-2xl px-4 py-3 text-sm ${
                      m.role === "user" ? "self-end bg-white/15 text-white" : "self-start bg-white/5 text-white/80"
                    }`}
                  >
                    {m.role === "assistant" && !m.content ? (
                      <LoadingSpinner size={18} label="Thinking" />
                    ) : (
                      <MathText text={m.content} />
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex items-center gap-2 border-t border-white/10 pt-3"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a follow-up…"
                  data-testid="note-chat-input"
                  className="min-w-0 flex-1 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={streaming}
                  data-testid="note-chat-send-button"
                  className="inline-flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-full bg-white text-slate-900 disabled:opacity-60"
                  aria-label="Send"
                >
                  <SendGlyph />
                </button>
                <MicButton disabled={streaming} onRecorded={sendAudio} />
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
