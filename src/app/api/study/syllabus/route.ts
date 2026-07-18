import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Lists saved syllabi, newest first, in the shape the earlier reference design's ported
 * StudyIntakeForm expects for its "Previous syllabi" chips:
 * { id, topic, created_at, syllabus_json:{ topic, goal, units } }.
 * The embedded syllabus_json carries topic + goal so the ported SyllabusView
 * (which reads syllabus.topic) can be opened directly from the list without a
 * second fetch.
 */
export async function GET() {
  const rows = await prisma.studySyllabus.findMany({
    orderBy: { createdAt: "desc" },
  });

  const syllabi = rows.map((row) => ({
    id: row.id,
    topic: row.topic,
    created_at: row.createdAt,
    syllabus_json: {
      topic: row.topic,
      goal: row.goal,
      units: JSON.parse(row.unitsJson),
    },
  }));

  return NextResponse.json({ syllabi });
}

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

  if (!body.intakeId || !body.topic || !Array.isArray(body.units) || body.units.length === 0) {
    return NextResponse.json({ error: "intakeId, topic, and a non-empty units array are required." }, { status: 400 });
  }

  const intake = await prisma.studyIntake.findUnique({ where: { id: body.intakeId } });
  if (!intake) {
    return NextResponse.json({ error: "intakeId does not match a known intake." }, { status: 404 });
  }

  const syllabus = await prisma.studySyllabus.create({
    data: {
      intakeId: body.intakeId,
      topic: body.topic,
      goal: body.goal ?? "",
      unitsJson: JSON.stringify(body.units),
    },
  });

  return NextResponse.json(syllabus);
}
