"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { use } from "react";
import MathText from "@/components/MathText";

type PastQuestion = {
  id: string;
  title: string;
  year: number | null;
  questionText: string | null;
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  correctIndex: number | null;
  explanation: string | null;
};

type CourseDetail = {
  id: string;
  code: string;
  title: string;
  pastQuestions: PastQuestion[];
};

export default function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = use(params);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/past-questions/courses/${courseId}`)
      .then(async (r) => {
        if (r.status === 404) {
          setNotFound(true);
          return;
        }
        setCourse(await r.json());
      });
  }, [courseId]);

  if (notFound) {
    return <p className="text-sm">Course not found.</p>;
  }
  if (!course) {
    return <p className="text-sm muted">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="course-detail-page">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">
            <span className="font-mono" style={{ color: "var(--primary)" }}>{course.code}</span> — {course.title}
          </h1>
          <p className="text-sm muted">
            {course.pastQuestions.length} past question(s)
          </p>
        </div>
        <Link
          href={`/cbt/${course.id}`}
          data-testid="start-cbt-link"
          className="btn btn-primary shrink-0"
        >
          Start CBT practice
        </Link>
      </div>

      {course.pastQuestions.length === 0 && (
        <p data-testid="questions-empty" className="text-sm muted">
          No past questions for this course yet.
        </p>
      )}

      <ol className="flex flex-col gap-4">
        {course.pastQuestions.map((q, i) => (
          <li key={q.id} className="card p-4">
            <div className="flex items-center justify-between text-xs faint mb-2">
              <span>
                {i + 1}. {q.year ?? "Year unknown"}
              </span>
              <button
                type="button"
                data-testid={`bookmark-question-${q.id}`}
                onClick={() =>
                  fetch("/api/bookmarks", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      kind: "past_question",
                      refId: q.id,
                      label: `${course.code} — ${q.title}`,
                    }),
                  })
                }
                className="font-medium"
                style={{ color: "var(--primary)" }}
              >
                Bookmark
              </button>
            </div>
            <MathText as="p" className="mb-2 font-medium" text={q.questionText ?? q.title} />
            <ul className="flex flex-col gap-1 text-sm">
              {[q.optionA, q.optionB, q.optionC, q.optionD].map((opt, idx) =>
                opt ? (
                  <li
                    key={idx}
                    className={idx === q.correctIndex ? "font-semibold" : ""}
                    style={idx === q.correctIndex ? { color: "var(--good)" } : undefined}
                  >
                    {String.fromCharCode(65 + idx)}. <MathText text={opt} />
                  </li>
                ) : null,
              )}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
