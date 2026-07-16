"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import CbtClient from "./CbtClient";

// Ported from Grinnish's app/cbt/[courseId]/page.tsx (header + layout). The
// server/Supabase question load becomes a client fetch of the local
// /api/past-questions/courses/{id}, adapted to CbtClient's question shape.
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

type CbtQuestion = {
  id: string;
  year: number | null;
  question_text: string | null;
  options: string[];
  answer: number | null;
  details: string | null;
};

export default function CbtPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = use(params);
  const [course, setCourse] = useState<{ id: string; code: string; title: string } | null>(null);
  const [questions, setQuestions] = useState<CbtQuestion[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/past-questions/courses/${courseId}`)
      .then(async (r) => {
        if (!r.ok) {
          setNotFound(true);
          return;
        }
        const detail = (await r.json()) as LocalCourseDetail;
        setCourse({ id: detail.id, code: detail.code, title: detail.title });
        setQuestions(
          detail.pastQuestions.map((q) => ({
            id: q.id,
            year: q.year,
            question_text: q.questionText ?? q.title,
            options: [q.optionA, q.optionB, q.optionC, q.optionD].filter(
              (o): o is string => o != null && o !== "",
            ),
            answer: q.correctIndex,
            details: q.explanation,
          })),
        );
      })
      .catch(() => setNotFound(true));
  }, [courseId]);

  return (
    <div className="min-h-screen px-6 py-12" data-testid="cbt-page">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-white/60">{course?.code ?? ""}</p>
            <h1 className="text-3xl font-semibold text-white">CBT Session</h1>
            <p className="mt-2 text-sm text-white/70">
              Build a timed test from available past questions.
            </p>
          </div>
          <Link
            href="/past-questions"
            className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/80"
          >
            Back to questions
          </Link>
        </header>

        {notFound ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/10 p-6 text-sm text-white/70">
            Course not found.
          </div>
        ) : !course || !questions ? (
          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-6 text-sm text-white/70">
            <LoadingSpinner size={18} label="Loading" />
            Loading…
          </div>
        ) : (
          <CbtClient course={course} questions={questions} />
        )}
      </div>
    </div>
  );
}
