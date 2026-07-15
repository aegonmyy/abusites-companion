import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await params;
  const attempt = await prisma.cbtAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }

  const questionIds: string[] = JSON.parse(attempt.questionIds);
  const questions = await prisma.pastQuestion.findMany({
    where: { id: { in: questionIds } },
  });
  // Preserve original ordering (findMany with `in` doesn't guarantee it).
  const byId = new Map(questions.map((q) => [q.id, q]));
  const ordered = questionIds.map((id) => byId.get(id)).filter(Boolean);

  return NextResponse.json({ ...attempt, questions: ordered });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await params;
  const body = (await request.json()) as { answers?: Record<string, number> };

  const attempt = await prisma.cbtAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }
  if (attempt.finishedAt) {
    return NextResponse.json({ error: "Attempt already submitted." }, { status: 409 });
  }

  const answers = body.answers ?? {};
  const questionIds: string[] = JSON.parse(attempt.questionIds);
  const questions = await prisma.pastQuestion.findMany({
    where: { id: { in: questionIds } },
  });

  let score = 0;
  for (const q of questions) {
    if (q.correctIndex !== null && answers[q.id] === q.correctIndex) score += 1;
  }

  const updated = await prisma.cbtAttempt.update({
    where: { id: attemptId },
    data: {
      answers: JSON.stringify(answers),
      score,
      total: questions.length,
      finishedAt: new Date(),
    },
  });

  return NextResponse.json(updated);
}
