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

/**
 * Deletes a saved syllabus. SubunitProgress rows cascade-delete
 * automatically (see schema.prisma's onDelete: Cascade on that relation) —
 * no manual cleanup needed. Checks existence first rather than swallowing
 * the not-found case silently, so a genuine failure isn't reported as a
 * success (see /api/bookmarks/[id] for the pattern this deliberately avoids).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const syllabus = await prisma.studySyllabus.findUnique({ where: { id } });
  if (!syllabus) {
    return NextResponse.json({ error: "Syllabus not found." }, { status: 404 });
  }

  await prisma.studySyllabus.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
