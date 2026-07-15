import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function POST(request: Request) {
  const body = (await request.json()) as { chosenIndex?: number };
  const date = todayStr();

  const record = await prisma.questionOfDay.findUnique({ where: { date } });
  if (!record || !record.pastQuestionId) {
    return NextResponse.json({ error: "No question of the day to answer." }, { status: 404 });
  }
  if (record.answeredAt) {
    return NextResponse.json({ error: "Already answered today." }, { status: 409 });
  }

  const question = await prisma.pastQuestion.findUnique({
    where: { id: record.pastQuestionId },
  });
  if (!question) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }

  const chosenIndex = body.chosenIndex;
  const correct =
    typeof chosenIndex === "number" && question.correctIndex !== null
      ? chosenIndex === question.correctIndex
      : null;

  const updated = await prisma.questionOfDay.update({
    where: { date },
    data: {
      answeredIndex: chosenIndex ?? null,
      correct,
      answeredAt: new Date(),
    },
  });

  return NextResponse.json(updated);
}
