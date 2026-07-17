import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Lists seeded courses that actually have past questions, with their
 * counts. Courses with zero past questions (real: many exam/test variants
 * in the seeded catalog have none — see prisma/seed-bundle/catalog.json)
 * are filtered out server-side rather than shown as a dead end the student
 * has to click into to discover is empty.
 */
export async function GET() {
  const courses = await prisma.course.findMany({
    orderBy: { code: "asc" },
    include: { _count: { select: { pastQuestions: true } } },
  });

  return NextResponse.json(
    courses
      .filter((c) => c._count.pastQuestions > 0)
      .map((c) => ({
        id: c.id,
        code: c.code,
        title: c.title,
        pastQuestionCount: c._count.pastQuestions,
      })),
  );
}
