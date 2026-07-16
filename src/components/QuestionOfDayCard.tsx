"use client";

import { useEffect, useState } from "react";
import LoadingSpinner from "./LoadingSpinner";
import MathText from "./MathText";

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

  useEffect(() => {
    fetch("/api/qotd")
      .then((r) => r.json())
      .then(setData);
  }, []);

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
        No question of the day yet — the past-questions catalog is empty on
        this machine. Once past questions are seeded, one will appear here
        automatically.
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
    </div>
  );
}
