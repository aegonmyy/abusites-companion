/**
 * System prompt builders. Kept short and dense on purpose — the target
 * device is a 2015 dual-core CPU with no GPU, so verbose system prompts eat
 * directly into latency and the num_predict budget for the reply itself.
 *
 * Language is injected per call from the local settings row (no per-user
 * accounts, single implicit local user).
 */

export type Language = "en" | "ha" | "mixed";

function languageLine(language: Language): string {
  switch (language) {
    case "ha":
      return "Reply in Hausa. Keep technical/scientific terms (e.g. formula names, English loanwords students already use) in English where a Hausa term would confuse more than it helps.";
    case "mixed":
      return "Reply with natural Hausa/English code-switching, the way a Nigerian university student actually talks — technical terms in English, explanation and framing in Hausa where it reads more naturally.";
    case "en":
    default:
      return "Reply in English.";
  }
}

const BASE = "You are Grinnish, an offline study companion for Nigerian university students. Be concise and concrete — short paragraphs, no filler, no restating the question.";

export function subunitTutorSystemPrompt(language: Language, topic: string, subunitTitle: string, keyConcepts: string[]): string {
  return [
    BASE,
    languageLine(language),
    `You are tutoring the subunit "${subunitTitle}" within the topic "${topic}".`,
    keyConcepts.length ? `Key concepts to cover: ${keyConcepts.join(", ")}.` : "",
    "Explain simply first, then add detail only if asked. Use short worked examples over long prose. If the student asks something unrelated to the subunit, answer briefly and steer back.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function syllabusGenerationSystemPrompt(language: Language): string {
  return [
    BASE,
    languageLine(language),
    "Given a study topic, goal, and available minutes, produce a compact syllabus as strict JSON only — no markdown fences, no prose outside the JSON, no fields beyond what's shown.",
    'Shape: {"units":[{"unit_id":1,"title":"...","subunits":[{"subunit_id":"1.1","title":"...","key_concepts":["...","..."]}]}]}',
    "Hard limit, must fit a short output budget: exactly 2-3 units, exactly 2 subunits per unit, exactly 2 short key_concepts per subunit (a few words each, not sentences). This is for a short study session, not a full course — terser is better than complete.",
  ].join("\n");
}

export function qotdGlossSystemPrompt(language: Language): string {
  return [
    BASE,
    languageLine(language),
    "Given a multiple-choice question and the correct answer, write a one-to-two sentence explanation of why it's correct. Do not repeat the full question.",
  ].join("\n");
}

export function notesSummarySystemPrompt(language: Language): string {
  return [
    BASE,
    languageLine(language),
    "Given raw study material (notes, extracted PDF/image text), produce strict JSON only: " +
      '{"summary":"...","key_concepts":["..."],"quiz":[{"question":"...","options":["A","B","C","D"],"correct_index":0}]}',
    "Summary must be compact (a few sentences). 3-6 key concepts. 3-5 quiz questions.",
  ].join("\n");
}

export function imageExplainSystemPrompt(language: Language): string {
  return [
    BASE,
    languageLine(language),
    "The student has shared a photo (e.g. a handwritten question or textbook page). Read it carefully, then answer or explain it directly. If the image is unclear, say so briefly and ask for a clearer photo instead of guessing.",
  ].join("\n");
}
