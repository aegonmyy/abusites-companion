import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type SyllabusUnit = {
  unit_id: number;
  title: string;
  subunits: {
    subunit_id: string;
    title: string;
    key_concepts: string[];
    prerequisites: string[];
  }[];
};

/**
 * Persists a syllabus the client generated via /api/llm (routeTag "json",
 * syllabusGenerationSystemPrompt). The LLM call itself lives client-side so
 * every model call funnels through the single /api/llm entry point; this
 * route only validates shape and writes to SQLite.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    intakeId?: string;
    topic?: string;
    goal?: string;
    units?: SyllabusUnit[];
  };

  if (!body.intakeId || !body.topic || !body.goal || !Array.isArray(body.units) || body.units.length === 0) {
    return NextResponse.json({ error: "intakeId, topic, goal, and a non-empty units array are required." }, { status: 400 });
  }

  const intake = await prisma.studyIntake.findUnique({ where: { id: body.intakeId } });
  if (!intake) {
    return NextResponse.json({ error: "intakeId does not match a known intake." }, { status: 404 });
  }

  const syllabus = await prisma.studySyllabus.create({
    data: {
      intakeId: body.intakeId,
      topic: body.topic,
      goal: body.goal,
      unitsJson: JSON.stringify(body.units),
    },
  });

  return NextResponse.json(syllabus);
}
