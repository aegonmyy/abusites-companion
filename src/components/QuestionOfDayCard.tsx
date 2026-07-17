"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import LoadingSpinner from "./LoadingSpinner";
import MathText from "./MathText";
import { explainQuestionSystemPrompt, type Language } from "@/lib/prompts";

type Question = {
  id: string;
  title: string;
  questionText: string | null;
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  correctIndex: number | null;
  explanation: string | null;
};

type QotdResponse = {
  date: string;
  question: Question | null;
  answeredIndex?: number | null;
  correct?: boolean | null;
};

const OPTION_LABELS = ["A", "B", "C", "D"] as const;

// Markup ported verbatim from Grinnish's QuestionOfDayCard (tone="dark"): the
// glassmorphism card, uppercase eyebrow, "Daily quiz" pill, and the layered
// option-button states. Data layer is the local target's — self-fetches
// /api/qotd and answers via /api/qotd/answer (no auth, one implicit user).
export default function QuestionOfDayCard() {
  const [data, setData] = useState<QotdResponse | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [language, setLanguage] = useState<Language>("en");
  const [aiExplain, setAiExplain] = useState("");
  const [aiExplainLoading, setAiExplainLoading] = useState(false);
  const [aiExplainError, setAiExplainError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/qotd")
      .then((r) => r.json())
      .then(setData);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setLanguage((d.language as Language) ?? "en"))
      .catch(() => {});
  }, []);

  async function explainWithAi() {
    if (!data?.question || aiExplainLoading) return;
    const q = data.question;
    setAiExplainLoading(true);
    setAiExplainError(null);
    setAiExplain("");
    try {
      const options = [q.optionA, q.optionB, q.optionC, q.optionD]
        .map((opt, i) => (opt ? `${OPTION_LABELS[i]}. ${opt}` : null))
        .filter(Boolean)
        .join("\n");
      const correctLabel = q.correctIndex != null ? OPTION_LABELS[q.correctIndex] : "Unknown";
      const userContent = [
        `Question: ${q.questionText ?? q.title}`,
        `Options:\n${options}`,
        `Correct option: ${correctLabel}`,
        q.explanation ? `Static explanation already shown: ${q.explanation}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeTag: "gloss",
          system: explainQuestionSystemPrompt(language),
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
          setAiExplain(assembled);
        }
      }
      if (!assembled.trim()) throw new Error("Local model unavailable — is Ollama running?");
    } catch (err) {
      setAiExplainError(err instanceof Error ? err.message : "Could not get an AI explanation.");
    } finally {
      setAiExplainLoading(false);
    }
  }

  async function answer(index: number) {
    if (!data?.question || submitting || data.answeredIndex != null) return;
    setSubmitting(true);
    setChosen(index);
    try {
      const res = await fetch("/api/qotd/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chosenIndex: index }),
      });
      const updated = await res.json();
      setData((prev) => (prev ? { ...prev, answeredIndex: updated.answeredIndex, correct: updated.correct } : prev));
      fetch("/api/streaks", { method: "POST" }).catch(() => {});
    } finally {
      setSubmitting(false);
    }
  }

  if (!data) {
    return (
      <div className="card-deep card-deep-glow flex items-center gap-3 rounded-2xl p-6 text-sm text-white/70">
        <LoadingSpinner size={18} label="Loading" />
        Loading question of the day…
      </div>
    );
  }

  if (!data.question) {
    return (
      <div
        data-testid="qotd-empty"
        className="card-deep card-deep-glow rounded-2xl p-6 text-sm text-white/70"
      >
        No question of the day yet. This shows up automatically once your
        past questions are loaded.
      </div>
    );
  }

  const q = data.question;
  const options = [q.optionA, q.optionB, q.optionC, q.optionD];
  const answered = data.answeredIndex != null;

  return (
    <div
      data-testid="qotd-card"
      className="card-deep card-deep-glow rounded-2xl p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">
            Question of the day
          </p>
          <p className="text-white/70">{data.date}</p>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/70">
          Daily quiz
        </span>
      </div>

      <div className="mt-4 text-base font-semibold">
        <MathText as="p" className="text-white" text={q.questionText ?? q.title} />
      </div>

      <div className="mt-4 grid gap-2">
        {options.map((opt, i) =>
          opt ? (
            <button
              key={i}
              type="button"
              disabled={answered || submitting}
              onClick={() => answer(i)}
              data-testid={`qotd-option-${i}`}
              aria-pressed={chosen === i}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm text-white transition hover:border-white/30 ${
                answered && i === q.correctIndex
                  ? "border-emerald-300/60 bg-emerald-500/20"
                  : answered && i === chosen && i !== q.correctIndex
                    ? "border-rose-300/60 bg-rose-500/20"
                    : "border-white/10 bg-white/5"
              }`}
            >
              <span className="mt-[2px] text-xs font-semibold">{OPTION_LABELS[i]}.</span>
              <MathText as="span" className="text-white" text={opt} />
            </button>
          ) : null,
        )}
      </div>

      {answered && q.explanation && (
        <div
          data-testid="qotd-explanation"
          className="mt-4 border-t border-white/10 pt-3 text-sm text-white/60"
        >
          <MathText text={q.explanation} />
        </div>
      )}

      {answered && (
        <div className={`${q.explanation ? "mt-3" : "mt-4 border-t border-white/10 pt-3"} flex flex-col gap-2`}>
          {!aiExplain && !aiExplainLoading && (
            <button
              type="button"
              onClick={explainWithAi}
              data-testid="qotd-explain-ai-button"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:border-white/40"
            >
              Explain with AI
            </button>
          )}
          {aiExplainLoading && !aiExplain && (
            <p className="flex items-center gap-2 text-xs text-white/50">
              <LoadingSpinner size={14} label="Thinking" />
              Asking the model…
            </p>
          )}
          {aiExplainError && <p className="text-xs text-rose-300">{aiExplainError}</p>}
          {aiExplain && (
            <div data-testid="qotd-explanation-ai" className="rounded-xl border border-emerald-300/20 bg-emerald-500/5 p-3 text-sm text-white/80">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">AI explanation</p>
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                {aiExplain}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
