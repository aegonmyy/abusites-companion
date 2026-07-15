import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Single implicit local user — one streak row (id fixed at 1). Dates are
// plain YYYY-MM-DD strings in the server's local timezone; this is a
// single-machine offline app so there's no cross-timezone concern.

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET() {
  const streak = await prisma.streak.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, currentStreak: 0, longestStreak: 0, lastActiveDate: null },
  });
  return NextResponse.json(streak);
}

/** Call once per "did a study activity today" event. Idempotent per day. */
export async function POST() {
  const existing = await prisma.streak.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, currentStreak: 0, longestStreak: 0, lastActiveDate: null },
  });

  const today = todayStr();
  if (existing.lastActiveDate === today) {
    return NextResponse.json(existing);
  }

  const continuing = existing.lastActiveDate === yesterdayStr();
  const newCurrent = continuing ? existing.currentStreak + 1 : 1;
  const newLongest = Math.max(existing.longestStreak, newCurrent);

  const updated = await prisma.streak.update({
    where: { id: 1 },
    data: {
      currentStreak: newCurrent,
      longestStreak: newLongest,
      lastActiveDate: today,
    },
  });

  return NextResponse.json(updated);
}
