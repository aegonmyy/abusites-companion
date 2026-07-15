import { PrismaClient } from "../../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Single implicit local user, no auth. One SQLite file at ./data/grinnish.db,
// accessed exclusively through the better-sqlite3 driver adapter (Windows
// prebuilt binaries confirmed; avoids per-platform native query engine
// binaries in the client).
const DATABASE_URL = process.env.DATABASE_URL ?? "file:./data/grinnish.db";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const adapter = new PrismaBetterSqlite3({ url: DATABASE_URL });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
