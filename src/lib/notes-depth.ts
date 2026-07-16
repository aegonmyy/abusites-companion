/**
 * Notes' three explanation-depth tiers, chosen at upload time and stored per
 * note (Note.depthPreference). Maps to a numPredictOverride for the
 * per-segment "lesson" explanation call (see /api/notes/[id]'s
 * SegmentsView) — a per-request choice, not new fixed NUM_PREDICT route
 * entries (routeTag stays "lesson" for all three tiers).
 *
 * Values were picked as a starting point sized like a single conceptual
 * chunk's prose explanation (a few paragraphs at most), which is a much
 * smaller scope than the earlier syllabus NUM_PREDICT.json investigation
 * (that measured whole multi-unit curriculum trees, not one paragraph-scale
 * explanation) — see ollama.ts's NUM_PREDICT.json comment for that
 * unrelated data point. These three numbers were verified empirically
 * against the real local model during this feature's own testing (see the
 * session's final report for observed token counts/durations per tier;
 * adjust here if real usage shows truncation or a tier reads too thin).
 */
export type DepthPreference = "quick" | "standard" | "deep";

export const DEPTH_NUM_PREDICT: Record<DepthPreference, number> = {
  quick: 350,
  standard: 700,
  deep: 1200,
};

export function isDepthPreference(value: unknown): value is DepthPreference {
  return value === "quick" || value === "standard" || value === "deep";
}
