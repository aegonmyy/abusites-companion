/**
 * MAINTAINER-ONLY. Not part of the default setup path — a normal cloned
 * repo never needs Supabase credentials and never runs this. The default
 * `npm run seed` now runs `scripts/seed-from-bundle.ts`, which loads the
 * git-committed static bundle at `prisma/seed-bundle/catalog.json` with
 * zero credentials and zero network calls.
 *
 * Pulls the five catalog tables from the reference Supabase project (anon
 * key — note this can only actually read the `courses` table; RLS blocks
 * anon reads on the rest, see `reseed-direct.ts` for the superuser-backed
 * path around that) and upserts them into the local SQLite DB by id
 * (idempotent — safe to re-run). Used only when a maintainer with real
 * Supabase credentials wants to refresh the bundled seed data — see the
 * README section "Refreshing the bundled seed data".
 *
 * This is the ONLY place in the codebase allowed to import
 * @supabase/supabase-js or read SUPABASE_URL / SUPABASE_ANON_KEY. No app
 * runtime code path may depend on Supabase — the app is offline-first and
 * ships with data already materialized in SQLite.
 *
 * Usage (maintainer only): npm run seed:from-supabase
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { prisma } from "../src/lib/prisma";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env. Cannot seed.",
  );
  process.exit(1);
}

// Realtime is unused by this script (we only do one-shot REST selects), but
// supabase-js eagerly constructs a RealtimeClient that requires a global
// WebSocket on Node < 22. Supplying the "ws" package as the transport avoids
// that crash; it's a devDependency used only by this setup-time script.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws as unknown as typeof WebSocket },
});

const PAGE_SIZE = 1000;

/** Paginates past Supabase's default 1000-row cap for a given table. */
async function fetchAll(table: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase.from(table).select("*").range(from, to);

    if (error) {
      throw new Error(`[${table}] ${error.code ?? ""} ${error.message}`);
    }
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function toDate(value: unknown): Date | undefined {
  if (!value || typeof value !== "string") return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * IDs are stored as TEXT in SQLite per the brief ("UUIDs as TEXT"). The live
 * Supabase project's `public.courses` table was found to use integer ids
 * (not UUIDs, unlike the reference schema.sql) — see seed report. Coerce
 * whatever comes back (uuid string or integer) to a string uniformly.
 */
function toId(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return String(value);
}

async function seedUniversities() {
  const rows = await fetchAll("universities");
  for (const r of rows) {
    const id = toId(r.id);
    if (!id) continue;
    await prisma.university.upsert({
      where: { id },
      update: {
        name: r.name as string,
        country: (r.country as string) ?? null,
        city: (r.city as string) ?? null,
        createdAt: toDate(r.created_at),
        updatedAt: toDate(r.updated_at),
      },
      create: {
        id,
        name: r.name as string,
        country: (r.country as string) ?? null,
        city: (r.city as string) ?? null,
        createdAt: toDate(r.created_at),
        updatedAt: toDate(r.updated_at),
      },
    });
  }
  return rows.length;
}

async function seedFaculties() {
  const rows = await fetchAll("faculties");
  for (const r of rows) {
    const id = toId(r.id);
    const universityId = toId(r.university_id);
    if (!id || !universityId) continue;
    await prisma.faculty.upsert({
      where: { id },
      update: {
        universityId,
        name: r.name as string,
        createdAt: toDate(r.created_at),
        updatedAt: toDate(r.updated_at),
      },
      create: {
        id,
        universityId,
        name: r.name as string,
        createdAt: toDate(r.created_at),
        updatedAt: toDate(r.updated_at),
      },
    });
  }
  return rows.length;
}

async function seedDepartments() {
  const rows = await fetchAll("departments");
  for (const r of rows) {
    const id = toId(r.id);
    const facultyId = toId(r.faculty_id);
    if (!id || !facultyId) continue;
    await prisma.department.upsert({
      where: { id },
      update: {
        facultyId,
        name: r.name as string,
        createdAt: toDate(r.created_at),
        updatedAt: toDate(r.updated_at),
      },
      create: {
        id,
        facultyId,
        name: r.name as string,
        createdAt: toDate(r.created_at),
        updatedAt: toDate(r.updated_at),
      },
    });
  }
  return rows.length;
}

async function seedCourses() {
  const rows = await fetchAll("courses");
  for (const r of rows) {
    const id = toId(r.id);
    if (!id) continue;
    await prisma.course.upsert({
      where: { id },
      update: {
        departmentId: toId(r.department_id) ?? null,
        universityId: toId(r.university_id) ?? null,
        code: r.code as string,
        title: r.title as string,
        createdAt: toDate(r.created_at),
        updatedAt: toDate(r.updated_at),
      },
      create: {
        id,
        departmentId: toId(r.department_id) ?? null,
        universityId: toId(r.university_id) ?? null,
        code: r.code as string,
        title: r.title as string,
        createdAt: toDate(r.created_at),
        updatedAt: toDate(r.updated_at),
      },
    });
  }
  return rows.length;
}

async function seedPastQuestions() {
  const rows = await fetchAll("past_questions");
  for (const r of rows) {
    const id = toId(r.id);
    const courseId = toId(r.course_id);
    if (!id || !courseId) continue;
    await prisma.pastQuestion.upsert({
      where: { id },
      update: {
        courseId,
        title: r.title as string,
        year: (r.year as number) ?? null,
        questionText: (r.question_text as string) ?? null,
        optionA: (r.option_a as string) ?? null,
        optionB: (r.option_b as string) ?? null,
        optionC: (r.option_c as string) ?? null,
        optionD: (r.option_d as string) ?? null,
        correctIndex: (r.correct_index as number) ?? null,
        explanation: (r.explanation as string) ?? null,
        fileUrl: (r.file_url as string) ?? null,
        createdAt: toDate(r.created_at),
        updatedAt: toDate(r.updated_at),
      },
      create: {
        id,
        courseId,
        title: r.title as string,
        year: (r.year as number) ?? null,
        questionText: (r.question_text as string) ?? null,
        optionA: (r.option_a as string) ?? null,
        optionB: (r.option_b as string) ?? null,
        optionC: (r.option_c as string) ?? null,
        optionD: (r.option_d as string) ?? null,
        correctIndex: (r.correct_index as number) ?? null,
        explanation: (r.explanation as string) ?? null,
        fileUrl: (r.file_url as string) ?? null,
        createdAt: toDate(r.created_at),
        updatedAt: toDate(r.updated_at),
      },
    });
  }
  return rows.length;
}

async function main() {
  const results: Record<string, number | { error: string }> = {};

  // Order matters: parents before children (FK constraints).
  const steps: [string, () => Promise<number>][] = [
    ["universities", seedUniversities],
    ["faculties", seedFaculties],
    ["departments", seedDepartments],
    ["courses", seedCourses],
    ["past_questions", seedPastQuestions],
  ];

  for (const [name, fn] of steps) {
    try {
      const count = await fn();
      results[name] = count;
      console.log(`[seed] ${name}: upserted ${count} row(s)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results[name] = { error: message };
      console.error(`[seed] ${name}: FAILED — ${message}`);
    }
  }

  console.log("\n[seed] Summary:", JSON.stringify(results, null, 2));

  const anyFailed = Object.values(results).some(
    (v) => typeof v === "object" && v !== null && "error" in v,
  );
  if (anyFailed) {
    console.error(
      "\n[seed] One or more tables failed. If the error mentions RLS/policy/permission " +
        "denied, the anon key most likely cannot select from that table — see the " +
        "brief's RLS caveat (report to owner, do not attempt to bypass RLS).",
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
