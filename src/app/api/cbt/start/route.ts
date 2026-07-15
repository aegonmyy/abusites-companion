import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MAX_QUESTIONS = 20;

export async function POST(request: Request) {
  const body = (await request.json()) as { courseId?: string };
  const courseId = body.courseId;

  if (!courseId) {
    return NextResponse.json({ error: "courseId is required." }, { status: 400 });
  }

  const questions = await prisma.pastQuestion.findMany({
    where: { courseId },
    take: MAX_QUESTIONS,
  });

  if (questions.length === 0) {
    return NextResponse.json(
      {
        error:
          "No past questions available for this course yet. The catalog's past_questions table is currently empty on this machine.",
      },
      { status: 404 },
    );
  }

  const attempt = await prisma.cbtAttempt.create({
    data: {
      courseId,
      questionIds: JSON.stringify(questions.map((q) => q.id)),
    },
  });

  return NextResponse.json({ attemptId: attempt.id, questions });
}
