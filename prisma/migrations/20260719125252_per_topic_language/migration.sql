-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_notes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "raw_text" TEXT,
    "summary" TEXT,
    "key_concepts" TEXT,
    "segments_json" TEXT,
    "depth_preference" TEXT NOT NULL DEFAULT 'standard',
    "language" TEXT NOT NULL DEFAULT 'english',
    "quiz_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_notes" ("created_at", "depth_preference", "id", "key_concepts", "quiz_json", "raw_text", "segments_json", "source_type", "summary", "title") SELECT "created_at", "depth_preference", "id", "key_concepts", "quiz_json", "raw_text", "segments_json", "source_type", "summary", "title" FROM "notes";
DROP TABLE "notes";
ALTER TABLE "new_notes" RENAME TO "notes";
CREATE TABLE "new_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "language" TEXT NOT NULL DEFAULT 'english',
    "model" TEXT NOT NULL DEFAULT 'gemma4:e2b',
    "temperature" REAL,
    "token_budget" INTEGER,
    "model_source" TEXT NOT NULL DEFAULT 'local',
    "cloud_api_key" TEXT,
    "cloud_model" TEXT,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_settings" ("cloud_api_key", "cloud_model", "id", "language", "model", "model_source", "temperature", "token_budget", "updated_at") SELECT "cloud_api_key", "cloud_model", "id", "language", "model", "model_source", "temperature", "token_budget", "updated_at" FROM "settings";
DROP TABLE "settings";
ALTER TABLE "new_settings" RENAME TO "settings";
CREATE TABLE "new_study_syllabi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "intake_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "units_json" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'english',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "study_syllabi_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "study_intakes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_study_syllabi" ("created_at", "goal", "id", "intake_id", "topic", "units_json") SELECT "created_at", "goal", "id", "intake_id", "topic", "units_json" FROM "study_syllabi";
DROP TABLE "study_syllabi";
ALTER TABLE "new_study_syllabi" RENAME TO "study_syllabi";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
