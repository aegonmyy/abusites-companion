/**
 * The model is told to avoid LaTeX/backslashes in JSON string values, but
 * isn't 100% reliable about it (observed: "$\text{CO}_2$" inside a
 * key_concepts string, an invalid JSON escape that breaks JSON.parse
 * outright). Retry once with stray backslashes escaped before giving up —
 * a lone backslash not followed by a valid JSON escape char (" \ / b f n r
 * t u) is doubled so it round-trips as a literal backslash.
 */
export function parseModelJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const repaired = raw.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
    return JSON.parse(repaired);
  }
}
