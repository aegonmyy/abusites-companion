import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_MODEL } from "@/lib/ollama";

// Single implicit local user — settings is a one-row table (id fixed at 1).
// No auth, no accounts. Model selection is intentionally not exposed here:
// e2b is the only shipped default per the brief; e4b may only become an
// option once separately verified stable on the real demo hardware.

export async function GET() {
  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, language: "en", model: DEFAULT_MODEL },
  });
  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { language?: string };
  const language = body.language;

  if (!language || !["en", "ha", "mixed"].includes(language)) {
    return NextResponse.json(
      { error: "language must be one of: en, ha, mixed" },
      { status: 400 },
    );
  }

  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: { language },
    create: { id: 1, language, model: DEFAULT_MODEL },
  });

  return NextResponse.json(settings);
}
