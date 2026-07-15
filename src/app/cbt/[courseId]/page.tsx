"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MathText from "@/components/MathText";

type PastQuestion = {
  id: string;
  title: string;
  questionText: string | null;
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  correctIndex: number | null;
};

export default function CbtStartPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = use(params);
  const router = useRouter();
  const [state, setState] = useState<"loading" | "empty" | "active" | "error">("loading");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PastQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);

  useEffect(() => {
    fetch("/api/cbt/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId }),
    })
      .then(async (r) => {
        if (r.status === 404) {
          setState("empty");
          return;
        }
        if (!r.ok) {
          setState("error");
          return;
        }
        const data = await r.json();
        setAttemptId(data.attemptId);
        setQuestions(data.questions);
        setState("active");
      })
      .catch(() => setState("error"));
  }, [courseId]);

  function choose(questionId: string, index: number) {
    if (result) return;
    setAnswers((prev) => ({ ...prev, [questionId]: index }));
  }

  async function submit() {
    if (!attemptId) return;
    const res = await fetch(`/api/cbt/${attemptId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    const updated = await res.json();
    setResult({ score: updated.score, total: updated.total });
    fetch("/api/streaks", { method: "POST" }).catch(() => {});
  }

  if (state === "loading") {
    return <p className="text-sm text-black/60 dark:text-white/60">Starting CBT…</p>;
  }

  if (state === "empty") {
    return (
      <div data-testid="cbt-empty" className="flex flex-col gap-3">
        <p className="text-sm text-black/60 dark:text-white/60">
          No past questions available for this course yet.
        </p>
        <button
          type="button"
          onClick={() => router.back()}
          className="self-start text-sm underline"
        >
          Go back
        </button>
      </div>
    );
  }

  if (state === "error") {
    return <p className="text-sm text-red-600">Could not start CBT. Try again.</p>;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="cbt-active">
      <h1 className="text-xl font-semibold">CBT practice</h1>

      {result && (
        <div
          data-testid="cbt-result"
          className="rounded-xl border border-black/10 dark:border-white/10 p-4 font-medium"
        >
          Score: {result.score} / {result.total}
        </div>
      )}

      <ol className="flex flex-col gap-4">
        {questions.map((q, i) => (
          <li key={q.id} className="border border-black/10 dark:border-white/10 rounded-lg p-3">
            <MathText as="p" className="mb-2 font-medium" text={`${i + 1}. ${q.questionText ?? q.title}`} />
            <div className="flex flex-col gap-1">
              {[q.optionA, q.optionB, q.optionC, q.optionD].map((opt, idx) =>
                opt ? (
                  <button
                    key={idx}
                    type="button"
                    disabled={!!result}
                    data-testid={`cbt-q${i}-opt${idx}`}
                    onClick={() => choose(q.id, idx)}
                    className={
                      "text-left border rounded px-2 py-1 text-sm " +
                      (result
                        ? idx === q.correctIndex
                          ? "border-green-500 bg-green-50 dark:bg-green-900/30"
                          : answers[q.id] === idx
                            ? "border-red-500 bg-red-50 dark:bg-red-900/30"
                            : "border-black/10 dark:border-white/10"
                        : answers[q.id] === idx
                          ? "border-black/60 dark:border-white/60"
                          : "border-black/10 dark:border-white/10 hover:border-black/30 dark:hover:border-white/30")
                    }
                  >
                    {String.fromCharCode(65 + idx)}. <MathText text={opt} />
                  </button>
                ) : null,
              )}
            </div>
          </li>
        ))}
      </ol>

      {!result && (
        <button
          type="button"
          onClick={submit}
          data-testid="cbt-submit"
          className="self-start rounded-full bg-black text-white dark:bg-white dark:text-black px-5 py-2 text-sm font-medium"
        >
          Submit
        </button>
      )}
    </div>
  );
}
