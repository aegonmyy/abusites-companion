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
    return <p className="text-sm muted">Starting CBT…</p>;
  }

  if (state === "empty") {
    return (
      <div data-testid="cbt-empty" className="flex flex-col gap-3">
        <p className="text-sm muted">
          No past questions available for this course yet.
        </p>
        <button
          type="button"
          onClick={() => router.back()}
          className="btn btn-secondary self-start"
        >
          Go back
        </button>
      </div>
    );
  }

  if (state === "error") {
    return <p className="text-sm" style={{ color: "var(--bad)" }}>Could not start CBT. Try again.</p>;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="cbt-active">
      <h1 className="text-xl font-semibold">CBT practice</h1>

      {result && (
        <div
          data-testid="cbt-result"
          className="card p-5 font-semibold"
          style={{ color: "var(--primary)" }}
        >
          Score: {result.score} / {result.total}
        </div>
      )}

      <ol className="flex flex-col gap-4">
        {questions.map((q, i) => (
          <li key={q.id} className="card p-4">
            <MathText as="p" className="mb-2.5 font-medium" text={`${i + 1}. ${q.questionText ?? q.title}`} />
            <div className="flex flex-col gap-1.5">
              {[q.optionA, q.optionB, q.optionC, q.optionD].map((opt, idx) =>
                opt ? (
                  <button
                    key={idx}
                    type="button"
                    disabled={!!result}
                    data-testid={`cbt-q${i}-opt${idx}`}
                    onClick={() => choose(q.id, idx)}
                    className={
                      "option " +
                      (result
                        ? idx === q.correctIndex
                          ? "option-correct"
                          : answers[q.id] === idx
                            ? "option-wrong"
                            : ""
                        : answers[q.id] === idx
                          ? "option-selected"
                          : "")
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
          className="btn btn-primary self-start"
        >
          Submit
        </button>
      )}
    </div>
  );
}
