import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    syllabusId?: string;
    subunitId?: string;
    completed?: boolean;
  };

  if (!body.syllabusId || !body.subunitId) {
    return NextResponse.json({ error: "syllabusId and subunitId are required." }, { status: 400 });
  }

  const progress = await prisma.subunitProgress.upsert({
    where: {
      syllabusId_subunitId: {
        syllabusId: body.syllabusId,
        subunitId: body.subunitId,
      },
    },
    update: {
      completed: body.completed ?? true,
      lastVisited: new Date(),
    },
    create: {
      syllabusId: body.syllabusId,
      subunitId: body.subunitId,
      completed: body.completed ?? true,
      lastVisited: new Date(),
    },
  });

  return NextResponse.json(progress);
}
