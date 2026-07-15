import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Lists seeded courses with their past_question counts, so the browser can
 * show which courses actually have content (currently: none — the live
 * Supabase project's past_questions table returned zero rows to the anon
 * key; see the Phase 1 seed report).
 */
export async function GET() {
  const courses = await prisma.course.findMany({
    orderBy: { code: "asc" },
    include: { _count: { select: { pastQuestions: true } } },
  });

  return NextResponse.json(
    courses.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      pastQuestionCount: c._count.pastQuestions,
    })),
  );
}
