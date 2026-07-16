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

const TEMPERATURE_RANGE = { min: 0, max: 1 } as const;
const TOKEN_BUDGET_RANGE = { min: 80, max: 500 } as const;

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    language?: string;
    temperature?: number | null;
    tokenBudget?: number | null;
  };

  const data: {
    language?: string;
    temperature?: number | null;
    tokenBudget?: number | null;
  } = {};

  if (body.language !== undefined) {
    if (!["en", "ha", "mixed"].includes(body.language)) {
      return NextResponse.json(
        { error: "language must be one of: en, ha, mixed" },
        { status: 400 },
      );
    }
    data.language = body.language;
  }

  // Temperature ("Response creativity") and token budget ("Response
  // length") only ever affect the conversational routes (lesson/chat/gloss/
  // audio) — see src/lib/ollama.ts. num_ctx is not, and never will be, a
  // setting: exposing it risks OOMing the target hardware. Both are
  // nullable (null/undefined = "use the existing per-route default"),
  // clamped here server-side same as language above, not just trusted from
  // the client.
  if (body.temperature !== undefined) {
    if (body.temperature === null) {
      data.temperature = null;
    } else if (typeof body.temperature !== "number" || !Number.isFinite(body.temperature)) {
      return NextResponse.json(
        { error: `temperature must be a number between ${TEMPERATURE_RANGE.min} and ${TEMPERATURE_RANGE.max}` },
        { status: 400 },
      );
    } else {
      data.temperature = Math.min(TEMPERATURE_RANGE.max, Math.max(TEMPERATURE_RANGE.min, body.temperature));
    }
  }

  if (body.tokenBudget !== undefined) {
    if (body.tokenBudget === null) {
      data.tokenBudget = null;
    } else if (typeof body.tokenBudget !== "number" || !Number.isFinite(body.tokenBudget)) {
      return NextResponse.json(
        { error: `tokenBudget must be a number between ${TOKEN_BUDGET_RANGE.min} and ${TOKEN_BUDGET_RANGE.max}` },
        { status: 400 },
      );
    } else {
      data.tokenBudget = Math.round(
        Math.min(TOKEN_BUDGET_RANGE.max, Math.max(TOKEN_BUDGET_RANGE.min, body.tokenBudget)),
      );
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no valid fields to update" }, { status: 400 });
  }

  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: data,
    create: {
      id: 1,
      language: data.language ?? "en",
      model: DEFAULT_MODEL,
      temperature: data.temperature ?? undefined,
      tokenBudget: data.tokenBudget ?? undefined,
    },
  });

  return NextResponse.json(settings);
}
