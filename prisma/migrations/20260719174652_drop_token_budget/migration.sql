/*
  Warnings:

  - You are about to drop the column `token_budget` on the `settings` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "language" TEXT NOT NULL DEFAULT 'english',
    "model" TEXT NOT NULL DEFAULT 'gemma4:e2b',
    "temperature" REAL,
    "model_source" TEXT NOT NULL DEFAULT 'local',
    "cloud_api_key" TEXT,
    "cloud_model" TEXT,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_settings" ("cloud_api_key", "cloud_model", "id", "language", "model", "model_source", "temperature", "updated_at") SELECT "cloud_api_key", "cloud_model", "id", "language", "model", "model_source", "temperature", "updated_at" FROM "settings";
DROP TABLE "settings";
ALTER TABLE "new_settings" RENAME TO "settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
