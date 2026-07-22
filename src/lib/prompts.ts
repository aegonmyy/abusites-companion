/**
 * System prompt builders. Kept short and dense on purpose — the target
 * device is a 2015 dual-core CPU with no GPU, so verbose system prompts eat
 * directly into latency and the num_predict budget for the reply itself.
 *
 * Language is chosen per-topic (Study mode intake) or per-note (new-note
 * screen), not app-wide — captured at the one real moment intent exists,
 * default "english". A separate Settings-level default (Settings.language)
 * covers the one-shot AI-explain features (QOTD, CBT review, Past-Questions)
 * that have no intake step to ask at.
 *
 * Two different instructions depending on whether there's real student text
 * to read: "generated" content (the initial tutor auto-teach, the initial
 * note-segment explanation) is triggered by a hardcoded English synthetic
 * instruction the student never typed, so there's nothing to adapt to — it
 * gets a fixed instruction matching the chosen start language instead.
 * "followup" content (anything the student actually types in chat) gets a
 * dynamic instruction instead, built fresh per call from the student's
 * actual last message — see followUpLanguageLine below for why this isn't
 * a static string.
 *
 * The Hausa wording below is not the first draft — a vaguer version
 * ("code-switch naturally, the way a student talks") was tested directly
 * against the real local model across 3 tasks (tutor explain, note-segment
 * explain, quiz-answer gloss) and produced Nigerian Pidgin English every
 * single time ("wahala", "I go explain") — zero real Hausa, 0/3 tasks. The
 * fix wasn't longer wording, it was specificity: naming actual Hausa
 * function words (kuma, amma, domin, wannan, misali, yadda, idan) and
 * explicitly stating Pidgin isn't Hausa. That alone flipped it to fluent,
 * grammatical Hausa on 3/3 tasks, zero Pidgin. Re-verify with the same
 * methodology if this wording is ever changed — don't assume a
 * reasonable-sounding instruction actually produces Hausa without testing.
 *
 * followUpLanguageLine's dynamic-detection design is also not the first
 * draft. The original approach was a single static instruction telling the
 * model to check the last message's language itself and switch accordingly
 * ("continue in whatever language the student's most recent message is
 * actually written in..."). Tested directly against the real model with
 * real mid-conversation switches (English topic then a Hausa follow-up, and
 * the reverse): it failed constantly, not occasionally. Stronger, more
 * explicit wording with worked examples fixed one direction (Hausa-context
 * to English) but then broke the other direction (English-context to
 * Hausa) 5/5 trials, regardless of topic — this wasn't a wording problem,
 * it's that asking a 2B-class model to both self-diagnose a language AND
 * act on that diagnosis in one step is unreliable. The fix: don't ask the
 * model to detect the language at all. The app detects it (a cheap regex
 * over common Hausa function words) and gives a direct, unconditional
 * command instead — "the student's message is in Hausa, reply in Hausa" —
 * with nothing left for the model to figure out. Verified 10/10 across
 * both switch directions after this change (5/5 each), versus 0/5 to 5/5
 * inconsistent results across every static-instruction wording tried
 * before it. Re-verify with the same methodology (real mid-conversation
 * switches, both directions, multiple trials — single-shot tests hide real
 * direction-dependent bias) if this is ever changed.
 */

export type StartLanguage = "hausa" | "english";

const HAUSA_GENERATED_LINE =
  "You MUST write your explanation primarily in Hausa. Every sentence should be mostly Hausa words, with only technical/scientific terms (formula names, scientific terms with no common Hausa equivalent) left in English. Do NOT use Nigerian Pidgin English (words like 'wahala', 'I go', 'abeg', 'na so') — Pidgin is not Hausa and is wrong here. Use real Hausa words and grammar: 'kuma' (and), 'amma' (but), 'domin'/'saboda' (because), 'wannan' (this), 'misali' (example), 'yadda' (how), 'idan' (if). Do this regardless of what language any instruction below is written in.";

/** Cheap, deterministic function-word check — good enough to route an
 * instruction, not meant to be a linguistically rigorous classifier. */
function looksHausa(text: string): boolean {
  const hausaMarkers =
    /\b(kuma|amma|domin|saboda|wannan|misali|yadda|idan|shine|kake|kana|yake|tana|yana|zan|zai|muna|mun|mai|ba|kai|ki|za|don|inda|wanda)\b/i;
  return hausaMarkers.test(text);
}

/** For "followup" content (real student-typed text exists) — built fresh
 * per call from the student's actual last message, not a static string.
 * See the doc comment above for why: asking the model to both detect the
 * last message's language and act on it in one step was unreliable, so the
 * app does the (cheap, deterministic) detection instead and gives a direct
 * command with nothing left for the model to figure out. */
function followUpLanguageLine(lastUserMessage: string): string {
  if (looksHausa(lastUserMessage)) {
    return "The student's most recent message is in Hausa. Reply entirely in Hausa now (technical/scientific terms may stay in English), regardless of what language was used earlier in this conversation.";
  }
  return "The student's most recent message is in English. Reply entirely in English now, regardless of what language was used earlier in this conversation.";
}

/** For "generated" content (no real student text to read) — a fixed
 * instruction matching the chosen start language, or no instruction at all
 * for English (the model's natural default already). */
function generatedLanguageLine(start: StartLanguage): string {
  return start === "hausa" ? HAUSA_GENERATED_LINE : "";
}

const BASE = "You are Abusites Companion, an offline study companion for Nigerian university students.";

export function subunitTutorSystemPrompt(
  start: StartLanguage,
  topic: string,
  subunitTitle: string,
  keyConcepts: string[],
  isFollowUp = false,
  lastUserMessage = "",
): string {
  return [
    BASE,
    isFollowUp ? followUpLanguageLine(lastUserMessage) : generatedLanguageLine(start),
    `You are tutoring the subunit "${subunitTitle}" within the topic "${topic}".`,
    keyConcepts.length ? `Key concepts to cover: ${keyConcepts.join(", ")}.` : "",
    "Explain simply first, then add detail. Use short worked examples or long prose where appropriate. If the student asks something unrelated to the subunit, answer briefly and steer back.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Curriculum-design prompt. Caps the syllabus at exactly 3 units x 2
 * subunits (6 subunits total) regardless of topic breadth — a deliberate
 * latency tradeoff, not a pedagogical one. An earlier version of this
 * prompt had no cap at all ("continue until the topic is fully covered"),
 * which produced genuinely thorough syllabi (up to 19 subunits for a broad
 * topic like Photosynthesis) but took 37-73s end to end on the target
 * hardware — too slow, confirmed as a real complaint, not a hypothetical
 * one. Measured directly against the real model before landing on this
 * cap: a softer "at most 10 subunits total" instruction was NOT reliably
 * followed (the model produced 12-17 anyway) and still averaged 51-69s.
 * Only an exact, blunt count ("EXACTLY 3 units... EXACTLY 2 subunits...")
 * got both the count and the latency down reliably — 25-34s across 4 real
 * topics (World War II, Photosynthesis, Organic Chemistry, Limits of a
 * Function), roughly half the old baseline. Small models follow blunt
 * exact numbers far better than "at most N" phrasing — same lesson as the
 * language-switching fix elsewhere in this file. NUM_PREDICT.json (see
 * ollama.ts) was lowered to match — the old 1500-token ceiling sized for
 * unbounded syllabi is now pure dead latency risk for a call that reliably
 * finishes in 250-400 tokens.
 */
// Deliberately no language line here, even if the syllabus's chosen start
// language is Hausa — titles/units/subunits stay English by product
// decision (only the tutoring content
// itself is Hausa-enforced). This also sidesteps a real, tested failure
// mode: forcing Hausa into this call's strict-JSON structural output made
// the model unstable — Hausa needs meaningfully more tokens for the same
// content than English, and even at the full 1500-token budget the JSON
// sometimes broke mid-structure or the model wrote English meta-commentary
// inside the JSON trying to satisfy conflicting constraints. Not a one-line
// fix; see git history if this needs revisiting.
export function syllabusGenerationSystemPrompt(): string {
  return [
    BASE,
    "You are a curriculum designer. Break the given topic into a structured learning path, as strict JSON only — no markdown fences, no prose outside the JSON, no fields beyond what's shown.",
    "Produce EXACTLY 3 units, no more, no fewer. Each unit has EXACTLY 2 subunits, no more, no fewer. That is 6 subunits total for the whole syllabus, always, regardless of how broad the topic is. Pick only the 6 most important subunits — do not try to cover the topic exhaustively. Order units from foundational to advanced.",
    "Do not explain the concepts. Only produce the structure. Each unit description is under 10 words. Each subunit has exactly 1 key concept, not more.",
    'Shape: {"topic":"...","units":[{"unit_id":1,"title":"...","description":"short description of the unit","subunits":[{"subunit_id":"1.1","title":"...","key_concepts":["concept1"],"prerequisites":[]}]}]}',
    '"prerequisites" on a subunit lists the subunit_id(s) (e.g. "1.1") of subunits that must be understood first; empty array if none.',
    "Plain text only inside every JSON string value: no LaTeX, no backslashes, no markdown.",
  ].join("\n");
}

/**
 * Shared on-demand "Explain with AI" call (routeTag "gloss", streamed) for
 * any multiple-choice question with a known correct answer — used by both
 * QuestionOfDayCard and past-questions' QuestionsList. A live alternative to
 * the static pre-written `explanation`/`details` text already baked into
 * the seeded question data. Mirrors the intent of the earlier reference design's real "Explain
 * this" feature (a floating chat widget that called a cloud model for a
 * live explanation on QOTD/CBT/past-questions/bookmarks), but scoped to
 * each calling component rather than recreated as a global widget — that
 * mechanism was bundled with human support-ticket functionality this
 * no-accounts app deliberately doesn't have. Takes the model past a bare
 * "why is this correct" gloss: it's told what the static explanation
 * already said (if any) so it adds a genuinely different angle — why the
 * wrong options are wrong, or a different way to think about it — rather
 * than restating it.
 */
export function explainQuestionSystemPrompt(start: StartLanguage): string {
  return [
    BASE,
    generatedLanguageLine(start),
    "The student is looking at a multiple-choice question they've already answered and wants a live AI explanation, not just the static answer key.",
    "Explain why the correct option is right, and briefly why the other options are wrong or tempting. If a static explanation is given below, don't just restate it — add a genuinely different angle (a different way to think about it, a common mix-up, a quick example) that helps more than the static text alone.",
    "Keep it tight: a short paragraph, not an essay.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Notes' fast structure call (routeTag "json"). Mirrors
 * syllabusGenerationSystemPrompt's shape exactly: cheap, shallow, a table of
 * contents only — titles + one-line previews, never the actual deep
 * explanation (that's notesSegmentExplanationSystemPrompt, generated later,
 * on demand, per segment). Called "segments" rather than Study mode's
 * "subunits" so the two features' data never get confused in code/schema.
 *
 * No language line here, same reasoning as syllabusGenerationSystemPrompt:
 * titles/previews stay English by product decision, and forcing Hausa into
 * this strict-JSON structural output risks the same instability (more
 * tokens needed, JSON breaking under combined constraints) tested and found
 * there — only the deep explanation and chat prompts are Hausa-enforced.
 */
export function notesSegmentSplitSystemPrompt(): string {
  return [
    BASE,
    "Given raw study material (notes, extracted PDF/image text), split it into conceptual segments — one segment per distinct idea or topic the material actually covers. Do not explain the concepts, only identify and title them; a one-line preview per segment, not the full content.",
    "Return strict JSON only — no markdown fences, no prose outside the JSON.",
    'Shape: {"title":"short title for the whole document","segments":[{"segment_id":"1","title":"...","summary":"one-line preview of what this segment covers"}]}',
    "Segment count should match the material's actual structure: a short single-topic note may need only 2-3 segments, a longer multi-topic document more — never force a split that isn't really there, and never lump clearly distinct ideas into one segment.",
    "Plain text only inside every JSON string value: no LaTeX, no backslashes, no markdown.",
  ].join("\n");
}

/** Same JSON contract as notesSegmentSplitSystemPrompt, but the source is a
 * photo (textbook page, handwritten notes) instead of pasted/extracted text. */
export function notesSegmentSplitFromImageSystemPrompt(): string {
  return [
    BASE,
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
  start: StartLanguage,
  documentTitle: string,
  segmentTitle: string,
  segmentSummary: string,
  depth: NoteExplanationDepth,
  sourceExcerpt: string,
): string {
  return [
    BASE,
    generatedLanguageLine(start),
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
const QUIZ_QUESTION_COUNT_MIN = 1;
const QUIZ_QUESTION_COUNT_MAX = 15;

// NOTE: unlike syllabusGenerationSystemPrompt/notesSegmentSplitSystemPrompt,
// this one DOES apply generatedLanguageLine in Hausa mode, even though it's
// also a strict-JSON "json"-route call — quiz questions are real content a
// student reads, not structural titles, so English-only felt wrong here.
// This combination (Hausa + format:"json") was NOT specifically tested the
// way syllabus generation was; if quiz generation shows the same
// JSON-breaking instability found there, this needs the same treatment
// (drop the language line, or raise the token budget further).
export function notesQuizSystemPrompt(start: StartLanguage, questionCount: number = 5): string {
  const count = Math.min(
    QUIZ_QUESTION_COUNT_MAX,
    Math.max(QUIZ_QUESTION_COUNT_MIN, Math.round(questionCount)),
  );
  return [
    BASE,
    generatedLanguageLine(start),
    "Given raw study material (notes, extracted PDF/image text), produce strict JSON only: " +
      '{"quiz":[{"question":"...","options":["A","B","C","D"],"correct_index":0}]}',
    `Produce up to ${count} quiz question${count === 1 ? "" : "s"}, covering the material's distinct ideas as evenly as possible — don't repeatedly test the same one idea just to hit the count.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Legacy-notes-only follow-up chat (routeTag "chat") — used for
 * pre-migration notes that have a real `summary`/`keyConcepts` but no
 * `segments`. `sourceExcerpt` grounds it in the note's actual saved text
 * (same fix as notesSegmentExplanationSystemPrompt below: this used to only
 * receive derived titles/summary, never the real document). New,
 * segments-shaped notes use notesSegmentChatSystemPrompt instead — see
 * SegmentsView.tsx.
 */
export function notesChatSystemPrompt(
  title: string,
  summary: string,
  keyConcepts: string[],
  sourceExcerpt: string = "",
  lastUserMessage: string = "",
): string {
  return [
    BASE,
    // Always genuine student-typed text here (this function only exists
    // for real follow-up chat) — always adaptive, no start-language param.
    followUpLanguageLine(lastUserMessage),
    `You are answering follow-up questions about a saved note titled "${title}".`,
    `Note summary: ${summary}`,
    keyConcepts.length ? `Key concepts: ${keyConcepts.join(", ")}.` : "",
    sourceExcerpt
      ? `The student's own saved source text (use this as ground truth, don't invent details it doesn't support):\n<<<\n${sourceExcerpt}\n>>>`
      : "",
    "Answer using this note as context. Explain simply, short worked examples over long prose. If asked something the note doesn't cover, say so briefly, then answer anyway if you can.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Per-segment follow-up chat (routeTag "chat") for segments-shaped notes —
 * each segment ("tab") in SegmentsView gets its own scoped conversation
 * rather than one chat shared across the whole document. Grounded in both
 * the segment's own already-generated explanation (the strongest available
 * context — it's already been checked against the source once) and a raw
 * source excerpt, same pattern as notesSegmentExplanationSystemPrompt.
 */
export function notesSegmentChatSystemPrompt(
  documentTitle: string,
  segmentTitle: string,
  segmentSummary: string,
  explanation: string,
  sourceExcerpt: string,
  lastUserMessage: string = "",
): string {
  return [
    BASE,
    // Always genuine student-typed text here too — always adaptive, no
    // start-language param.
    followUpLanguageLine(lastUserMessage),
    `You are answering follow-up questions about one segment of a document titled "${documentTitle}".`,
    `Segment: "${segmentTitle}" — ${segmentSummary}`,
    explanation ? `You already explained this segment as follows:\n<<<\n${explanation}\n>>>` : "",
    sourceExcerpt
      ? `The student's own source material for this segment (ground truth, don't invent details it doesn't support):\n<<<\n${sourceExcerpt}\n>>>`
      : "",
    "Answer the student's follow-up using the above as context. Explain using worked examples or long prose where necessary. Stay scoped to this segment unless the student clearly asks about something else.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * General-purpose freeform chat (routeTag "chat", the /chat page) — the
 * only entry point in the app with no scoping context at all (no subunit,
 * no note, no question). Every message here is real student-typed text
 * from the first turn (there's no synthetic auto-teach trigger to open
 * with, unlike Study mode's initial tutor message), so this always uses
 * the adaptive follow-up language line, same as notesChatSystemPrompt /
 * notesSegmentChatSystemPrompt — no StartLanguage param, no Settings-level
 * default language applies here.
 */
export function generalChatSystemPrompt(lastUserMessage: string = ""): string {
  return [
    BASE,
    followUpLanguageLine(lastUserMessage),
    "The student is chatting with you directly, with no specific topic, syllabus, or note attached. Answer whatever they ask as a helpful study assistant — explain concepts, work through problems, or just talk through what they're studying. Explain simply first, then add detail; use short worked examples where useful.",
  ].join("\n");
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
export function prereqDetectionSystemPrompt(start: StartLanguage): string {
  return [
    BASE,
    generatedLanguageLine(start),
    "You are a prerequisite detector. Read the tutor response below and identify any concepts the student might not know yet that are likely prerequisites for understanding it.",
    'Return ONLY strict JSON in this exact shape, no markdown fences, no prose outside the JSON: {"missing_prerequisites":[{"concept":"...","prompt":"..."}]}',
    "Each \"prompt\" must be a short, simple question that would help the learner fill that specific gap. If nothing is missing, return an empty array. Keep the list short — at most 3 items.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * CBT's on-demand "AI explanation" call (routeTag "lesson", streamed),
 * triggered per question from the review-answers screen — one call per
 * question the student explicitly asks about, not a single bulk call for
 * the whole session. The caller sends the full option list, the student's
 * selected letter (or "not answered"), and the correct letter, always the
 * full option list regardless of outcome, so the model can reason about
 * why the tempting wrong options are wrong too, not just the two that
 * mattered for this particular question.
 */
export function cbtQuestionExplanationSystemPrompt(start: StartLanguage): string {
  return [
    BASE,
    generatedLanguageLine(start),
    "You are explaining one question from a student's completed CBT (computer-based test) session. All the options are given, along with the student's answer (or 'not answered') and the correct answer.",
    "If the student's answer matches the correct one: briefly justify why that answer is correct, reinforcing the reasoning rather than just restating the fact.",
    "If the student's answer is wrong or missing: gently and encouragingly teach them, explain why the correct answer is right, and briefly why their own choice (if they made one) was a tempting but incorrect option. No judgment, no scolding, just a fast diagnosis and a clear correction.",
    "Consider all the options given, not only the chosen and correct ones, when explaining what makes the right one right.",
    "Keep it tight: a short paragraph, not an essay.",
  ]
    .filter(Boolean)
    .join("\n");
}
