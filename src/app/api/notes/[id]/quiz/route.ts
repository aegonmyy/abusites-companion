import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Persists the quiz the client generated via the deferred "Generate quiz"
 * action (/api/llm, routeTag "json", notesQuizSystemPrompt). Quiz generation
 * moved from upload time to this explicit, later action — this route just
 * writes the result to the same quizJson column the old upload-time flow
 * used, so NoteDetailPage's existing quiz rendering/scoring is untouched.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as { quiz?: unknown[] };

  if (!Array.isArray(body.quiz) || body.quiz.length === 0) {
    return NextResponse.json({ error: "A non-empty quiz array is required." }, { status: 400 });
  }

  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }

  const updated = await prisma.note.update({
    where: { id },
    data: { quizJson: JSON.stringify(body.quiz) },
  });

  return NextResponse.json({ ...updated, quiz: JSON.parse(updated.quizJson ?? "[]") });
}
