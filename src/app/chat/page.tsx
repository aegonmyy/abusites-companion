"use client";

// General-purpose freeform chat — the one entry point in the app with no
// required context (no syllabus subunit, no note, no question). Follows the
// same streaming-chat pattern as SyllabusView.tsx's tutor chat and
// SegmentsView.tsx's per-segment chat (glass-card bubbles, /api/llm
// routeTag "chat", reader-loop streaming, MicButton for voice), but scoped
// to nothing in particular — see generalChatSystemPrompt in
// src/lib/prompts.ts.
//
// Message history is session-only React state, same precedent as Study
// mode's subunit chat and Notes' segment chat: the schema has no messages
// column, and nothing about this feature calls for changing that.

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import LoadingSpinner from "@/components/LoadingSpinner";
import MicButton from "@/components/MicButton";
import SendGlyph from "@/components/SendGlyph";
import MathText from "@/components/MathText";
import { generalChatSystemPrompt } from "@/lib/prompts";

type ChatMsg = { role: "user" | "assistant"; content: string };

export default function ChatPage() {
  const [modelSource, setModelSource] = useState<"local" | "cloud">("local");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setModelSource(d.modelSource === "cloud" ? "cloud" : "local"))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  async function streamAssistantReply(res: Response) {
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (!chunk) continue;
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
    const content = input.trim();
    if (!content || streaming) return;
    const nextChat = [...chat, { role: "user" as const, content }];
    setChat([...nextChat, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeTag: "chat", system: generalChatSystemPrompt(content), messages: nextChat }),
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
    if (streaming) return;
    const history = chat;
    setChat((prev) => [...prev, { role: "user", content: "🎤 (voice message)" }, { role: "assistant", content: "" }]);
    setStreaming(true);

    // No transcribed text exists yet to detect language from (that happens
    // inside this same model call) — best-effort fallback to the last real
    // typed message, if any, otherwise defaults to English.
    const lastTyped = [...history].reverse().find((m) => m.role === "user")?.content ?? "";

    try {
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeTag: "audio", system: generalChatSystemPrompt(lastTyped), messages: history, audio }),
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
    <div className="min-h-dvh px-6 py-12">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5" data-testid="chat-page">
        <div>
          <h1 className="text-2xl font-semibold text-white">Chat</h1>
          <p className="mt-2 text-sm text-white/70">
            Ask anything, no syllabus or note needed. This conversation isn&apos;t saved once you leave the page.
          </p>
        </div>

        <div className="card-deep flex min-h-[28rem] flex-1 flex-col gap-3 rounded-2xl p-5 text-white">
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto" data-testid="chat-log">
            {chat.length === 0 ? (
              <p className="text-sm text-white/50">Type a question below to get started.</p>
            ) : (
              chat.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-full rounded-2xl px-4 py-3 text-sm ${
                    m.role === "user" ? "self-end bg-white/15 text-white" : "self-start bg-white/5 text-white/80"
                  }`}
                >
                  {m.role === "assistant" && !m.content ? (
                    <LoadingSpinner size={18} label="Thinking" />
                  ) : m.role === "assistant" ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {m.content}
                    </ReactMarkdown>
                  ) : (
                    <MathText text={m.content} />
                  )}
                </div>
              ))
            )}
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
              placeholder="Ask anything…"
              data-testid="chat-input"
              className="min-w-0 flex-1 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
            />
            <button
              type="submit"
              disabled={streaming}
              data-testid="chat-send-button"
              className="inline-flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-full bg-white text-slate-900 disabled:opacity-60"
              aria-label="Send"
            >
              <SendGlyph />
            </button>
            {modelSource === "local" && <MicButton disabled={streaming} onRecorded={sendAudio} />}
          </form>
        </div>
      </div>
    </div>
  );
}
