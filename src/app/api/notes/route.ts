import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEPTH_PREFERENCES = ["quick", "standard", "deep"];

/**
 * Persists a note the client generated via /api/llm (routeTag "json",
 * notesSegmentSplitSystemPrompt / notesSegmentSplitFromImageSystemPrompt —
 * a cheap table-of-contents call, not the old single summary+quiz call).
 * Same split as /api/study/syllabus: the model call lives client-side so
 * every LLM call funnels through the single /api/llm entry point; this
 * route only validates shape and writes to SQLite.
 */
export async function GET() {
  const notes = await prisma.note.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, sourceType: true, summary: true, segmentsJson: true, createdAt: true },
  });
  const shaped = notes.map((n) => {
    const segments = n.segmentsJson ? (JSON.parse(n.segmentsJson) as unknown[]) : null;
    return {
      id: n.id,
      title: n.title,
      sourceType: n.sourceType,
      summary: n.summary,
      segmentCount: segments ? segments.length : null,
      createdAt: n.createdAt,
    };
  });
  return NextResponse.json(shaped);
}

type SegmentIn = { segment_id?: string; title?: string; summary?: string };

export async function POST(request: Request) {
  const body = (await request.json()) as {
    title?: string;
    sourceType?: string;
    rawText?: string;
    segments?: SegmentIn[];
    depthPreference?: string;
  };

  if (!body.title || !body.sourceType || !Array.isArray(body.segments) || body.segments.length === 0) {
    return NextResponse.json(
      { error: "title, sourceType, and a non-empty segments array are required." },
      { status: 400 },
    );
  }
  if (!["pdf", "image", "text"].includes(body.sourceType)) {
    return NextResponse.json({ error: "sourceType must be pdf, image, or text." }, { status: 400 });
  }
  const depthPreference = DEPTH_PREFERENCES.includes(body.depthPreference ?? "")
    ? (body.depthPreference as string)
    : "standard";

  const cleanSegments = body.segments
    .filter((s): s is Required<SegmentIn> => !!s && typeof s.title === "string" && s.title.trim().length > 0)
    .map((s, i) => ({
      segment_id: s.segment_id ? String(s.segment_id) : String(i + 1),
      title: s.title,
      summary: s.summary ?? "",
    }));
  if (cleanSegments.length === 0) {
    return NextResponse.json({ error: "No valid segments in the segments array." }, { status: 400 });
  }

  const note = await prisma.note.create({
    data: {
      title: body.title,
      sourceType: body.sourceType,
      rawText: body.rawText ?? null,
      segmentsJson: JSON.stringify(cleanSegments),
      depthPreference,
    },
  });

  return NextResponse.json(note);
}
