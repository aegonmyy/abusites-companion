# Past questions and CBT

This feature has two halves: a seeded catalog of real past exam questions
students can practice against in a timed CBT, and a pipeline that lets a
student upload their own past-paper PDF and turns it into the exact same
kind of playable course.

## The seeded catalog

`University`, `Faculty`, `Department`, `Course`, and `PastQuestion` mirror
five tables from a reference Supabase project (see `docs/data-model.md`).
`npm run seed` loads them from a git-committed bundle,
`prisma/seed-bundle/catalog.json`, so a normal install gets the full real
catalog, around 81 courses and 6,800 past questions across two
universities, with no credentials and no network access needed. The app
never writes to `University`, `Faculty`, or `Department` at runtime, this
data is read-only from the app's point of view.

A CBT session picks a course, lets the student choose how many questions
and how much time per question, then scores the attempt
(`CbtAttempt`) and lets them review each answer afterward.

## AI explanations, not just the static answer key

Two places use `explainQuestionSystemPrompt()` (question of the day, and
past-questions' question list) and one uses
`cbtQuestionExplanationSystemPrompt()` (CBT review), both `routeTag:
"gloss"` or `"lesson"`, streamed, both live model calls rather than static
pre-written text. The point isn't to just restate the seeded
`explanation`/`details` field that already exists for a question, it's
told what the static explanation already says (if any) so it can add a
genuinely different angle, why the wrong options are tempting, a different
way to think about the problem, rather than repeating what's already on
screen.

## The PDF-to-CBT upload pipeline

This is the more involved half. A student uploads their own past-paper
PDF, and the pipeline turns it into a real `Course` (`isCustom: true`) with
real `PastQuestion` rows, no different from the seeded catalog once it's
saved. It runs entirely client-orchestrated, `src/app/past-questions/upload/page.tsx`
drives every stage, but every model call still goes through the same
`/api/llm` route everything else uses.

**Stage 1, extraction.** `src/app/api/past-questions/extract-pdf/route.ts`
runs `extractPdfText()` server-side (the same pdfjs-dist path Notes uses),
but with a much larger character cap, 60,000 instead of Notes' 6,000,
because a full exam has to be read whole rather than truncated to the
first few questions. Text-based PDFs only for now, a scanned image PDF
with no real text layer returns a clear 422 rather than silently producing
nothing.

**Stage 2, chunking and question extraction.** A full exam's text easily
exceeds the model's context, so `src/lib/exam-chunk.ts`'s `chunkExamText()`
splits it at question-number boundaries before sending each chunk through
`pastQuestionExtractionSystemPrompt()`, `routeTag: "json"`. This step has a
real, tested finding behind it: chunking was originally sized only by
character count, and a 25-question paper whose text happened to be short
but dense fit entirely in one chunk, extracting all 25 questions in a
single call ran past 7 minutes before being killed. The actual bottleneck
is output size, not input size, extraction time scales with how many
questions the model has to produce JSON for, not how much text it has to
read. The fix was capping each chunk at 8 questions regardless of
character count (`maxQuestionsPerChunk`), which turned that same 25-question
paper into 4 bounded calls totaling about 74 seconds, extracting all 25
questions with zero loss.

`mergeExtracted()` then dedupes across chunks by normalized question text
(lowercased, whitespace-collapsed), dropping anything with empty text or
fewer than two options, chunk overlap or repeated exam headers can
otherwise surface the same question twice.

**Stage 3, answering.** Each extracted question goes through
`pastQuestionAnswerSystemPrompt()` individually, sequentially, one local
model, `routeTag: "json"`. The correct answer here is the model's own best
guess, most real past papers ship with no answer key at all, so this is
explicitly marked AI-generated in the UI, a study aid, not an authoritative
marking scheme.

**Stage 4, saving.** `src/app/api/past-questions/custom/route.ts` persists
the extracted, answered questions as a new `Course` and its
`PastQuestion` rows inside a single `prisma.$transaction`, clamping option
counts to 5 and defensively clamping `correct_index` into a valid range
even though the answer prompt is told never to return an out-of-range
index.

**After saving**, the student lands back on the Past Questions list, not
directly into a CBT. Their new course shows up under "Your uploads" (see
`Course.isCustom` in `docs/data-model.md`), and from there they choose to
open it, review the questions, or start a CBT, exactly like any seeded
course. Uploading is about adding to the list, not forcing immediate
practice.

## Options up to 5, not just 4

`PastQuestion.optionE` exists specifically because Nigerian exam papers
commonly use A through E, not just A through D like the seeded catalog.
See `docs/data-model.md` for why this is a nullable fifth column rather
than a schema reshape, and why the seeded catalog is unaffected.
