"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CourseList, { type CourseSummary } from "./CourseList";
import LoadingSpinner from "@/components/LoadingSpinner";

// Ported from Grinnish's app/past-questions/page.tsx. Server + Supabase data
// load becomes a client fetch of the local /api/past-questions/courses. Auth
// header links dropped (no auth) — replaced with a "Back to dashboard" link in
// Grinnish's nav-button vocabulary.
export default function PastQuestionsPage() {
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);

  useEffect(() => {
    fetch("/api/past-questions/courses")
      .then((r) => r.json())
      .then(setCourses);
  }, []);

  return (
    <div className="min-h-screen px-6 py-12" data-testid="past-questions-page">
      <div className="mx-auto w-full max-w-4xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white">Past Questions</h1>
            <p className="mt-2 text-sm text-white/70">
              Choose a course to review past questions.
            </p>
          </div>
          <Link
            href="/"
            className="nav-button rounded-full px-4 py-2 text-sm font-semibold"
          >
            Back to dashboard
          </Link>
        </header>

        {!courses ? (
          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-6 text-sm text-white/70">
            <LoadingSpinner size={18} label="Loading" />
            Loading courses…
          </div>
        ) : courses.length === 0 ? (
          <div
            data-testid="courses-empty"
            className="mt-8 rounded-2xl border border-white/10 bg-white/10 p-6 text-sm text-white/70"
          >
            No past questions available yet.
          </div>
        ) : (
          <CourseList courses={courses} />
        )}
      </div>
    </div>
  );
}
