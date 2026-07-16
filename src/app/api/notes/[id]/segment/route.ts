import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Persists a segment's deep explanation once the client has finished
 * streaming it from /api/llm (routeTag "lesson",
 * notesSegmentExplanationSystemPrompt). Mirrors
 * /api/study/subunit/progress's upsert-by-composite-key shape exactly —
 * generate once, cache thereafter, so reopening a segment never
 * regenerates it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as { segmentId?: string; explanation?: string };

  if (!body.segmentId || !body.explanation) {
    return NextResponse.json({ error: "segmentId and explanation are required." }, { status: 400 });
  }

  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }

  const row = await prisma.noteSegmentExplanation.upsert({
    where: { noteId_segmentId: { noteId: id, segmentId: body.segmentId } },
    update: { explanation: body.explanation },
    create: { noteId: id, segmentId: body.segmentId, explanation: body.explanation },
  });

  return NextResponse.json(row);
}
