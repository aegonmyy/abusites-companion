"use client";

import { useEffect, useState } from "react";
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
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 text-sm text-black/60 dark:text-white/60">
        Loading question of the day…
      </div>
    );
  }

  if (!data.question) {
    return (
      <div
        data-testid="qotd-empty"
        className="rounded-xl border border-black/10 dark:border-white/10 p-4 text-sm text-black/60 dark:text-white/60"
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
    <div data-testid="qotd-card" className="rounded-xl border border-black/10 dark:border-white/10 p-4 flex flex-col gap-3">
      <div className="text-xs uppercase tracking-wide text-black/50 dark:text-white/50">
        Question of the day
      </div>
      <MathText as="p" className="font-medium" text={q.questionText ?? q.title} />
      <div className="flex flex-col gap-2">
        {options.map((opt, i) =>
          opt ? (
            <button
              key={i}
              type="button"
              disabled={answered || submitting}
              onClick={() => answer(i)}
              data-testid={`qotd-option-${i}`}
              className={
                "text-left border rounded-lg px-3 py-2 text-sm " +
                (answered && i === q.correctIndex
                  ? "border-green-500 bg-green-50 dark:bg-green-900/30"
                  : answered && i === chosen && i !== q.correctIndex
                    ? "border-red-500 bg-red-50 dark:bg-red-900/30"
                    : "border-black/10 dark:border-white/10 hover:border-black/30 dark:hover:border-white/30")
              }
            >
              <span className="font-mono mr-2">{OPTION_LABELS[i]}.</span>
              <MathText text={opt} />
            </button>
          ) : null,
        )}
      </div>
      {answered && q.explanation && (
        <div data-testid="qotd-explanation" className="text-sm text-black/70 dark:text-white/70 border-t border-black/10 dark:border-white/10 pt-2">
          <MathText text={q.explanation} />
        </div>
      )}
    </div>
  );
}
