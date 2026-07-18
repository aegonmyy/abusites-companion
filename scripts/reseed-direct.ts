/**
 * MAINTAINER-ONLY. Not part of the default setup path and never invoked by
 * it — a normal cloned repo gets its full catalog from the git-committed
 * static bundle (`scripts/seed-from-bundle.ts`, run by `npm run seed`)
 * with zero credentials. This script exists purely so a maintainer with
 * real Supabase credentials can refresh that bundle from the live source
 * periodically — see the README section "Refreshing the bundled seed
 * data": run this, then `npm run seed:export-bundle`, then commit the
 * updated `prisma/seed-bundle/catalog.json`.
 *
 * One-time, direct-Postgres reseed for tables that come back empty through
 * the anon-key REST path (`scripts/fetch-seed-data.ts`) due to Row Level
 * Security: universities, faculties, departments, and past questions.
 *
 * Uses DIRECT_DB_URL (the `postgres` superuser role, bypasses RLS) instead
 * of SUPABASE_URL/SUPABASE_ANON_KEY. Like fetch-seed-data.ts, this is a
 * setup-time-only script — no app runtime code path may depend on this
 * connection or on `pg`. DIRECT_DB_URL must stay out of git (.env is
 * gitignored) and should be rotated/removed once seeding is done if it's
 * no longer needed.
 *
 * Source table for questions is `question_ai` (confirmed via direct query
 * to be the actively-populated one — 8,244 rows vs. `past_questions`'
 * 4,643 and a separate unused `questions` table's 6,297 — and it's the
 * only source the earlier reference design's own reference code
 * (src/lib/past-questions.ts:loadPastQuestionsCourseData) actually reads
 * from). Filtering follows the project owner's explicit instruction, which
 * is stricter than that reference code's own: it only excludes
 * `does_not_belong = true`; we exclude BOTH `does_not_belong = true` AND
 * `needs_review = true`.
 *
 * Usage: npx tsx scripts/reseed-direct.ts
 */
import "dotenv/config";
import { Client } from "pg";
import { prisma } from "../src/lib/prisma";

const DIRECT_DB_URL = process.env.DIRECT_DB_URL;
if (!DIRECT_DB_URL) {
  console.error("Missing DIRECT_DB_URL in .env. Cannot reseed.");
  process.exit(1);
}

const client = new Client({ connectionString: DIRECT_DB_URL, ssl: { rejectUnauthorized: false } });

function toId(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return String(value);
}

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const OPTION_LABELS = ["A", "B", "C", "D"];

/** Mirrors the earlier reference design's own mapCorrectOption: returns null (not a throw) for
 * anything that isn't a clean A/B/C/D letter — ~0.3% of question_ai rows
 * have a malformed correct_option (e.g. "None of the above", "IV"); those
 * questions stay browsable but unscoreable in CBT rather than being
 * dropped entirely. */
function mapCorrectOption(value: string | null): number | null {
  if (!value) return null;
  const idx = OPTION_LABELS.indexOf(value.trim().toUpperCase());
  return idx >= 0 ? idx : null;
}

async function seedUniversities() {
  const { rows } = await client.query(`SELECT * FROM public.universities`);
  for (const r of rows) {
    const id = toId(r.id);
    if (!id) continue;
    await prisma.university.upsert({
      where: { id },
      update: { name: r.name, country: r.country ?? null, city: r.city ?? null, updatedAt: toDate(r.updated_at) },
      create: { id, name: r.name, country: r.country ?? null, city: r.city ?? null, createdAt: toDate(r.created_at), updatedAt: toDate(r.updated_at) },
    });
  }
  return rows.length;
}

async function seedFaculties() {
  const { rows } = await client.query(`SELECT * FROM public.faculties`);
  let ok = 0;
  for (const r of rows) {
    const id = toId(r.id);
    const universityId = toId(r.university_id);
    if (!id || !universityId) continue;
    await prisma.faculty.upsert({
      where: { id },
      update: { universityId, name: r.name, updatedAt: toDate(r.updated_at) },
      create: { id, universityId, name: r.name, createdAt: toDate(r.created_at), updatedAt: toDate(r.updated_at) },
    });
    ok++;
  }
  return ok;
}

async function seedDepartments() {
  const { rows } = await client.query(`SELECT * FROM public.departments`);
  let ok = 0;
  for (const r of rows) {
    const id = toId(r.id);
    const facultyId = toId(r.faculty_id);
    if (!id || !facultyId) continue;
    await prisma.department.upsert({
      where: { id },
      update: { facultyId, name: r.name, updatedAt: toDate(r.updated_at) },
      create: { id, facultyId, name: r.name, createdAt: toDate(r.created_at), updatedAt: toDate(r.updated_at) },
    });
    ok++;
  }
  return ok;
}

async function seedPastQuestionsFromQuestionAi() {
  const existingCourseIds = new Set(
    (await prisma.course.findMany({ select: { id: true } })).map((c) => c.id),
  );

  const { rows } = await client.query(`
    SELECT id, question_text, correct_option, short_answer, created_at, options, course_id, course_code, year
    FROM public.question_ai
    WHERE (needs_review IS NOT TRUE) AND (does_not_belong IS NOT TRUE)
    ORDER BY year DESC NULLS LAST, id ASC
  `);

  let upserted = 0;
  let skippedNoCourse = 0;

  for (const r of rows) {
    const id = `qai-${toId(r.id)}`;
    const courseId = toId(r.course_id);
    if (!courseId || !existingCourseIds.has(courseId)) {
      skippedNoCourse++;
      continue;
    }

    const options: unknown = r.options;
    const optionList = Array.isArray(options) ? (options as unknown[]).map((o) => String(o)) : [];
    const title = [r.course_code, r.year].filter(Boolean).join(" ") || "Past question";

    const data = {
      courseId,
      title,
      year: (r.year as number) ?? null,
      questionText: (r.question_text as string) ?? null,
      optionA: optionList[0] ?? null,
      optionB: optionList[1] ?? null,
      optionC: optionList[2] ?? null,
      optionD: optionList[3] ?? null,
      correctIndex: mapCorrectOption(r.correct_option as string | null),
      explanation: (r.short_answer as string) ?? null,
      fileUrl: null,
      createdAt: toDate(r.created_at),
    };

    await prisma.pastQuestion.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
    upserted++;
  }

  return { total: rows.length, upserted, skippedNoCourse };
}

async function main() {
  await client.connect();
  console.log("Connected via direct Postgres connection (RLS bypassed).\n");

  const results: Record<string, unknown> = {};
  try {
    results.universities = await seedUniversities();
    console.log(`[reseed] universities: upserted ${results.universities}`);

    results.faculties = await seedFaculties();
    console.log(`[reseed] faculties: upserted ${results.faculties}`);

    results.departments = await seedDepartments();
    console.log(`[reseed] departments: upserted ${results.departments}`);

    results.pastQuestions = await seedPastQuestionsFromQuestionAi();
    console.log(`[reseed] past questions (from question_ai): ${JSON.stringify(results.pastQuestions)}`);
  } finally {
    await client.end();
    await prisma.$disconnect();
  }

  console.log("\nDone.", JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error("Reseed failed:", err);
  process.exit(1);
});
