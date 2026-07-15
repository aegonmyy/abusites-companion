import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const syllabus = await prisma.studySyllabus.findUnique({
    where: { id },
    include: { progress: true },
  });

  if (!syllabus) {
    return NextResponse.json({ error: "Syllabus not found." }, { status: 404 });
  }

  return NextResponse.json({
    ...syllabus,
    units: JSON.parse(syllabus.unitsJson),
  });
}
