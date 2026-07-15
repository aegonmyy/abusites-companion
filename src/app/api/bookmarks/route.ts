import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const bookmarks = await prisma.bookmark.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(bookmarks);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { kind?: string; refId?: string; label?: string };

  if (!body.kind || !body.refId || !body.label) {
    return NextResponse.json({ error: "kind, refId, and label are required." }, { status: 400 });
  }

  const bookmark = await prisma.bookmark.upsert({
    where: { kind_refId: { kind: body.kind, refId: body.refId } },
    update: { label: body.label },
    create: { kind: body.kind, refId: body.refId, label: body.label },
  });

  return NextResponse.json(bookmark);
}
