/**
 * Chunking + merge/dedup for the student PDF-to-CBT pipeline's extraction
 * stage (Stage 2). A full past paper's extracted text easily exceeds the
 * local model's 4096-token context, so it's split into chunks, each
 * extracted separately, then merged.
 *
 * Splitting is done at question-number boundaries where possible, never
 * mid-question — a question split across two chunks would be extracted
 * wrong (or dropped) from both. The numbered-question pattern (" 1. ",
 * " 2. " ... " 10. ") is how real exam text reads once flattened by
 * pdfjs; if that pattern isn't found (unusual formatting), it falls back to
 * fixed-size character windows with overlap, and dedup cleans up the
 * boundary duplicates the overlap creates.
 *
 * Merge dedups by normalized question text, exactly like Grinnish's
 * pdf-to-db merge_json step — chunk overlap and repeated headers can
 * otherwise surface the same question twice.
 */

export type ExtractedQuestion = {
  question_text: string;
  options: string[];
};

/** ~3 chars per token is a safe lower bound for English; a 2400-char chunk
 * leaves comfortable room under num_ctx 4096 for the system prompt plus the
 * JSON the model has to generate back. */
const DEFAULT_MAX_CHUNK_CHARS = 2400;

/** Hard cap on questions per chunk, independent of the char budget. This is
 * the real bottleneck: extraction time and output-JSON size scale with the
 * *number* of questions, not the input length. Measured directly — 10
 * questions in one call took ~40s; 25 dense questions in one call ran past
 * 7 minutes (the JSON output alone blew the practical generation budget).
 * Capping at 8 keeps each chunk's call bounded to roughly the 10-question
 * timing, so a big paper becomes several short calls (with a progress bar)
 * rather than one that appears to hang. A short paper still fits in a
 * single chunk. */
const DEFAULT_MAX_QUESTIONS_PER_CHUNK = 8;

/** Matches a question-number boundary: whitespace (or string start) then
 * 1-3 digits, a dot, then whitespace. Used with a lookahead split so the
 * number stays attached to its question. Requires the preceding char to be
 * whitespace/start so "10.5" mid-sentence doesn't count as a boundary. */
const QUESTION_BOUNDARY = /(?=(?:^|\s)\d{1,3}\.\s)/g;

export function chunkExamText(
  text: string,
  maxChars: number = DEFAULT_MAX_CHUNK_CHARS,
  maxQuestionsPerChunk: number = DEFAULT_MAX_QUESTIONS_PER_CHUNK,
): string[] {
  const trimmed = text.trim();

  // Preferred path: split into per-question segments, then greedily pack,
  // starting a new chunk when EITHER the char budget OR the per-chunk
  // question cap is hit.
  const segments = trimmed.split(QUESTION_BOUNDARY).map((s) => s.trim()).filter(Boolean);
  const looksSegmented = segments.length >= 3; // at least a few real questions

  if (looksSegmented) {
    const chunks: string[] = [];
    let current = "";
    let currentCount = 0;
    for (const seg of segments) {
      const wouldOverflowChars = current && current.length + seg.length + 1 > maxChars;
      const wouldOverflowCount = currentCount >= maxQuestionsPerChunk;
      if (current && (wouldOverflowChars || wouldOverflowCount)) {
        chunks.push(current);
        current = seg;
        currentCount = 1;
      } else {
        current = current ? `${current}\n${seg}` : seg;
        currentCount += 1;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  // Fallback (no numbered-question structure found): fixed windows with
  // overlap; dedup in mergeExtracted handles the questions that land in
  // both windows. Can't cap by question count here — there's no reliable
  // boundary to count — so this leans on the char budget alone.
  if (trimmed.length <= maxChars) return [trimmed];
  const overlap = Math.floor(maxChars * 0.1);
  const chunks: string[] = [];
  for (let i = 0; i < trimmed.length; i += maxChars - overlap) {
    chunks.push(trimmed.slice(i, i + maxChars));
  }
  return chunks;
}

function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Merges the per-chunk extraction results, dropping questions with empty
 * text or fewer than two options, and deduping by normalized question
 * text. Order of first appearance is preserved. */
export function mergeExtracted(perChunk: ExtractedQuestion[][]): ExtractedQuestion[] {
  const merged: ExtractedQuestion[] = [];
  const seen = new Set<string>();
  for (const chunk of perChunk) {
    for (const q of chunk) {
      const text = String(q?.question_text ?? "").trim();
      const options = Array.isArray(q?.options)
        ? q.options.map((o) => String(o).trim()).filter(Boolean)
        : [];
      if (!text || options.length < 2) continue;
      const key = normalizeKey(text);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ question_text: text, options });
    }
  }
  return merged;
}
