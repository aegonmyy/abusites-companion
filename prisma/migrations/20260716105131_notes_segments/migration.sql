-- CreateTable
CREATE TABLE "note_segment_explanations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "note_id" TEXT NOT NULL,
    "segment_id" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "note_segment_explanations_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "quiz_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_notes" ("created_at", "id", "key_concepts", "quiz_json", "raw_text", "source_type", "summary", "title") SELECT "created_at", "id", "key_concepts", "quiz_json", "raw_text", "source_type", "summary", "title" FROM "notes";
DROP TABLE "notes";
ALTER TABLE "new_notes" RENAME TO "notes";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "note_segment_explanations_note_id_segment_id_key" ON "note_segment_explanations"("note_id", "segment_id");
