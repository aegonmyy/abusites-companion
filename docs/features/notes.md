# Notes

Notes takes whatever a student gives it, pasted text, an uploaded PDF, or a
photo of a page, and turns it into a structured, walkable set of segments
with on-demand explanations and an optional quiz.

## Three ways in, one shape out

Pasted text goes straight to the model. A PDF goes through
`src/lib/pdf-extract.ts` (pdfjs-dist, entirely local, see
`docs/offline-guarantees.md`) first to pull out real text, capped by
default at 6000 characters (`DEFAULT_MAX_EXTRACTED_CHARS`), sized for what
a 4096-token context can actually hold alongside the rest of the prompt.
A photo skips text extraction entirely and goes to the model as an image,
Gemma reads it directly, no separate OCR step.

All three converge on the same structural call, splitting the material
into segments. Pasted/extracted text uses
`notesSegmentSplitSystemPrompt()`, a photo uses
`notesSegmentSplitFromImageSystemPrompt()`, both `routeTag: "json"`, both
producing the exact same shape: a document title plus a list of
`{segment_id, title, summary}`. Titles and previews only, not the actual
explanation content, that's generated later, lazily.

## Segments are a table of contents, not the content

The split call is intentionally shallow: identify and title the distinct
ideas in the material, don't explain any of them yet. The actual deep
explanation for a given segment, `notesSegmentExplanationSystemPrompt()`,
`routeTag: "lesson"`, streamed, only runs when the student actually opens
that segment. This keeps the expensive part of the work proportional to
what a student actually looks at rather than generating five deep
explanations up front when the student might only read two.

Each explanation is grounded in the student's own source text
(`sourceExcerpt`), not just the segment's title and one-line summary. This
matters: an earlier version of the prompt claimed to reference "the
material excerpt that follows" while no excerpt was actually being sent,
so explanations could quietly drift from what the student actually
submitted toward whatever the model already knew about a topic implied by
the title. Once generated, an explanation is saved to
`NoteSegmentExplanation` and isn't regenerated on a later visit.

## Depth is a real instruction, not just a token cap

Quick, standard, and deep used to share identical prompt wording and only
differ by how many tokens they were allowed, 350/700/1200. In testing, the
model often stopped naturally around 300 to 450 tokens regardless of the
cap, so the cap alone wasn't actually controlling depth. `DEPTH_INSTRUCTION`
in `prompts.ts` now gives each tier genuinely different instructions,
"quick" explicitly asks for 2 to 4 sentences and to skip examples, "deep"
asks for the underlying mechanism, a worked example, a common
misconception, and how the segment connects to its neighbors. The token
cap is still there as a safety ceiling, it's just not doing the actual work
of producing different depth anymore.

## Two different chat prompts, and why

There are two separate follow-up chat prompts in `prompts.ts`,
`notesChatSystemPrompt()` for legacy notes and `notesSegmentChatSystemPrompt()`
for current, segments-shaped notes. This isn't duplication for its own
sake, see `docs/data-model.md`'s section on `Note`'s legacy fields for why
both shapes of note still exist. A segments-shaped note gets one scoped
chat conversation per segment (a tab per segment in `SegmentsView.tsx`),
grounded in both that segment's already-generated explanation and the raw
source excerpt. A legacy note gets one chat scoped to the whole document
instead, grounded in its `summary`/`keyConcepts` plus source excerpt. Check
which shape a given note actually is before assuming a chat-prompt change
applies to both.

## Quiz generation is deferred, not automatic

Quizzes used to generate automatically at note creation time, as part of
the original single-call summary+quiz shape. That's gone, `notesQuizSystemPrompt()`
only runs when a student explicitly clicks "Generate quiz", `routeTag:
"json"`. This is one of the few `"json"` calls that does apply a language
line, unlike syllabus or segment-split generation, because quiz questions
are real content a student reads and answers, not structural titles. The
comment in `prompts.ts` flags this combination (Hausa plus strict JSON) as
not as thoroughly tested as the syllabus case, worth keeping an eye on if
quiz JSON ever starts breaking in Hausa mode.
