"use client";

// Note detail. Data logic (load note, quiz scoring, note-scoped chat + voice
// via /api/llm, bookmark, delete) is the local target's, unchanged. Markup is
// rebuilt in the earlier reference design's vocabulary: glass cards, concept chips as bordered
// pills, dark option buttons, and the same study-chat bubbles
// (self-end bg-white/15 / self-start bg-white/5) for the follow-up chat.

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import MathText from "@/components/MathText";
import MicButton from "@/components/MicButton";
import SendGlyph from "@/components/SendGlyph";
import LoadingSpinner from "@/components/LoadingSpinner";
import { BackIcon, BookmarksIcon, TrashIcon } from "@/components/icons/NavIcons";
import { notesChatSystemPrompt, notesQuizSystemPrompt, type StartLanguage } from "@/lib/prompts";
import { parseModelJson } from "@/lib/parse-model-json";
import SegmentsView, { type Segment } from "./SegmentsView";
import { isDepthPreference } from "@/lib/notes-depth";
import { sanitizeStartLanguage } from "@/lib/sanitize-language-mode";

const MAX_SOURCE_EXCERPT_CHARS = 6000;

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
  // Legacy fields — only populated on pre-migration notes (see the legacy
  // branch in the render below). New notes leave these null.
  summary: string | null;
  keyConcepts: string[];
  // New segments-shaped fields.
  segments: Segment[] | null;
  segmentExplanations: Record<string, string>;
  depthPreference: string;
  quiz: QuizQuestion[];
  createdAt: string;
  // "hausa" | "english", chosen at upload time — see prompts.ts's
  // StartLanguage. Legacy (pre-migration) notes have no stored value, so
  // this is sanitized at every read site rather than trusted raw.
  language?: string;
};

type ChatMsg = { role: "user" | "assistant"; content: string };

// The whole-document "Ask about this note" chat (unchanged feature) needs a
// short summary string as context regardless of note shape. Legacy notes
// have a real one; new segments-shaped notes don't (that upfront compact
// summary is exactly what this redesign removed), so fall back to a joined
// list of segment titles — still enough context for the chat prompt.
function noteContextSummary(note: Note): string {
  if (note.summary) return note.summary;
  if (note.segments && note.segments.length > 0) {
    return `Covers: ${note.segments.map((s) => s.title).join(", ")}.`;
  }
  return "";
}

export default function NoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [note, setNote] = useState<Note | null>(null);
  const [modelSource, setModelSource] = useState<"local" | "cloud">("local");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [quizGenerating, setQuizGenerating] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizCount, setQuizCount] = useState(5);
  // Defaults to the note's own language once it loads, but the student can
  // override it per-generation — previously this silently always inherited
  // note.language with no way to ask for the quiz in the other language
  // without re-uploading the whole note.
  const [quizLanguage, setQuizLanguage] = useState<StartLanguage>("english");
  const [quizLanguageTouched, setQuizLanguageTouched] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch(`/api/notes/${id}`)
      .then((r) => r.json())
      .then(setNote);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setModelSource(d.modelSource === "cloud" ? "cloud" : "local");
      });
  }, [id]);

  // Default the quiz-language selector to the note's own language once it
  // loads, but only until the student actually touches the selector
  // themselves — after that, their explicit choice wins on every
  // regenerate, it doesn't keep snapping back.
  useEffect(() => {
    if (note && !quizLanguageTouched) {
      setQuizLanguage(sanitizeStartLanguage(note.language));
    }
  }, [note, quizLanguageTouched]);

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
    setBookmarkError(null);
    try {
      const res = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "note", refId: note.id, label: note.title }),
      });
      if (!res.ok) throw new Error("Could not bookmark this note.");
      setBookmarked(true);
    } catch (err) {
      setBookmarkError(err instanceof Error ? err.message : "Could not bookmark this note.");
    }
  }

  async function remove() {
    if (!note || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete this note.");
      router.push("/notes");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete this note.");
      setDeleting(false);
    }
  }

  // The deferred "Generate quiz" action — quiz generation no longer happens
  // upfront at note creation; this is an explicit, separate routeTag "json"
  // call the student triggers after seeing the segment list, reusing the
  // exact quiz JSON shape (question/options/correct_index) the app already
  // knows how to render/score above.
  async function generateQuiz() {
    if (!note || quizGenerating) return;
    setQuizGenerating(true);
    setQuizError(null);
    try {
      const source = note.rawText?.trim()
        ? note.rawText
        : (note.segments ?? []).map((s) => `${s.title}: ${s.summary}`).join("\n");
      if (!source.trim()) throw new Error("Nothing to quiz — this note has no source text.");

      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeTag: "json",
          system: notesQuizSystemPrompt(quizLanguage, quizCount),
          // Scales with question count (~150 tokens/question is a
          // comfortable ceiling for a concise question + 4 options + index,
          // plus a fixed overhead for JSON structure) — verified against the
          // real local model at the max count (15) with no truncation.
          numPredictOverride: Math.min(2500, 150 * quizCount + 200),
          messages: [{ role: "user", content: source }],
        }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Local model call failed.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Model did not return a parseable quiz.");
      const parsed = parseModelJson(jsonMatch[0]) as { quiz?: QuizQuestion[] };
      if (!Array.isArray(parsed.quiz) || parsed.quiz.length === 0) {
        throw new Error("Model's response had no quiz questions.");
      }

      const saveRes = await fetch(`/api/notes/${note.id}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quiz: parsed.quiz }),
      });
      if (!saveRes.ok) {
        const d = await saveRes.json().catch(() => ({}));
        throw new Error(d.error ?? "Could not save quiz.");
      }
      const saved = await saveRes.json();
      setNote((prev) => (prev ? { ...prev, quiz: saved.quiz ?? parsed.quiz } : prev));
      setAnswers({});
      setSubmitted(false);
    } catch (err) {
      setQuizError(err instanceof Error ? err.message : "Could not generate a quiz.");
    } finally {
      setQuizGenerating(false);
    }
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

    const sourceExcerpt = (note.rawText ?? "").trim().slice(0, MAX_SOURCE_EXCERPT_CHARS);
    const system = notesChatSystemPrompt(note.title, noteContextSummary(note), note.keyConcepts, sourceExcerpt, userMsg.content);

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

    // No transcribed text exists yet to detect language from — best-effort
    // fallback to the last real typed message in this chat, if any.
    const lastTyped = [...chat].reverse().find((m) => m.role === "user")?.content ?? "";
    const sourceExcerpt = (note.rawText ?? "").trim().slice(0, MAX_SOURCE_EXCERPT_CHARS);
    const system = notesChatSystemPrompt(note.title, noteContextSummary(note), note.keyConcepts, sourceExcerpt, lastTyped);

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
    <div className="min-h-dvh px-6 py-12">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5" data-testid="note-detail-page">
        {!note ? (
          <p className="flex items-center gap-3 text-sm text-white/70">
            <LoadingSpinner size={18} label="Loading" />
            Loading note…
          </p>
        ) : (
          <>
            <div>
              <Link
                href="/notes"
                data-testid="back-to-notes-link"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/60 transition hover:text-white/90"
              >
                <BackIcon className="h-4 w-4" />
                Back to notes
              </Link>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-white">{note.title}</h1>
                {note.summary ? (
                  <MathText as="p" className="mt-2 text-sm text-white/70" text={note.summary} />
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={bookmark}
                  data-testid="bookmark-note-button"
                  aria-label={bookmarked ? "Bookmarked" : "Bookmark"}
                  title={bookmarked ? "Bookmarked" : "Bookmark"}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${
                    bookmarked
                      ? "border-emerald-300/50 bg-emerald-500/15 text-emerald-300"
                      : "border-white/20 text-white/80 hover:border-white/40"
                  }`}
                >
                  <BookmarksIcon />
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={deleting}
                  data-testid="delete-note-button"
                  aria-label="Delete"
                  title="Delete"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-rose-300/40 text-rose-200 transition hover:border-rose-300/70 hover:bg-rose-500/10 disabled:opacity-60"
                >
                  {deleting ? <LoadingSpinner size={16} className="text-rose-200" label="Deleting" /> : <TrashIcon />}
                </button>
              </div>
            </div>

            {(bookmarkError || deleteError) && (
              <p className="text-xs font-semibold text-rose-300" data-testid="note-actions-error">
                {bookmarkError || deleteError}
              </p>
            )}

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

            {note.segments && note.segments.length > 0 ? (
              <SegmentsView
                noteId={note.id}
                documentTitle={note.title}
                segments={note.segments}
                depthPreference={isDepthPreference(note.depthPreference) ? note.depthPreference : "standard"}
                startLanguage={sanitizeStartLanguage(note.language)}
                initialExplanations={note.segmentExplanations}
                sourceText={note.rawText}
                modelSource={modelSource}
              />
            ) : null}

            <div className="card-deep flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5 text-white">
              <div>
                <span className="text-sm font-semibold text-white">Quiz</span>
                <p className="mt-1 text-xs text-white/60">
                  {note.quiz.length > 0
                    ? "Generate a fresh set of questions any time."
                    : "Not generated yet — build one whenever you're ready to test yourself."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-full border border-white/20 p-0.5" role="radiogroup" aria-label="Quiz language">
                  {(["english", "hausa"] as const).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      role="radio"
                      aria-checked={quizLanguage === lang}
                      data-testid={`quiz-language-${lang}`}
                      onClick={() => {
                        setQuizLanguage(lang);
                        setQuizLanguageTouched(true);
                      }}
                      disabled={quizGenerating}
                      className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition disabled:opacity-60 ${
                        quizLanguage === lang
                          ? "bg-emerald-500/15 text-emerald-200"
                          : "text-white/60 hover:text-white/80"
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 text-xs text-white/60" title="The model may return fewer than this on higher counts.">
                  Up to
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={quizCount}
                    onChange={(e) =>
                      setQuizCount(Math.min(15, Math.max(1, Number(e.target.value) || 1)))
                    }
                    disabled={quizGenerating}
                    data-testid="quiz-count-input"
                    className="w-14 rounded-full border border-white/20 bg-white/10 px-2 py-1 text-center text-xs text-white focus:border-white/40 focus:outline-none disabled:opacity-60"
                  />
                </label>
                <button
                  type="button"
                  onClick={generateQuiz}
                  disabled={quizGenerating}
                  data-testid="generate-quiz-button"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-900 disabled:opacity-60"
                >
                  {quizGenerating && <LoadingSpinner size={14} className="text-slate-900" label="Generating" />}
                  {quizGenerating ? "Generating…" : note.quiz.length > 0 ? "Regenerate quiz" : "Generate quiz"}
                </button>
              </div>
            </div>
            {quizError && <p className="text-sm text-rose-300">{quizError}</p>}

            {note.quiz.length > 0 && (
              <div
                className="card-deep rounded-2xl p-6"
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

            {!(note.segments && note.segments.length > 0) && (
            <div className="card-deep flex min-h-[18rem] flex-col gap-3 rounded-2xl p-5 text-white">
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
                    ) : m.role === "assistant" ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {m.content}
                      </ReactMarkdown>
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
                {modelSource === "local" && <MicButton disabled={streaming} onRecorded={sendAudio} />}
              </form>
            </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
