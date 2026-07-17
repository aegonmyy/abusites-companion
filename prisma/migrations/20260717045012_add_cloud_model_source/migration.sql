-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "language" TEXT NOT NULL DEFAULT 'en',
    "model" TEXT NOT NULL DEFAULT 'gemma4:e2b',
    "temperature" REAL,
    "token_budget" INTEGER,
    "model_source" TEXT NOT NULL DEFAULT 'local',
    "cloud_api_key" TEXT,
    "cloud_model" TEXT,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_settings" ("id", "language", "model", "temperature", "token_budget", "updated_at") SELECT "id", "language", "model", "temperature", "token_budget", "updated_at" FROM "settings";
DROP TABLE "settings";
ALTER TABLE "new_settings" RENAME TO "settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
