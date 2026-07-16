import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type SyllabusUnits = {
  units?: { subunits?: { subunit_id: string; title: string }[] }[];
};

/**
 * Powers Home's "Continue" card: whichever is more recent between the last
 * subunit the user visited (SubunitProgress.lastVisited) and the last note
 * they created (Note.createdAt). Returns `{ type: "none" }` for a true
 * first-time user with neither row yet, so the client can render a plain
 * empty state instead of a broken/empty card.
 */
export async function GET() {
  const [progress, note] = await Promise.all([
    prisma.subunitProgress.findFirst({
      where: { lastVisited: { not: null } },
      orderBy: { lastVisited: "desc" },
      include: { syllabus: true },
    }),
    prisma.note.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);

  const progressTime = progress?.lastVisited?.getTime() ?? -1;
  const noteTime = note?.createdAt?.getTime() ?? -1;

  if (progressTime < 0 && noteTime < 0) {
    return NextResponse.json({ type: "none" });
  }

  if (progress && progressTime >= noteTime) {
    let subunitTitle = progress.subunitId;
    try {
      const parsed = JSON.parse(progress.syllabus.unitsJson) as SyllabusUnits;
      for (const unit of parsed.units ?? []) {
        const match = unit.subunits?.find((s) => s.subunit_id === progress.subunitId);
        if (match) {
          subunitTitle = match.title;
          break;
        }
      }
    } catch {
      // fall back to the raw subunitId if the stored syllabus JSON is malformed
    }
    return NextResponse.json({
      type: "subunit",
      title: progress.syllabus.topic,
      subtitle: subunitTitle,
      href: `/study/syllabus/${progress.syllabusId}`,
    });
  }

  if (note) {
    return NextResponse.json({
      type: "note",
      title: note.title,
      subtitle: note.summary ? note.summary.slice(0, 90) : undefined,
      href: `/notes/${note.id}`,
    });
  }

  return NextResponse.json({ type: "none" });
}
