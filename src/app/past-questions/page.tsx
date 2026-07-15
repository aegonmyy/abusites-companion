"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type CourseSummary = {
  id: string;
  code: string;
  title: string;
  pastQuestionCount: number;
};

export default function PastQuestionsPage() {
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);

  useEffect(() => {
    fetch("/api/past-questions/courses")
      .then((r) => r.json())
      .then(setCourses);
  }, []);

  return (
    <div className="flex flex-col gap-4" data-testid="past-questions-page">
      <div>
        <h1 className="text-xl font-semibold">Past questions</h1>
        <p className="text-sm muted mt-1">
          Browse seeded courses. Courses with a question count of 0 don&apos;t
          have past-question content on this machine yet.
        </p>
      </div>

      {!courses && <p className="text-sm muted">Loading courses…</p>}

      {courses && courses.length === 0 && (
        <p data-testid="courses-empty" className="text-sm muted">
          No courses seeded yet. Run <code className="font-mono">npm run seed</code>.
        </p>
      )}

      <ul className="flex flex-col gap-3" data-testid="courses-list">
        {courses?.map((c) => (
          <li key={c.id}>
            <Link
              href={`/past-questions/${c.id}`}
              className="card-link flex items-center justify-between gap-3 px-4 py-3.5"
            >
              <span className="min-w-0">
                <span className="font-mono text-sm font-semibold" style={{ color: "var(--primary)" }}>{c.code}</span>{" "}
                <span className="text-sm">{c.title}</span>
              </span>
              <span className="chip-neutral shrink-0">
                {c.pastQuestionCount} question{c.pastQuestionCount === 1 ? "" : "s"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
