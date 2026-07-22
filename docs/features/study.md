# Study mode

Study mode takes a topic and a goal, turns it into a small structured
syllabus, and then lets the student walk through each subunit with a
streaming tutor.

## The intake

`StudyIntakeForm.tsx` collects a topic, a goal, how many minutes the
student has, and a short scenario ("revising before a test", that kind of
thing), plus a language choice, English or Hausa, made once here rather
than app-wide. That intake becomes a `StudyIntake` row, and the actual
syllabus generation call uses `syllabusGenerationSystemPrompt()` from
`src/lib/prompts.ts`, `routeTag: "json"`.

## Why every syllabus is exactly 3 units and 2 subunits

This is deliberate, and it wasn't the first version. An earlier prompt had
no cap, "continue until the topic is fully covered", and it produced
genuinely thorough syllabi, up to 19 subunits for something broad like
photosynthesis, but took 37 to 73 seconds end to end on the target
hardware. A softer instruction, "at most 10 subunits", didn't fix it
either, the model produced 12 to 17 subunits anyway and still averaged
around a minute.

Only an exact, blunt count, "EXACTLY 3 units, EXACTLY 2 subunits", got both
the count and the latency down reliably, 25 to 34 seconds across several
real topics tested directly. Titles, unit descriptions, and subunit titles
stay in English regardless of the chosen language, forcing Hausa into this
strict-JSON call was tested and found to make the output unstable. Only
the actual tutoring content that follows is Hausa-enforced.

## The tutor

Each subunit's tutor uses `subunitTutorSystemPrompt()`, `routeTag: "lesson"`,
streamed. The very first message in a subunit is a synthetic auto-teach
trigger the student never actually typed, so it uses
`generatedLanguageLine()` (a fixed instruction matching the syllabus's
chosen language). Every message after that is real student-typed text, so
it switches to `followUpLanguageLine()`, built fresh from whatever the
student actually just wrote. See `docs/model-integration.md` for why that
split exists and what happens if you get it backwards.

## Prerequisite detection

After a tutor response finishes, whether it's the initial auto-teach or a
follow-up reply, `SyllabusView.tsx` fires a second, separate call using
`prereqDetectionSystemPrompt()`, `routeTag: "json"`. It reads the tutor's
response and flags concepts the student might not already know that are
likely prerequisites for understanding it, returning a short list of
`{concept, prompt}` pairs the UI can surface as quick follow-up questions.

This call is allowed to fail silently. If it errors or times out, nothing
about the actual tutoring experience is affected, the student just doesn't
get the prerequisite suggestions for that turn. Check the try/catch around
its call site in `SyllabusView.tsx` before assuming a failure here needs to
be surfaced to the user, by design, it doesn't.

## Progress tracking

`SubunitProgress` is a small table keyed by `(syllabusId, subunitId)`
tracking whether a subunit's been completed and when it was last visited.
It's the pattern `NoteSegmentExplanation` (see `docs/data-model.md`) later
copied for Notes' per-segment explanations.
