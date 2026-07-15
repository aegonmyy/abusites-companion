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
        <p className="text-sm text-black/60 dark:text-white/60 mt-1">
          Browse seeded courses. Courses with a question count of 0 don&apos;t
          have past-question content on this machine yet.
        </p>
      </div>

      {!courses && <p className="text-sm text-black/60 dark:text-white/60">Loading courses…</p>}

      {courses && courses.length === 0 && (
        <p data-testid="courses-empty" className="text-sm text-black/60 dark:text-white/60">
          No courses seeded yet. Run <code className="font-mono">npm run seed</code>.
        </p>
      )}

      <ul className="flex flex-col gap-2" data-testid="courses-list">
        {courses?.map((c) => (
          <li key={c.id}>
            <Link
              href={`/past-questions/${c.id}`}
              className="flex items-center justify-between border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 hover:border-black/30 dark:hover:border-white/30"
            >
              <span>
                <span className="font-mono text-sm">{c.code}</span>{" "}
                <span className="text-sm text-black/70 dark:text-white/70">{c.title}</span>
              </span>
              <span className="text-xs text-black/50 dark:text-white/50">
                {c.pastQuestionCount} question{c.pastQuestionCount === 1 ? "" : "s"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
