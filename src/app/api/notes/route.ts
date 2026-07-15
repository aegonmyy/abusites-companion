import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Persists a note the client generated via /api/llm (routeTag "json",
 * notesSummarySystemPrompt / notesSummaryFromImageSystemPrompt). Same split
 * as /api/study/syllabus: the model call lives client-side so every LLM call
 * funnels through the single /api/llm entry point; this route only
 * validates shape and writes to SQLite.
 */
export async function GET() {
  const notes = await prisma.note.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, sourceType: true, summary: true, createdAt: true },
  });
  return NextResponse.json(notes);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    title?: string;
    sourceType?: string;
    rawText?: string;
    summary?: string;
    keyConcepts?: string[];
    quiz?: unknown[];
  };

  if (!body.title || !body.sourceType || !body.summary) {
    return NextResponse.json({ error: "title, sourceType, and summary are required." }, { status: 400 });
  }
  if (!["pdf", "image", "text"].includes(body.sourceType)) {
    return NextResponse.json({ error: "sourceType must be pdf, image, or text." }, { status: 400 });
  }

  const note = await prisma.note.create({
    data: {
      title: body.title,
      sourceType: body.sourceType,
      rawText: body.rawText ?? null,
      summary: body.summary,
      keyConcepts: JSON.stringify(body.keyConcepts ?? []),
      quizJson: JSON.stringify(body.quiz ?? []),
    },
  });

  return NextResponse.json(note);
}
