"use client";

// Ported from Grinnish's app/past-questions/CourseList.tsx. Markup/classes are
// verbatim (search, target-course select, Start CBT / View past questions, the
// course cards, and the full-screen questions modal with its shimmer skeleton).
// openCourse now fetches the local /api/past-questions/courses/{id} and adapts
// that response into the CoursePayload shape Grinnish's QuestionsList expects.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import QuestionsList, { type CourseQuestion } from "./QuestionsList";

export type CourseSummary = {
  id: string;
  code: string;
  title: string;
};

export type CoursePayload = {
  course: CourseSummary;
  questions: CourseQuestion[];
  totalCount: number;
};

type Props = {
  courses: CourseSummary[];
};

type LocalCourseDetail = {
  id: string;
  code: string;
  title: string;
  pastQuestions: {
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
  }[];
};

function adaptCourse(detail: LocalCourseDetail): CoursePayload {
  const questions: CourseQuestion[] = detail.pastQuestions.map((q) => ({
    id: q.id,
    year: q.year,
    question_text: q.questionText ?? q.title,
    options: [q.optionA, q.optionB, q.optionC, q.optionD].filter(
      (o): o is string => o != null && o !== "",
    ),
    answer: q.correctIndex,
    details: q.explanation,
  }));
  return {
    course: { id: detail.id, code: detail.code, title: detail.title },
    questions,
    totalCount: questions.length,
  };
}

function LoadingState({ course }: { course: CourseSummary | null }) {
  return (
    <div className="grid gap-6">
      <div className="overflow-hidden rounded-3xl border border-cyan-300/20 bg-white/10 shadow-[0_0_60px_rgba(34,211,238,0.12)] backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-sm text-cyan-100/70">
              {course?.code ?? "Preparing course"}
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-white">
              {course?.title ?? "Fetching past questions"}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full border-2 border-cyan-200/20 border-t-cyan-200 animate-spin" />
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-100/60">
                Loading
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-4 px-6 py-6">
          <div className="h-24 rounded-2xl bg-[linear-gradient(110deg,rgba(255,255,255,0.06),rgba(103,232,249,0.16),rgba(255,255,255,0.06))] bg-[length:200%_100%]" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-40 rounded-2xl bg-[linear-gradient(110deg,rgba(255,255,255,0.06),rgba(103,232,249,0.16),rgba(255,255,255,0.06))] bg-[length:200%_100%]" />
            <div className="h-40 rounded-2xl bg-[linear-gradient(110deg,rgba(255,255,255,0.06),rgba(103,232,249,0.16),rgba(255,255,255,0.06))] bg-[length:200%_100%]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CourseList({ courses }: Props) {
  const [query, setQuery] = useState("");
  const [targetCourseId, setTargetCourseId] = useState(courses[0]?.id ?? "");
  const [selectedCourse, setSelectedCourse] = useState<CourseSummary | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingCourse, setLoadingCourse] = useState(false);
  const [courseData, setCourseData] = useState<CoursePayload | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return courses;
    const q = query.trim().toLowerCase();
    return courses.filter(
      (course) =>
        course.code.toLowerCase().includes(q) ||
        course.title.toLowerCase().includes(q),
    );
  }, [courses, query]);

  useEffect(() => {
    if (filtered.length === 0) return;
    const stillVisible = filtered.some((course) => course.id === targetCourseId);
    if (!stillVisible) {
      setTargetCourseId(filtered[0].id);
    }
  }, [filtered, targetCourseId]);

  useEffect(() => {
    if (!modalOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [modalOpen]);

  const targetCourse =
    courses.find((course) => course.id === targetCourseId) ?? filtered[0] ?? null;

  const openCourse = async (course: CourseSummary) => {
    setSelectedCourse(course);
    setCourseData(null);
    setFetchError(null);
    setLoadingCourse(true);
    setModalOpen(true);

    try {
      const response = await fetch(
        `/api/past-questions/courses/${encodeURIComponent(course.id)}`,
        { method: "GET", cache: "no-store" },
      );
      if (!response.ok) throw new Error("Failed to load course questions.");
      const detail = (await response.json()) as LocalCourseDetail;
      setCourseData(adaptCourse(detail));
    } catch (error) {
      setFetchError(
        error instanceof Error ? error.message : "Failed to load course questions.",
      );
    } finally {
      setLoadingCourse(false);
    }
  };

  return (
    <>
      <div className="mt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-white/70">Search by course code or title.</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search courses"
              className="w-full rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/60 focus:outline-none sm:max-w-xs"
            />
          </div>
        </div>

        <div className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/10 p-5 shadow-xl backdrop-blur sm:grid-cols-[1.2fr_auto] sm:items-center">
          <div className="grid gap-2">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">
              Target course
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={targetCourseId}
                onChange={(event) => setTargetCourseId(event.target.value)}
                className="select-pill sm:max-w-sm"
              >
                {filtered.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} - {course.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={targetCourse ? `/cbt/${targetCourse.id}` : "/past-questions"}
              className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900"
            >
              Start CBT
            </Link>
            <button
              type="button"
              onClick={() => {
                if (targetCourse) void openCourse(targetCourse);
              }}
              disabled={!targetCourse}
              className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white/80 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              View past questions
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2" data-testid="courses-list">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/10 p-6 text-sm text-white/70">
              No courses match your search.
            </div>
          ) : (
            filtered.map((course) => (
              <button
                key={course.id}
                type="button"
                onClick={() => void openCourse(course)}
                className="group rounded-2xl border border-white/10 bg-white/10 p-6 text-left shadow-xl backdrop-blur transition hover:border-cyan-200/40 hover:bg-white/15"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm text-white/60">{course.code}</div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {course.title}
                    </div>
                  </div>
                  <div className="rounded-full border border-cyan-200/20 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-100/70 transition group-hover:border-cyan-200/40 group-hover:text-cyan-50">
                    Open
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-[9999]">
          <div
            className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
            aria-hidden="true"
          />
          <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center px-3 py-6 sm:px-6">
            <div className="relative w-full overflow-hidden rounded-[32px] border border-white/10 bg-[#08111d] shadow-[0_24px_120px_rgba(8,145,178,0.22)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_35%)]" />
              <div className="relative max-h-[90vh] overflow-y-auto px-5 py-5 sm:px-8 sm:py-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-cyan-100/70">
                      {courseData?.course.code ?? selectedCourse?.code ?? "Past Questions"}
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
                      {courseData?.course.title ?? selectedCourse?.title ?? "Loading course"}
                    </h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={
                        courseData?.course.id
                          ? `/cbt/${courseData.course.id}`
                          : selectedCourse
                            ? `/cbt/${selectedCourse.id}`
                            : "/past-questions"
                      }
                      className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900"
                    >
                      Start CBT
                    </Link>
                    <button
                      type="button"
                      onClick={() => setModalOpen(false)}
                      className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white/80 transition hover:border-white/40 hover:text-white"
                    >
                      Close
                    </button>
                  </div>
                </div>

                {loadingCourse ? <LoadingState course={selectedCourse} /> : null}

                {!loadingCourse && fetchError ? (
                  <div className="mt-8 rounded-2xl border border-rose-300/20 bg-rose-300/10 p-6 text-sm text-rose-100">
                    <p>{fetchError}</p>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedCourse) void openCourse(selectedCourse);
                      }}
                      className="mt-4 rounded-full border border-rose-100/30 px-4 py-2 font-semibold text-white"
                    >
                      Retry
                    </button>
                  </div>
                ) : null}

                {!loadingCourse && !fetchError && courseData && courseData.questions.length === 0 ? (
                  <div className="mt-8 rounded-2xl border border-white/10 bg-white/10 p-6 text-sm text-white/70">
                    No questions uploaded yet.
                  </div>
                ) : null}

                {!loadingCourse && !fetchError && courseData ? (
                  <QuestionsList
                    questions={courseData.questions}
                    totalCount={courseData.totalCount}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
