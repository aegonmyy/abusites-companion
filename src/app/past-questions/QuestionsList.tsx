"use client";

// Ported from the earlier reference design's app/past-questions/QuestionsList.tsx. Markup/classes
// verbatim: the Focus Year filter pills, the conic-gradient "Orbit progress"
// ring, per-year question cards, Mark-as-read / Bookmark / Explain controls,
// Show-answer, and the right-click Export menu. Rewiring:
//   - Supabase read-tracking  ->  local in-session state (the local app has no
//     per-question read table; marks reset on reload, no data is lost).
//   - Supabase bookmarks      ->  local /api/bookmarks (kind "past_question").
//   - Paywall (PricingModal / free-limit countdown) removed — the local app
//     has no accounts or limits, so that branch never rendered anyway.

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import MathText from "@/components/MathText";
import LoadingSpinner from "@/components/LoadingSpinner";
import { explainQuestionSystemPrompt } from "@/lib/prompts";
import { useDefaultStartLanguage } from "@/lib/language-mode";

const labels = ["A", "B", "C", "D"];

export type CourseQuestion = {
  id: string | number;
  year: number | null;
  question_text: string | null;
  options: string[] | null;
  answer: string | number | null;
  details: string | null;
};

type Props = {
  questions: CourseQuestion[];
  totalCount: number;
};

export default function QuestionsList({ questions, totalCount }: Props) {
  const startLanguage = useDefaultStartLanguage();
  const [year, setYear] = useState<string>("");
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [bookmarkRowIds, setBookmarkRowIds] = useState<Record<string, string>>({});
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    question: CourseQuestion;
  } | null>(null);
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [aiExplainLoadingId, setAiExplainLoadingId] = useState<string | null>(null);
  const [aiExplainErrorId, setAiExplainErrorId] = useState<string | null>(null);

  const yearOptions = useMemo(() => {
    const years = Array.from(
      new Set(questions.map((item) => item.year).filter(Boolean)) as Set<number>,
    ).sort((a, b) => b - a);
    return years;
  }, [questions]);


  useEffect(() => {
    let isMounted = true;
    fetch("/api/bookmarks")
      .then((r) => r.json())
      .then((rows: { id: string; kind: string; refId: string }[]) => {
        if (!isMounted) return;
        const marked = new Set<string>();
        const rowIds: Record<string, string> = {};
        rows
          .filter((b) => b.kind === "past_question")
          .forEach((b) => {
            marked.add(b.refId);
            rowIds[b.refId] = b.id;
          });
        setBookmarkedIds(marked);
        setBookmarkRowIds(rowIds);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [questions]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const filtered = useMemo(() => {
    if (!year) return questions;
    return questions.filter((question) => String(question.year) === year);
  }, [questions, year]);

  const grouped = useMemo(() => {
    return filtered.reduce<Record<string, CourseQuestion[]>>((acc, item) => {
      const key = item.year ? String(item.year) : "Unknown year";
      acc[key] = acc[key] ?? [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [filtered]);

  const yearKeys = Object.keys(grouped);
  const filteredCount = filtered.length;
  const completedFiltered = filtered.filter((question) =>
    completedIds.has(String(question.id)),
  ).length;
  const completionRatio = filteredCount > 0 ? completedFiltered / filteredCount : 0;

  const toggleCompleted = (questionId: string | number) => {
    const key = String(questionId);
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleBookmark = async (question: CourseQuestion) => {
    const key = String(question.id);
    if (bookmarkedIds.has(key)) {
      const rowId = bookmarkRowIds[key];
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      if (rowId) {
        try {
          const res = await fetch(`/api/bookmarks/${rowId}`, { method: "DELETE" });
          if (!res.ok) throw new Error();
        } catch {
          // revert — the delete didn't actually happen server-side
          setBookmarkedIds((prev) => new Set(prev).add(key));
        }
      }
      return;
    }
    setBookmarkedIds((prev) => new Set(prev).add(key));
    try {
      const res = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "past_question",
          refId: key,
          label: (question.question_text ?? "Past question").slice(0, 80),
        }),
      });
      if (!res.ok) throw new Error();
      const row = await res.json();
      if (row?.id) setBookmarkRowIds((prev) => ({ ...prev, [key]: row.id }));
    } catch {
      // revert on failure
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const explainWithAi = async (question: CourseQuestion) => {
    const key = String(question.id);
    if (aiExplainLoadingId) return;
    setAiExplainLoadingId(key);
    setAiExplainErrorId(null);
    setAiExplanations((prev) => ({ ...prev, [key]: "" }));
    try {
      const rawOptions = Array.isArray(question.options) ? question.options : [];
      const optionsText = rawOptions
        .map((opt, idx) => (opt ? `${labels[idx]}. ${opt}` : null))
        .filter(Boolean)
        .join("\n");
      const answerIndex = Number.isFinite(Number(question.answer)) ? Number(question.answer) : null;
      const correctLabel = answerIndex != null ? labels[answerIndex] ?? "Unknown" : "Unknown";
      const userContent = [
        `Question: ${question.question_text ?? ""}`,
        `Options:\n${optionsText}`,
        `Correct option: ${correctLabel}`,
        question.details ? `Static explanation already shown: ${question.details}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeTag: "gloss",
          system: explainQuestionSystemPrompt(startLanguage),
          numPredictOverride: 220,
          messages: [{ role: "user", content: userContent }],
        }),
      });
      if (!res.ok || !res.body) throw new Error("Local model call failed.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assembled = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          assembled += chunk;
          setAiExplanations((prev) => ({ ...prev, [key]: assembled }));
        }
      }
      if (!assembled.trim()) throw new Error("Local model unavailable — is Ollama running?");
    } catch (err) {
      setAiExplainErrorId(key);
      setAiExplanations((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : "Could not get an AI explanation.",
      }));
    } finally {
      setAiExplainLoadingId(null);
    }
  };

  return (
    <div className="mt-8 grid gap-8">
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/10 shadow-xl backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Focus Year</p>
            <p className="mt-1 text-base font-semibold text-white">Pick a year to spotlight</p>
          </div>
          <div className="text-xs uppercase tracking-[0.2em] text-white/50">
            {year ? `Showing ${year}` : "Showing all years"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-white/10 px-6 py-3">
          <button
            type="button"
            onClick={() => setYear("")}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              year === ""
                ? "bg-white text-slate-900"
                : "border border-white/20 text-white/70 hover:border-white/40 hover:text-white"
            }`}
          >
            All years
          </button>
          {yearOptions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setYear(String(item))}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                year === String(item)
                  ? "bg-white text-slate-900"
                  : "border border-white/20 text-white/70 hover:border-white/40 hover:text-white"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="grid gap-4 border-t border-white/10 px-6 py-5 text-sm text-white/70 sm:grid-cols-[1.2fr_auto] sm:items-center">
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Showing {filteredCount} of {totalCount} questions
              </span>
              <span>Completed {completedFiltered} of {filteredCount}</span>
            </div>
          </div>
          <div className="flex items-center justify-start gap-4 sm:justify-end">
            <div
              className="relative grid h-20 w-20 place-items-center rounded-full"
              style={{
                background: `conic-gradient(#38bdf8 0deg, #3b82f6 ${
                  completionRatio * 360
                }deg, rgba(255,255,255,0.12) ${completionRatio * 360}deg 360deg)`,
              }}
            >
              <div className="grid h-14 w-14 place-items-center rounded-full bg-slate-950/80 text-xs font-semibold text-white">
                {Math.round(completionRatio * 100)}%
              </div>
            </div>
            <div className="text-xs uppercase tracking-[0.2em] text-white/50">Orbit progress</div>
          </div>
        </div>
      </div>

      {yearKeys.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/10 p-6 text-sm text-white/70">
          No questions for this filter.
        </div>
      ) : (
        yearKeys.map((key) => (
          <section
            key={key}
            className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-xl backdrop-blur"
          >
            <h2 className="text-xl font-semibold text-white">{key}</h2>
            <div className="mt-4 grid gap-6">
              {grouped[key].map((question, index) => {
                const rawOptions = Array.isArray(question.options) ? question.options : [];
                const answerIndex = Number.isFinite(Number(question.answer))
                  ? Number(question.answer)
                  : null;
                return (
                  <div
                    key={question.id}
                    className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-4"
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setMenu({ x: event.clientX, y: event.clientY, question });
                    }}
                  >
                    <p className="text-sm text-white/70">Question {index + 1}</p>
                    <MathText
                      as="p"
                      className="mt-2 max-w-full break-words text-base text-white"
                      text={question.question_text ?? ""}
                    />
                    <ul className="mt-4 grid gap-2 text-sm text-white/80">
                      {rawOptions.map((option, idx) => (
                        <li key={`${question.id}-${labels[idx]}`}>
                          <span className="text-white/80">{labels[idx]}.</span>{" "}
                          <MathText as="span" className="max-w-full break-words" text={option ?? ""} />
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleCompleted(question.id)}
                        className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                          completedIds.has(String(question.id))
                            ? "bg-emerald-400/90 text-slate-900"
                            : "border border-white/20 text-white/70 hover:border-white/40 hover:text-white"
                        }`}
                      >
                        {completedIds.has(String(question.id)) ? "Marked as read" : "Mark as read"}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleBookmark(question)}
                        className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                          bookmarkedIds.has(String(question.id))
                            ? "bg-amber-300/90 text-slate-900"
                            : "border border-white/20 text-white/70 hover:border-white/40 hover:text-white"
                        }`}
                      >
                        {bookmarkedIds.has(String(question.id)) ? "Bookmarked" : "Bookmark"}
                      </button>
                      <button
                        type="button"
                        onClick={() => explainWithAi(question)}
                        disabled={aiExplainLoadingId === String(question.id)}
                        data-testid={`pq-${question.id}-explain-ai-button`}
                        className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold text-white/70 transition hover:border-white/40 hover:text-white disabled:opacity-60"
                      >
                        {aiExplainLoadingId === String(question.id) ? "Explaining…" : "Explain with AI"}
                      </button>
                      <span className="text-xs uppercase tracking-[0.2em] text-white/40">
                        {completedIds.has(String(question.id)) ? "Completed" : "Pending"}
                      </span>
                    </div>
                    <details className="mt-4 text-sm text-white/70">
                      <summary className="cursor-pointer text-white/80">Show answer</summary>
                      <div className="mt-2">
                        <p>
                          Correct option:{" "}
                          {answerIndex != null ? labels[answerIndex] ?? "Unknown" : "Unknown"}
                        </p>
                        {question.details ? (
                          <MathText as="p" className="mt-2 max-w-full break-words" text={question.details} />
                        ) : null}
                      </div>
                    </details>
                    {(aiExplanations[String(question.id)] || aiExplainLoadingId === String(question.id)) && (
                      <div
                        data-testid={`pq-${question.id}-explanation-ai`}
                        className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-500/5 p-3 text-sm text-white/80"
                      >
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
                          AI explanation
                        </p>
                        {aiExplainLoadingId === String(question.id) && !aiExplanations[String(question.id)] ? (
                          <p className="flex items-center gap-2 text-xs text-white/50">
                            <LoadingSpinner size={14} label="Thinking" />
                            Asking the model…
                          </p>
                        ) : aiExplainErrorId === String(question.id) ? (
                          <p className="text-xs text-rose-300">{aiExplanations[String(question.id)]}</p>
                        ) : (
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {aiExplanations[String(question.id)]}
                          </ReactMarkdown>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      {menu ? (
        <div
          className="fixed z-[9999] min-w-[180px] rounded-xl border border-white/10 bg-slate-950/95 p-2 text-sm text-white shadow-2xl"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            onClick={() => {
              void toggleBookmark(menu.question);
              setMenu(null);
            }}
            className="w-full rounded-lg px-3 py-2 text-left hover:bg-white/10"
          >
            {bookmarkedIds.has(String(menu.question.id)) ? "Remove bookmark" : "Bookmark"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
