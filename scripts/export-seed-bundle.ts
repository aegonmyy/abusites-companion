/**
 * MAINTAINER-ONLY. Exports the catalog tables (universities, faculties,
 * departments, courses, past questions) from the CURRENT local SQLite DB
 * (`data/grinnish.db`) into a static, git-committed JSON bundle at
 * `prisma/seed-bundle/catalog.json`.
 *
 * This is how the bundle gets refreshed after a maintainer has pulled fresh
 * data from the source Supabase project via `fetch-seed-data.ts` +
 * `reseed-direct.ts` (see README "Refreshing the bundled seed data"
 * section). It reads FROM local Prisma/SQLite — no network, no credentials
 * — so it's safe to run any time the local DB is known-good, but it is not
 * part of the end-user setup path.
 *
 * Usage: npx tsx scripts/export-seed-bundle.ts
 */
import { prisma } from "../src/lib/prisma";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(__dirname, "..", "prisma", "seed-bundle");
const OUT_FILE = path.join(OUT_DIR, "catalog.json");

async function main() {
  const [universities, faculties, departments, courses, pastQuestions] =
    await Promise.all([
      prisma.university.findMany({ orderBy: { id: "asc" } }),
      prisma.faculty.findMany({ orderBy: { id: "asc" } }),
      prisma.department.findMany({ orderBy: { id: "asc" } }),
      prisma.course.findMany({ orderBy: { id: "asc" } }),
      prisma.pastQuestion.findMany({ orderBy: { id: "asc" } }),
    ]);

  const bundle = { universities, faculties, departments, courses, pastQuestions };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(bundle));

  const stat = fs.statSync(OUT_FILE);
  console.log("[export-seed-bundle] wrote", OUT_FILE);
  console.log(
    "[export-seed-bundle] size:",
    (stat.size / (1024 * 1024)).toFixed(2),
    "MB",
  );
  console.log("[export-seed-bundle] counts:", {
    universities: universities.length,
    faculties: faculties.length,
    departments: departments.length,
    courses: courses.length,
    pastQuestions: pastQuestions.length,
  });

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
