"use client";

import { use, useEffect, useRef, useState } from "react";
import MathText from "@/components/MathText";
import MicButton from "@/components/MicButton";
import SendGlyph from "@/components/SendGlyph";
import { subunitTutorSystemPrompt, type Language } from "@/lib/prompts";

type Subunit = {
  subunit_id: string;
  title: string;
  key_concepts: string[];
  prerequisites?: string[];
};
type Unit = { unit_id: number; title: string; subunits: Subunit[] };
type Syllabus = {
  id: string;
  topic: string;
  goal: string;
  units: Unit[];
  progress: { subunitId: string; completed: boolean }[];
};

type ChatMsg = { role: "user" | "assistant"; content: string };

export default function SyllabusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [syllabus, setSyllabus] = useState<Syllabus | null>(null);
  const [activeSubunit, setActiveSubunit] = useState<Subunit | null>(null);
  const [language, setLanguage] = useState<Language>("en");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch(`/api/study/syllabus/${id}`)
      .then((r) => r.json())
      .then(setSyllabus);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setLanguage((d.language as Language) ?? "en"));
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  function openSubunit(su: Subunit) {
    setActiveSubunit(su);
    setChat([]);
  }

  async function markComplete() {
    if (!activeSubunit || !syllabus) return;
    await fetch("/api/study/subunit/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syllabusId: syllabus.id, subunitId: activeSubunit.subunit_id, completed: true }),
    });
    setSyllabus((prev) =>
      prev
        ? {
            ...prev,
            progress: [
              ...prev.progress.filter((p) => p.subunitId !== activeSubunit.subunit_id),
              { subunitId: activeSubunit.subunit_id, completed: true },
            ],
          }
        : prev,
    );
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
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          content: copy[copy.length - 1].content + chunk,
        };
        return copy;
      });
    }
  }

  async function send() {
    if (!input.trim() || !activeSubunit || !syllabus || streaming) return;
    const userMsg: ChatMsg = { role: "user", content: input.trim() };
    const nextChat = [...chat, userMsg];
    setChat(nextChat);
    setInput("");
    setStreaming(true);

    const system = subunitTutorSystemPrompt(
      language,
      syllabus.topic,
      activeSubunit.title,
      activeSubunit.key_concepts,
    );

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
    if (!activeSubunit || !syllabus || streaming) return;
    setChat((prev) => [...prev, { role: "user", content: "🎤 (voice message)" }]);
    setStreaming(true);

    const system = subunitTutorSystemPrompt(
      language,
      syllabus.topic,
      activeSubunit.title,
      activeSubunit.key_concepts,
    );

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

  if (!syllabus) {
    return <p className="text-sm muted">Loading syllabus…</p>;
  }

  const completedSet = new Set(syllabus.progress.filter((p) => p.completed).map((p) => p.subunitId));

  return (
    <div className="flex flex-col gap-4" data-testid="syllabus-page">
      <div>
        <h1 className="text-xl font-semibold">{syllabus.topic}</h1>
        <p className="text-sm muted">{syllabus.goal}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 items-start">
        <div className="flex flex-col gap-3" data-testid="syllabus-tree">
          {syllabus.units.map((unit) => (
            <div key={unit.unit_id} className="card p-4">
              <div className="font-semibold mb-2">{unit.title}</div>
              <ul className="flex flex-col gap-1">
                {unit.subunits.map((su) => (
                  <li key={su.subunit_id}>
                    <button
                      type="button"
                      onClick={() => openSubunit(su)}
                      data-testid={`subunit-${su.subunit_id}`}
                      className={
                        "w-full text-left text-sm rounded-lg px-3 py-2 transition-colors " +
                        (activeSubunit?.subunit_id === su.subunit_id
                          ? "option-selected"
                          : "hover:bg-[var(--card-muted)]")
                      }
                    >
                      {completedSet.has(su.subunit_id) ? "✓ " : ""}
                      {su.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="card p-4 flex flex-col gap-3 min-h-[24rem] md:sticky md:top-6">
          {!activeSubunit && (
            <p className="text-sm muted">
              Pick a subunit on the left to start the tutor.
            </p>
          )}
          {activeSubunit && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{activeSubunit.title}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      fetch("/api/bookmarks", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          kind: "subunit",
                          refId: `${syllabus.id}:${activeSubunit.subunit_id}`,
                          label: `${syllabus.topic} — ${activeSubunit.title}`,
                        }),
                      })
                    }
                    data-testid="bookmark-subunit-button"
                    className="text-xs font-medium"
                    style={{ color: "var(--primary)" }}
                  >
                    Bookmark
                  </button>
                  <button
                    type="button"
                    onClick={markComplete}
                    data-testid="mark-complete-button"
                    className="text-xs font-medium"
                    style={{ color: "var(--primary)" }}
                  >
                    {completedSet.has(activeSubunit.subunit_id) ? "Completed" : "Mark complete"}
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-2 overflow-y-auto" data-testid="chat-log">
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
                  placeholder="Ask the tutor…"
                  data-testid="chat-input"
                  className="field flex-1"
                />
                <button
                  type="submit"
                  disabled={streaming}
                  data-testid="chat-send-button"
                  className="btn-icon btn-icon-primary"
                  aria-label="Send"
                >
                  <SendGlyph />
                </button>
                <MicButton disabled={streaming} onRecorded={sendAudio} />
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
