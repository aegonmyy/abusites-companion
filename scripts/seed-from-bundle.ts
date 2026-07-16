/**
 * Default, zero-credential setup-time seed script. Loads the static,
 * git-committed bundle at `prisma/seed-bundle/catalog.json` (produced by
 * `scripts/export-seed-bundle.ts` from a known-good local database) and
 * upserts it into local SQLite by id — idempotent, safe to re-run.
 *
 * Requires NO environment variables, NO network access, and NO
 * credentials of any kind. This is the standard path a freshly cloned repo
 * uses to get a real course/past-question catalog — see `npm run seed` /
 * setup.sh / setup.ps1.
 *
 * The upsert shapes here intentionally mirror scripts/fetch-seed-data.ts
 * for consistency, minus the Supabase fetch/pagination/toDate-from-string
 * bits (the bundle's dates are already ISO strings from `findMany`, and
 * `toId` isn't needed since the bundle's ids are already strings).
 *
 * Usage: npm run seed  (or: npx tsx scripts/seed-from-bundle.ts)
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";

const BUNDLE_FILE = path.join(
  __dirname,
  "..",
  "prisma",
  "seed-bundle",
  "catalog.json",
);

type University = {
  id: string;
  name: string;
  country: string | null;
  city: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};
type Faculty = {
  id: string;
  universityId: string;
  name: string;
  createdAt: string | null;
  updatedAt: string | null;
};
type Department = {
  id: string;
  facultyId: string;
  name: string;
  createdAt: string | null;
  updatedAt: string | null;
};
type Course = {
  id: string;
  departmentId: string | null;
  universityId: string | null;
  code: string;
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
};
type PastQuestion = {
  id: string;
  courseId: string;
  title: string;
  year: number | null;
  questionText: string | null;
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  correctIndex: number | null;
  explanation: string | null;
  fileUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type Bundle = {
  universities: University[];
  faculties: Faculty[];
  departments: Department[];
  courses: Course[];
  pastQuestions: PastQuestion[];
};

function toDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function seedUniversities(rows: University[]) {
  for (const r of rows) {
    await prisma.university.upsert({
      where: { id: r.id },
      update: {
        name: r.name,
        country: r.country,
        city: r.city,
        createdAt: toDate(r.createdAt),
        updatedAt: toDate(r.updatedAt),
      },
      create: {
        id: r.id,
        name: r.name,
        country: r.country,
        city: r.city,
        createdAt: toDate(r.createdAt),
        updatedAt: toDate(r.updatedAt),
      },
    });
  }
  return rows.length;
}

async function seedFaculties(rows: Faculty[]) {
  for (const r of rows) {
    await prisma.faculty.upsert({
      where: { id: r.id },
      update: {
        universityId: r.universityId,
        name: r.name,
        createdAt: toDate(r.createdAt),
        updatedAt: toDate(r.updatedAt),
      },
      create: {
        id: r.id,
        universityId: r.universityId,
        name: r.name,
        createdAt: toDate(r.createdAt),
        updatedAt: toDate(r.updatedAt),
      },
    });
  }
  return rows.length;
}

async function seedDepartments(rows: Department[]) {
  for (const r of rows) {
    await prisma.department.upsert({
      where: { id: r.id },
      update: {
        facultyId: r.facultyId,
        name: r.name,
        createdAt: toDate(r.createdAt),
        updatedAt: toDate(r.updatedAt),
      },
      create: {
        id: r.id,
        facultyId: r.facultyId,
        name: r.name,
        createdAt: toDate(r.createdAt),
        updatedAt: toDate(r.updatedAt),
      },
    });
  }
  return rows.length;
}

async function seedCourses(rows: Course[]) {
  for (const r of rows) {
    await prisma.course.upsert({
      where: { id: r.id },
      update: {
        departmentId: r.departmentId,
        universityId: r.universityId,
        code: r.code,
        title: r.title,
        createdAt: toDate(r.createdAt),
        updatedAt: toDate(r.updatedAt),
      },
      create: {
        id: r.id,
        departmentId: r.departmentId,
        universityId: r.universityId,
        code: r.code,
        title: r.title,
        createdAt: toDate(r.createdAt),
        updatedAt: toDate(r.updatedAt),
      },
    });
  }
  return rows.length;
}

async function seedPastQuestions(rows: PastQuestion[]) {
  for (const r of rows) {
    const data = {
      courseId: r.courseId,
      title: r.title,
      year: r.year,
      questionText: r.questionText,
      optionA: r.optionA,
      optionB: r.optionB,
      optionC: r.optionC,
      optionD: r.optionD,
      correctIndex: r.correctIndex,
      explanation: r.explanation,
      fileUrl: r.fileUrl,
      createdAt: toDate(r.createdAt),
      updatedAt: toDate(r.updatedAt),
    };
    await prisma.pastQuestion.upsert({
      where: { id: r.id },
      update: data,
      create: { id: r.id, ...data },
    });
  }
  return rows.length;
}

async function main() {
  if (!fs.existsSync(BUNDLE_FILE)) {
    console.error(
      `[seed-from-bundle] Missing ${BUNDLE_FILE}. This file should be ` +
        "committed to the repo — check your clone is complete.",
    );
    process.exit(1);
  }

  const bundle: Bundle = JSON.parse(fs.readFileSync(BUNDLE_FILE, "utf8"));

  const results: Record<string, number> = {};

  // Order matters: parents before children (FK constraints).
  results.universities = await seedUniversities(bundle.universities);
  console.log(`[seed-from-bundle] universities: upserted ${results.universities}`);

  results.faculties = await seedFaculties(bundle.faculties);
  console.log(`[seed-from-bundle] faculties: upserted ${results.faculties}`);

  results.departments = await seedDepartments(bundle.departments);
  console.log(`[seed-from-bundle] departments: upserted ${results.departments}`);

  results.courses = await seedCourses(bundle.courses);
  console.log(`[seed-from-bundle] courses: upserted ${results.courses}`);

  results.pastQuestions = await seedPastQuestions(bundle.pastQuestions);
  console.log(`[seed-from-bundle] past questions: upserted ${results.pastQuestions}`);

  console.log("\n[seed-from-bundle] Summary:", JSON.stringify(results, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
