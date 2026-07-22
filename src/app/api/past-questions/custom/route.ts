import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type IncomingQuestion = {
  question_text: string;
  options: string[];
  correct_index: number;
  explanation?: string;
};

type CustomCourseBody = {
  courseCode?: string;
  courseTitle?: string;
  year?: number;
  questions?: IncomingQuestion[];
};

/**
 * Final stage of the student PDF-to-CBT pipeline: persist a fully-extracted,
 * fully-answered custom paper as a Course (isCustom = true) plus its
 * PastQuestion rows, so it shows up in Past Questions and plays in the
 * existing CBT flow with zero CBT changes.
 *
 * IDs are generated here (Course/PastQuestion have no default id — the
 * seeded catalog assigns explicit ones) with a "custom-" prefix so they
 * can never collide with a seeded numeric id. Options beyond the first five
 * are dropped: the schema is A-E, and real MCQs don't exceed that.
 */
export async function POST(request: Request) {
  let body: CustomCourseBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const code = (body.courseCode ?? "").trim();
  const title = (body.courseTitle ?? "").trim() || code;
  if (!code) {
    return NextResponse.json({ error: "A course code or name is required." }, { status: 400 });
  }
  if (!Array.isArray(body.questions) || body.questions.length === 0) {
    return NextResponse.json({ error: "No questions to save." }, { status: 400 });
  }

  const year = typeof body.year === "number" && Number.isFinite(body.year) ? Math.round(body.year) : null;

  const courseId = `custom-${randomUUID()}`;
  const now = new Date();

  const questionRows = body.questions
    .map((q) => {
      const text = String(q?.question_text ?? "").trim();
      const options = Array.isArray(q?.options)
        ? q.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 5)
        : [];
      if (!text || options.length < 2) return null;
      // Clamp correct_index into range defensively — the answer stage should
      // already return a valid index, but never insert an out-of-range one.
      let correctIndex =
        typeof q?.correct_index === "number" && Number.isFinite(q.correct_index)
          ? Math.round(q.correct_index)
          : 0;
      if (correctIndex < 0 || correctIndex >= options.length) correctIndex = 0;
      return {
        id: `custom-q-${randomUUID()}`,
        courseId,
        title: `${code}${year ? ` ${year}` : ""}`,
        year,
        questionText: text,
        optionA: options[0] ?? null,
        optionB: options[1] ?? null,
        optionC: options[2] ?? null,
        optionD: options[3] ?? null,
        optionE: options[4] ?? null,
        correctIndex,
        explanation: String(q?.explanation ?? "").trim() || null,
        createdAt: now,
        updatedAt: now,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (questionRows.length === 0) {
    return NextResponse.json({ error: "None of the questions were usable." }, { status: 400 });
  }

  try {
    await prisma.$transaction([
      prisma.course.create({
        data: {
          id: courseId,
          code,
          title,
          isCustom: true,
          createdAt: now,
          updatedAt: now,
        },
      }),
      prisma.pastQuestion.createMany({ data: questionRows }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Could not save the course: ${message}` }, { status: 500 });
  }

  return NextResponse.json({ courseId, questionCount: questionRows.length });
}
