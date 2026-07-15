"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MathText from "@/components/MathText";
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

  async function send() {
    if (!input.trim() || !note || streaming) return;
    const userMsg: ChatMsg = { role: "user", content: input.trim() };
    const nextChat = [...chat, userMsg];
    setChat(nextChat);
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

      setChat((prev) => [...prev, { role: "assistant", content: "" }]);
      const reader = res.body.getReader();
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
    } catch {
      setChat((prev) => [...prev, { role: "assistant", content: "(Local model unavailable — is Ollama running?)" }]);
    } finally {
      setStreaming(false);
    }
  }

  if (!note) {
    return <p className="text-sm text-black/60 dark:text-white/60">Loading note…</p>;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="note-detail-page">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{note.title}</h1>
          <MathText as="p" className="text-sm text-black/70 dark:text-white/70 mt-1" text={note.summary} />
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button type="button" onClick={bookmark} data-testid="bookmark-note-button" className="text-xs underline">
            {bookmarked ? "Bookmarked" : "Bookmark"}
          </button>
          <button type="button" onClick={remove} data-testid="delete-note-button" className="text-xs underline text-red-600">
            Delete
          </button>
        </div>
      </div>

      {note.keyConcepts.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="note-key-concepts">
          {note.keyConcepts.map((k, i) => (
            <span
              key={i}
              className="text-xs rounded-full bg-black/5 dark:bg-white/10 px-2 py-1"
            >
              {k}
            </span>
          ))}
        </div>
      )}

      {note.quiz.length > 0 && (
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-3" data-testid="note-quiz">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-sm">Quiz</span>
            {submitted && (
              <span data-testid="note-quiz-score" className="text-sm font-medium">
                {score} / {note.quiz.length}
              </span>
            )}
          </div>
          <ol className="flex flex-col gap-3">
            {note.quiz.map((q, qi) => (
              <li key={qi}>
                <MathText as="p" className="text-sm font-medium mb-1" text={`${qi + 1}. ${q.question}`} />
                <div className="flex flex-col gap-1">
                  {q.options.map((opt, oi) => (
                    <button
                      key={oi}
                      type="button"
                      disabled={submitted}
                      onClick={() => choose(qi, oi)}
                      data-testid={`note-quiz-q${qi}-opt${oi}`}
                      className={
                        "text-left text-sm rounded-lg border px-3 py-1.5 " +
                        (submitted
                          ? oi === q.correct_index
                            ? "border-green-600 bg-green-50 dark:bg-green-900/30"
                            : answers[qi] === oi
                              ? "border-red-600 bg-red-50 dark:bg-red-900/30"
                              : "border-black/10 dark:border-white/10"
                          : answers[qi] === oi
                            ? "border-black dark:border-white"
                            : "border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5")
                      }
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          {!submitted && (
            <button
              type="button"
              onClick={() => setSubmitted(true)}
              data-testid="note-quiz-submit"
              className="mt-3 rounded-full bg-black text-white dark:bg-white dark:text-black px-4 py-1.5 text-sm font-medium"
            >
              Submit
            </button>
          )}
        </div>
      )}

      <div className="border border-black/10 dark:border-white/10 rounded-lg p-3 flex flex-col gap-3 min-h-[16rem]">
        <span className="font-medium text-sm">Ask about this note</span>
        <div className="flex-1 flex flex-col gap-2 overflow-y-auto" data-testid="note-chat-log">
          {chat.map((m, i) => (
            <div
              key={i}
              className={
                "text-sm rounded-lg px-3 py-2 max-w-[90%] " +
                (m.role === "user"
                  ? "self-end bg-black text-white dark:bg-white dark:text-black"
                  : "self-start bg-black/5 dark:bg-white/10")
              }
            >
              <MathText text={m.content} />
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a follow-up…"
            data-testid="note-chat-input"
            className="flex-1 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 bg-transparent text-sm"
          />
          <button
            type="submit"
            disabled={streaming}
            data-testid="note-chat-send-button"
            className="rounded-lg bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
