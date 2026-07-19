import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_MODEL } from "@/lib/ollama";
import { sanitizeStartLanguage } from "@/lib/sanitize-language-mode";

// Single implicit local user — settings is a one-row table (id fixed at 1).
// No auth, no accounts. Model selection is intentionally not exposed here:
// e2b is the only shipped default per the brief; e4b may only become an
// option once separately verified stable on the real demo hardware.

// GET is reachable by anything that can reach this server — including a
// tunnel (ngrok/cloudflared) pointed at it from the public internet, not
// just the trusted local browser this app assumes. cloudApiKey is real
// third-party credential, so it's masked here regardless of who's asking;
// the PUT handler below is the only path that ever writes or reads the
// real value, and /api/llm reads it directly from Prisma server-side, not
// through this endpoint — so masking here doesn't affect actual cloud calls.
function maskApiKey(key: string | null): string | null {
  if (!key) return key;
  if (key.length <= 8) return "*".repeat(key.length);
  return `${key.slice(0, 4)}${"*".repeat(key.length - 8)}${key.slice(-4)}`;
}

export async function GET() {
  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, model: DEFAULT_MODEL },
  });
  return NextResponse.json({
    ...settings,
    // Sanitized on read too, not just on write — a pre-existing local DB
    // row can still hold a stale value from an earlier version of this
    // mechanism ("en"/"ha"/"mixed"), and this endpoint should never hand
    // that back out as if it were still meaningful.
    language: sanitizeStartLanguage(settings.language),
    cloudApiKey: maskApiKey(settings.cloudApiKey),
  });
}

const TEMPERATURE_RANGE = { min: 0, max: 1 } as const;

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    language?: string;
    temperature?: number | null;
    modelSource?: string;
    cloudApiKey?: string | null;
    cloudModel?: string | null;
  };

  const data: {
    language?: string;
    temperature?: number | null;
    modelSource?: string;
    cloudApiKey?: string | null;
    cloudModel?: string | null;
  } = {};

  if (body.language !== undefined) {
    if (!["hausa", "english"].includes(body.language)) {
      return NextResponse.json({ error: "language must be one of: hausa, english" }, { status: 400 });
    }
    data.language = body.language;
  }

  // Temperature ("Response creativity") only ever affects the conversational
  // routes (lesson/chat/gloss/audio) — see src/lib/ollama.ts. num_ctx is
  // not, and never will be, a setting: exposing it risks OOMing the target
  // hardware. Nullable (null/undefined = "use the existing per-route
  // default"), clamped here server-side, not just trusted from the client.
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

  if (body.modelSource !== undefined) {
    if (!["local", "cloud"].includes(body.modelSource)) {
      return NextResponse.json({ error: "modelSource must be one of: local, cloud" }, { status: 400 });
    }
    data.modelSource = body.modelSource;
  }

  // API key and cloud model id — plain strings, trimmed, empty string
  // normalized to null (same "unset" meaning as null from the client).
  if (body.cloudApiKey !== undefined) {
    data.cloudApiKey = body.cloudApiKey === null ? null : body.cloudApiKey.trim() || null;
  }
  if (body.cloudModel !== undefined) {
    data.cloudModel = body.cloudModel === null ? null : body.cloudModel.trim() || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no valid fields to update" }, { status: 400 });
  }

  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: data,
    create: {
      id: 1,
      model: DEFAULT_MODEL,
      temperature: data.temperature ?? undefined,
    },
  });

  return NextResponse.json(settings);
}
