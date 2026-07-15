import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Returns today's question of the day, picking (and pinning) a random
 * past_question the first time it's requested each day. Single implicit
 * local user, no auth — one QOTD row per calendar day.
 *
 * Gracefully returns { date, question: null } when the seeded catalog has
 * no past_questions available — see the Phase 1 seeding report: the live
 * Supabase project's past_questions table returned zero rows to the anon
 * key, so this is the expected state until that's resolved.
 */
export async function GET() {
  const date = todayStr();

  let record = await prisma.questionOfDay.findUnique({ where: { date } });

  if (!record) {
    const total = await prisma.pastQuestion.count();
    if (total === 0) {
      return NextResponse.json({ date, question: null });
    }
    const skip = Math.floor(Math.random() * total);
    const picked = await prisma.pastQuestion.findFirst({ skip, take: 1 });
    record = await prisma.questionOfDay.create({
      data: { date, pastQuestionId: picked?.id ?? null },
    });
  }

  if (!record.pastQuestionId) {
    return NextResponse.json({ date, question: null });
  }

  const question = await prisma.pastQuestion.findUnique({
    where: { id: record.pastQuestionId },
  });

  return NextResponse.json({
    date,
    question,
    answeredIndex: record.answeredIndex,
    correct: record.correct,
  });
}
