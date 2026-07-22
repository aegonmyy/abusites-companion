-- AlterTable
ALTER TABLE "past_questions" ADD COLUMN "option_e" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_courses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "department_id" TEXT,
    "university_id" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME,
    "updated_at" DATETIME,
    CONSTRAINT "courses_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "courses_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_courses" ("code", "created_at", "department_id", "id", "title", "university_id", "updated_at") SELECT "code", "created_at", "department_id", "id", "title", "university_id", "updated_at" FROM "courses";
DROP TABLE "courses";
ALTER TABLE "new_courses" RENAME TO "courses";
CREATE INDEX "courses_department_id_idx" ON "courses"("department_id");
CREATE INDEX "courses_university_id_idx" ON "courses"("university_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
