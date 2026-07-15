import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SCENARIO_TYPES = ["quick-refresh", "practice-heavy", "stuck-on-concepts", "custom"];

/**
 * Ported from the reference repo's study-mode intake shape (topic, goal,
 * studyMinutes, scenarioType, scenario), rewritten against SQLite with no
 * auth — single implicit local user, no user_id, no suspension checks.
 */
export async function POST(request: Request) {
  const payload = (await request.json()) as {
    topic?: string;
    goal?: string;
    studyMinutes?: number;
    scenarioType?: string;
    scenario?: string;
  };

  const topic = payload.topic?.trim() ?? "";
  const goal = payload.goal?.trim() ?? "";
  const studyMinutes = Number(payload.studyMinutes);
  const scenarioType = SCENARIO_TYPES.includes(payload.scenarioType ?? "")
    ? (payload.scenarioType as string)
    : "quick-refresh";
  const scenario = payload.scenario?.trim() ?? "";

  if (!topic || !goal || !scenario) {
    return NextResponse.json({ error: "topic, goal, and scenario are required." }, { status: 400 });
  }
  if (!Number.isFinite(studyMinutes) || studyMinutes <= 0) {
    return NextResponse.json({ error: "studyMinutes must be a positive number." }, { status: 400 });
  }

  const intake = await prisma.studyIntake.create({
    data: { topic, goal, studyMinutes, scenarioType, scenario },
  });

  return NextResponse.json(intake);
}
