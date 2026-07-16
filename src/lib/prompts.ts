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

/**
 * Adapted from Grinnish's original syllabus prompt (recovered from its
 * deleted pr.md via git history) — a curriculum-design prompt with no
 * unit/subunit count cap at all ("continue until the topic is fully
 * covered", "avoid large conceptual jumps"). An earlier session here
 * replaced this with a hard 2-3 unit / 2 subunit / 2 key-concept cap purely
 * as a JSON-reliability workaround for the small local model — that was
 * never a pedagogical decision, and it's gone now. Reliability is instead
 * handled by the strict-JSON / plain-text constraints below (kept from that
 * earlier fix) plus a raised NUM_PREDICT.json budget (see ollama.ts) sized
 * for genuinely thorough output. Deliberately has no concept of a "goal" —
 * the real Grinnish prompt only ever took a topic.
 */
export function syllabusGenerationSystemPrompt(language: Language): string {
  return [
    BASE,
    languageLine(language),
    "You are a curriculum designer. Break the given topic into a structured learning path, as strict JSON only — no markdown fences, no prose outside the JSON, no fields beyond what's shown.",
    "Divide the topic into sequential units. Each unit should contain several subunits. Each subunit should introduce only one or two key ideas. Order must progress from foundational concepts to advanced ones — avoid large conceptual jumps. Continue until the topic is fully covered; do not artificially limit the number of units or subunits.",
    "Do not explain the concepts. Only produce the structure.",
    'Shape: {"topic":"...","units":[{"unit_id":1,"title":"...","description":"short description of the unit","subunits":[{"subunit_id":"1.1","title":"...","key_concepts":["concept1","concept2"],"prerequisites":[]}]}]}',
    '"prerequisites" on a subunit lists the subunit_id(s) (e.g. "1.1") of subunits that must be understood first; empty array if none.',
    "Plain text only inside every JSON string value: no LaTeX, no backslashes, no markdown. Spell things out (e.g. \"CO2\" not \"\\text{CO}_2\") — this must be valid JSON that a strict parser can read.",
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

/** Same JSON contract as notesSummarySystemPrompt, but the source is a photo
 * (textbook page, handwritten notes) instead of pasted text. */
export function notesSummaryFromImageSystemPrompt(language: Language): string {
  return [
    BASE,
    languageLine(language),
    "The student has shared a photo of study material (textbook page, handwritten notes, slide). Read the text in the image carefully, then produce strict JSON only: " +
      '{"summary":"...","key_concepts":["..."],"quiz":[{"question":"...","options":["A","B","C","D"],"correct_index":0}]}',
    "Summary must be compact (a few sentences). 3-6 key concepts. 3-5 quiz questions. If the image is unreadable, return a summary saying so and an empty key_concepts/quiz array — do not invent content.",
    "Plain text only inside every JSON string value: no LaTeX, no backslashes, no markdown.",
  ].join("\n");
}

/**
 * Notes' fast structure call (routeTag "json"). Mirrors
 * syllabusGenerationSystemPrompt's shape exactly: cheap, shallow, a table of
 * contents only — titles + one-line previews, never the actual deep
 * explanation (that's notesSegmentExplanationSystemPrompt, generated later,
 * on demand, per segment). Called "segments" rather than Study mode's
 * "subunits" so the two features' data never get confused in code/schema.
 */
export function notesSegmentSplitSystemPrompt(language: Language): string {
  return [
    BASE,
    languageLine(language),
    "Given raw study material (notes, extracted PDF/image text), split it into conceptual segments — one segment per distinct idea or topic the material actually covers. Do not explain the concepts, only identify and title them; a one-line preview per segment, not the full content.",
    "Return strict JSON only — no markdown fences, no prose outside the JSON.",
    'Shape: {"title":"short title for the whole document","segments":[{"segment_id":"1","title":"...","summary":"one-line preview of what this segment covers"}]}',
    "Segment count should match the material's actual structure: a short single-topic note may need only 2-3 segments, a longer multi-topic document more — never force a split that isn't really there, and never lump clearly distinct ideas into one segment.",
    "Plain text only inside every JSON string value: no LaTeX, no backslashes, no markdown.",
  ].join("\n");
}

/** Same JSON contract as notesSegmentSplitSystemPrompt, but the source is a
 * photo (textbook page, handwritten notes) instead of pasted/extracted text. */
export function notesSegmentSplitFromImageSystemPrompt(language: Language): string {
  return [
    BASE,
    languageLine(language),
    "The student has shared a photo of study material (textbook page, handwritten notes, slide). Read the text in the image carefully, then split it into conceptual segments — one segment per distinct idea or topic. Do not explain the concepts, only identify and title them.",
    "Return strict JSON only — no markdown fences, no prose outside the JSON.",
    'Shape: {"title":"short title for the whole document","segments":[{"segment_id":"1","title":"...","summary":"one-line preview of what this segment covers"}]}',
    "If the image is unreadable, return a single segment titled \"Unreadable image\" with a summary saying so — do not invent content.",
    "Plain text only inside every JSON string value: no LaTeX, no backslashes, no markdown.",
  ].join("\n");
}

export type NoteExplanationDepth = "quick" | "standard" | "deep";

/** Per-depth instruction text. Previously the three tiers shared identical
 * prompt wording and only differed by numPredictOverride (350/700/1200) —
 * measured in testing to rarely matter, since the model often naturally
 * stops around 300-450 tokens regardless of the cap (a real ceiling, not a
 * target). Depth now comes from what the model is actually asked to do,
 * with the token cap kept only as a safety ceiling behind it. */
const DEPTH_INSTRUCTION: Record<NoteExplanationDepth, string> = {
  quick:
    "Keep this brief: 2-4 sentences covering just the core idea. Skip examples and side detail unless truly essential to understanding it.",
  standard:
    "Give a clear, real explanation: define the idea, explain why it matters, and include one short example or illustration if it helps. A student should come away actually understanding it, not just recognizing the term.",
  deep:
    "Go further than a standard explanation: define the idea, explain the underlying mechanism in detail, include a worked example or concrete illustration, address a common misconception or edge case, and explain how this segment connects to the segments before and after it in the document.",
};

/**
 * Notes' on-demand deep-explanation call (routeTag "lesson", streamed),
 * generated once per segment when the student opens it — mirrors
 * subunitTutorSystemPrompt's role exactly, but produces a single thorough
 * explanation rather than a back-and-forth tutoring turn.
 *
 * `sourceExcerpt` grounds the explanation in the student's actual uploaded
 * material rather than the model's own background knowledge of a topic
 * implied by the segment title — a real gap found in testing: the prompt
 * used to *say* "the material excerpt that follows" while no excerpt was
 * ever actually sent, so explanations could drift from what the student
 * submitted. Capped by the caller to stay well inside num_ctx (4096) even
 * for a long paste; the instruction below tells the model to use only the
 * part relevant to this segment; ignore the rest.
 */
export function notesSegmentExplanationSystemPrompt(
  language: Language,
  documentTitle: string,
  segmentTitle: string,
  segmentSummary: string,
  depth: NoteExplanationDepth,
  sourceExcerpt: string,
): string {
  return [
    BASE,
    languageLine(language),
    `You are explaining one segment of a document titled "${documentTitle}".`,
    `Segment: "${segmentTitle}" — ${segmentSummary}`,
    DEPTH_INSTRUCTION[depth],
    "This should read like a real explanation a student could learn from, not a compact summary.",
    sourceExcerpt
      ? `Base the explanation on the student's own source material below — use only the part of it relevant to this segment, ignore unrelated parts, and do not invent details the material doesn't support:\n<<<\n${sourceExcerpt}\n>>>`
      : "No source excerpt was available for this document — explain the segment from its title and summary as accurately and honestly as you can, without inventing specifics the student didn't provide.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Notes' deferred quiz call (routeTag "json"), triggered explicitly by the
 * "Generate quiz" action rather than always at upload time — moving WHEN
 * this runs, not what it produces. Same quiz JSON shape the app already
 * knows how to render/score (see NoteDetailPage's quiz block), preserved
 * verbatim from the old notesSummarySystemPrompt's "quiz" field.
 */
export function notesQuizSystemPrompt(language: Language): string {
  return [
    BASE,
    languageLine(language),
    "Given raw study material (notes, extracted PDF/image text), produce strict JSON only: " +
      '{"quiz":[{"question":"...","options":["A","B","C","D"],"correct_index":0}]}',
    "3-5 quiz questions covering the material's distinct ideas, not just one part of it.",
  ].join("\n");
}

export function notesChatSystemPrompt(language: Language, title: string, summary: string, keyConcepts: string[]): string {
  return [
    BASE,
    languageLine(language),
    `You are answering follow-up questions about a saved note titled "${title}".`,
    `Note summary: ${summary}`,
    keyConcepts.length ? `Key concepts: ${keyConcepts.join(", ")}.` : "",
    "Answer using this note as context. Explain simply, short worked examples over long prose. If asked something the note doesn't cover, say so briefly, then answer anyway if you can.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Study-mode-only side call, fired automatically after a tutor response
 * finishes (both the initial auto-teach and any follow-up chat reply — see
 * SyllabusView.tsx). Adapted from a real feature in the reference project
 * (recovered from its deleted pr.md prompt file), but routed through this
 * app's own single local model/adapter (routeTag "json", gemma4:e2b via
 * /api/llm) instead of the reference project's separate cloud model pool —
 * this app has no such infrastructure and isn't building one for this.
 * Failure of this call must never surface to the user; see the try/catch
 * around its call site in SyllabusView.tsx.
 */
export function prereqDetectionSystemPrompt(language: Language): string {
  return [
    BASE,
    languageLine(language),
    "You are a prerequisite detector. Read the tutor response below and identify any concepts the student might not know yet that are likely prerequisites for understanding it.",
    'Return ONLY strict JSON in this exact shape, no markdown fences, no prose outside the JSON: {"missing_prerequisites":[{"concept":"...","prompt":"..."}]}',
    "Each \"prompt\" must be a short, simple question that would help the learner fill that specific gap. If nothing is missing, return an empty array. Keep the list short — at most 3 items.",
  ].join("\n");
}
