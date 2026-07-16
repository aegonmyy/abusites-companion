import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = await prisma.note.findUnique({
    where: { id },
    include: { segmentExplanations: true },
  });
  if (!note) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }
  return NextResponse.json({
    ...note,
    keyConcepts: note.keyConcepts ? JSON.parse(note.keyConcepts) : [],
    quiz: note.quizJson ? JSON.parse(note.quizJson) : [],
    segments: note.segmentsJson ? JSON.parse(note.segmentsJson) : null,
    // Keyed by segment_id so the client can hydrate cached explanations in
    // O(1) per segment instead of scanning the array on every open.
    segmentExplanations: Object.fromEntries(
      note.segmentExplanations.map((e) => [e.segmentId, e.explanation]),
    ),
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.note.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
