"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MathText from "@/components/MathText";
import MicButton from "@/components/MicButton";
import SendGlyph from "@/components/SendGlyph";
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

  async function streamAssistantReply(res: Response) {
    setChat((prev) => [...prev, { role: "assistant", content: "" }]);
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
      await streamAssistantReply(res);
    } catch {
      setChat((prev) => [...prev, { role: "assistant", content: "(Local model unavailable — is Ollama running?)" }]);
    } finally {
      setStreaming(false);
    }
  }

  async function sendAudio(audio: { base64: string; format: string }) {
    if (!note || streaming) return;
    setChat((prev) => [...prev, { role: "user", content: "🎤 (voice message)" }]);
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
      setChat((prev) => [...prev, { role: "assistant", content: "(Local model unavailable — is Ollama running?)" }]);
    } finally {
      setStreaming(false);
    }
  }

  if (!note) {
    return <p className="text-sm muted">Loading note…</p>;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="note-detail-page">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{note.title}</h1>
          <MathText as="p" className="text-sm muted mt-1" text={note.summary} />
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <button type="button" onClick={bookmark} data-testid="bookmark-note-button" className="text-xs font-medium" style={{ color: "var(--primary)" }}>
            {bookmarked ? "Bookmarked" : "Bookmark"}
          </button>
          <button type="button" onClick={remove} data-testid="delete-note-button" className="text-xs font-medium" style={{ color: "var(--bad)" }}>
            Delete
          </button>
        </div>
      </div>

      {note.keyConcepts.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="note-key-concepts">
          {note.keyConcepts.map((k, i) => (
            <span key={i} className="chip">
              {k}
            </span>
          ))}
        </div>
      )}

      {note.quiz.length > 0 && (
        <div className="card p-5" data-testid="note-quiz">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-sm">Quiz</span>
            {submitted && (
              <span data-testid="note-quiz-score" className="text-sm font-semibold" style={{ color: "var(--primary)" }}>
                {score} / {note.quiz.length}
              </span>
            )}
          </div>
          <ol className="flex flex-col gap-4">
            {note.quiz.map((q, qi) => (
              <li key={qi}>
                <MathText as="p" className="text-sm font-medium mb-1.5" text={`${qi + 1}. ${q.question}`} />
                <div className="flex flex-col gap-1.5">
                  {q.options.map((opt, oi) => (
                    <button
                      key={oi}
                      type="button"
                      disabled={submitted}
                      onClick={() => choose(qi, oi)}
                      data-testid={`note-quiz-q${qi}-opt${oi}`}
                      className={
                        "option " +
                        (submitted
                          ? oi === q.correct_index
                            ? "option-correct"
                            : answers[qi] === oi
                              ? "option-wrong"
                              : ""
                          : answers[qi] === oi
                            ? "option-selected"
                            : "")
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
              className="btn btn-primary mt-4"
            >
              Submit
            </button>
          )}
        </div>
      )}

      <div className="card p-4 flex flex-col gap-3 min-h-[18rem]">
        <span className="font-semibold text-sm">Ask about this note</span>
        <div className="flex-1 flex flex-col gap-2 overflow-y-auto" data-testid="note-chat-log">
          {chat.map((m, i) => (
            <div
              key={i}
              className={"bubble " + (m.role === "user" ? "bubble-user" : "bubble-assistant")}
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
          className="flex gap-2 items-center"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a follow-up…"
            data-testid="note-chat-input"
            className="field flex-1"
          />
          <button
            type="submit"
            disabled={streaming}
            data-testid="note-chat-send-button"
            className="btn-icon btn-icon-primary"
            aria-label="Send"
          >
            <SendGlyph />
          </button>
          <MicButton disabled={streaming} onRecorded={sendAudio} />
        </form>
      </div>
    </div>
  );
}
