import type { StartLanguage } from "./prompts";

/** No "use client" here on purpose — used by both the client hook
 * (language-mode.ts) and the /api/settings route (server), so it can't
 * carry a client-boundary directive.
 *
 * Anything that isn't "hausa" is treated as "english" — covers a fresh
 * install (DB default is "english"), a pre-existing local DB row still
 * holding a stale "en"/"ha"/"mixed" value from an earlier version of this
 * mechanism, and any future bad input, all without a migration touching
 * old rows. */
export function sanitizeStartLanguage(value: unknown): StartLanguage {
  return value === "hausa" ? "hausa" : "english";
}
