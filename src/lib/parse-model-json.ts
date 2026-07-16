/**
 * Small local models (gemma4:e2b) are told to emit clean JSON but aren't
 * reliable about it. Three observed failure modes break JSON.parse outright:
 *
 *  1. Stray backslashes — e.g. "$\text{CO}_2$" inside a key_concepts string
 *     ("\t" is a valid JSON escape, "\x" is not). A lone backslash not
 *     followed by a valid escape char (" \ / b f n r t u) must be doubled.
 *  2. Raw control characters inside string values — e.g. a literal newline
 *     or tab the model wrote inside a "title". JSON strings may not contain
 *     unescaped control chars; the parser reports "Unterminated string".
 *  3. Trailing commas before } or ].
 *
 * `repairModelJson` walks the text as a minimal state machine (tracking
 * whether it's inside a string literal) so it only escapes control chars and
 * fixes backslashes *inside* strings, and only strips commas *outside* them.
 * `parseModelJson` tries a straight parse first, then the repaired form.
 */
export function repairModelJson(raw: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (inString) {
      if (ch === "\\") {
        const next = raw[i + 1];
        // Valid JSON escape: keep both chars as-is.
        if (next !== undefined && '"\\/bfnrtu'.includes(next)) {
          out += ch + next;
          i++;
        } else {
          // Stray backslash -> escape it so it round-trips as a literal.
          out += "\\\\";
        }
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      // Escape raw control characters that JSON forbids inside strings.
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        if (ch === "\n") out += "\\n";
        else if (ch === "\r") out += "\\r";
        else if (ch === "\t") out += "\\t";
        else out += "\\u" + code.toString(16).padStart(4, "0");
        continue;
      }
      out += ch;
      continue;
    }

    // Outside a string.
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    // Strip a trailing comma before a closing bracket/brace (skip whitespace).
    if (ch === ",") {
      let j = i + 1;
      while (j < raw.length && /\s/.test(raw[j])) j++;
      if (raw[j] === "}" || raw[j] === "]") continue;
    }
    out += ch;
  }
  return out;
}

export function parseModelJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(repairModelJson(raw));
  }
}
