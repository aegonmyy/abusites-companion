# Data model

The whole schema lives in `prisma/schema.prisma`, one SQLite file at
`data/abusites.db`, accessed through `@prisma/adapter-better-sqlite3`.
There's no hosted database, no auth, and no multi-tenant boundary anywhere
in this schema, everything assumes one student on one machine.

## Two halves: catalog and app data

The schema splits cleanly into two groups, and it's worth knowing which
half you're touching before you change anything.

**Catalog tables** (`University`, `Faculty`, `Department`, `Course`,
`PastQuestion`) mirror five tables from a reference Supabase project.
They're populated once by `scripts/fetch-seed-data.ts` and are read-only at
runtime, the app itself never writes to `University`, `Faculty`, or
`Department`, and only writes to `Course`/`PastQuestion` for the one
exception described below (student uploads). A normal `npm run seed` loads
these from a git-committed bundle, `prisma/seed-bundle/catalog.json`, so an
end user never needs real Supabase credentials.

**App tables** (`Settings`, `StudyIntake`, `StudySyllabus`,
`SubunitProgress`, `QuestionOfDay`, `Streak`, `Bookmark`, `Note`,
`NoteSegmentExplanation`, `CbtAttempt`) are what the app actually reads and
writes as a student uses it. There's no user id anywhere in these tables,
there's exactly one implicit local user, the person running the app on
their own machine.

## Why `Course.isCustom` exists

Student uploads (the PDF-to-CBT pipeline) create a real `Course` row and
real `PastQuestion` rows, the same tables the seeded catalog lives in, so
the rest of the app, CBT, search, the course list, doesn't need a second
code path to render them.

The one addition is a boolean flag, `isCustom`, defaulting to `false`. It
would have been possible to infer "this is a custom course" from the
absence of a `departmentId`, but that's the wrong signal, a custom upload
legitimately has no department or university (the student never picked
one), and it's entirely possible for a seeded catalog course to be missing
that link too. The flag exists so the UI can reliably show a "Your uploads"
section without depending on a nullable field meaning two different things
in two different contexts.

## Why `PastQuestion.optionE` exists

The seeded catalog is entirely 4-option questions (A through D). Nigerian
exam papers commonly go up to 5 options (A through E), and the PDF upload
pipeline has to preserve whatever a real exam actually contains rather than
dropping a genuine fifth option. Rather than reshape the schema around a
variable-length options list, `PastQuestion` just gained one more nullable
column, `optionE`. Seeded questions leave it `null`. The CBT and
question-review UI only render options that are non-null, so a 4-option
question still renders as 4-option, nothing downstream had to change to
support the fifth option showing up only when it's real.

## Legacy fields on `Note`

`Note` carries a few fields, `summary`, `keyConcepts`, that belong to an
earlier, simpler version of the feature, a single model call that produced
one summary and one quiz for the whole document. The current version
splits a note into segments (`segmentsJson`) with an on-demand, per-segment
deep explanation (`NoteSegmentExplanation`, one row per segment, generated
lazily when a student actually opens it).

Both sets of fields stay in the schema, nullable, and the old ones are
never written by anything new. This is deliberate: a note created before
the segment-based rewrite has no `segmentsJson`, and forcing a migration to
backfill it would mean either re-running the model against old saved text
(cost, and a real chance of producing a different result than what the
student originally saw) or just breaking old notes. Instead,
`NoteDetailPage` branches on whether `segmentsJson` is present and falls
back to rendering the legacy `summary`/`keyConcepts` view for notes that
predate the change. If you're touching `Note`, check which branch you're
actually in.

## `NoteSegmentExplanation` as its own table

Explanations are generated one segment at a time, on demand, not all at
once when a note is created. That's the reason this is a separate table
keyed by `(noteId, segmentId)` rather than a JSON blob living on `Note`
itself, each row gets written independently, whenever its segment is first
opened, and `SubunitProgress` (Study mode's equivalent, a related table
keyed by parent id plus a string sub-id) already established this exact
pattern elsewhere in the schema.

## Language is chosen per-topic and per-note, not app-wide

There's a `Settings.language` field, but it's a fallback for the one-shot
AI-explain features that have no real intake step to ask at (question of
the day, CBT review, past-questions explanations). `StudySyllabus.language`
and `Note.language` are separate fields, set once when the syllabus or note
is actually created, because a student studying one subject in Hausa and
another in English is a completely normal pattern this app is built
around. If you're adding a new feature that generates content in a chosen
language, ask whether it has a real intake moment first, and if it does, it
probably wants its own language field rather than reading
`Settings.language`.

## Cloud API key storage

`Settings.cloudApiKey` is stored in plaintext. Given there are no accounts,
no other users, and no network boundary between this database and anything
else (the file only ever lives on the student's own machine), encrypting
it at rest wouldn't actually add protection against anything, the app
itself already has full access to decrypt it the moment it needs to make a
call. See `docs/model-integration.md` for how the key is actually used.

## Migrations

Prisma migrations live in `prisma/migrations/`. Nothing about the workflow
here is unusual, `npx prisma migrate dev` while developing, `prisma migrate
deploy` in production, but one thing is worth knowing if you're setting up
a fresh clone or debugging a stale build: `npm run build` now runs `prisma
generate && prisma migrate deploy` before the actual Next.js build (see
`package.json`). That exists because a client-side Prisma type mismatch
between machines is a real failure mode, not a hypothetical one, a schema
change that lands without a corresponding client regeneration and DB
migration produces exactly the kind of confusing type error you'd expect
from a stale generated client. The build regenerating both on every run
means a plain `git pull && npm run build` is always enough, no separate
manual migration step required.
