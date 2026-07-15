import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }
  return NextResponse.json({
    ...note,
    keyConcepts: note.keyConcepts ? JSON.parse(note.keyConcepts) : [],
    quiz: note.quizJson ? JSON.parse(note.quizJson) : [],
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.note.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
