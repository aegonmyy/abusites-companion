# Grinnish Local

An offline study companion for Nigerian university students — AI-generated
syllabi, a streaming tutor, past-question CBT practice, and photo/paste-in
notes with auto-generated summaries and quizzes — running entirely on the
student's own machine against a local Gemma model. No account, no login, no
cloud calls at runtime.

This is a local, single-user port of [Grinnish](https://grinnish.ameenme.dev),
a hosted SaaS built on Supabase + Gemini. Everything here runs on-device
instead: SQLite instead of Postgres, [Ollama](https://ollama.com) running
`gemma4:e2b` instead of the Gemini API, no auth (one implicit local user).
It exists for students who don't have a reliable, affordable connection to
run the hosted version — the whole app, model included, works with the
network cable pulled out.

## Why this exists

Nigerian university students studying in Hausa-speaking regions often deal
with expensive or unreliable mobile data. A cloud-only study app is
unusable exactly when it would help most — the week before an exam, with
patchy signal. Grinnish Local trades scale and a hosted database for
something that keeps working when the connection doesn't: install once
(needs internet for the npm/model download), then every feature — syllabus
generation, tutoring, notes, quizzes — runs against a model resident in RAM
on the same machine.

## Features

- **Study mode** — describe a topic and goal, get a compact AI-generated
  syllabus, then work through each subunit with a streaming local tutor.
- **Notes** — paste text or snap a photo of a textbook page/handwritten
  notes; the local model (vision-capable) reads it and produces a summary,
  key concepts, and a short quiz. Follow-up chat scoped to the note.
- **Past questions + CBT** — browse a seeded catalog of courses and past
  exam questions, practice in a timed CBT-style flow, get scored instantly.
- **Question of the day** — a daily practice question with streak tracking.
- **Bookmarks** — save subunits, notes, or past questions for later,
  fully offline.
- **Language** — English, Hausa, or natural Hausa/English code-switching
  for all model-generated content (syllabus, tutor replies, note
  summaries/quizzes). Configurable in Settings.
- **PWA / offline shell** — a service worker caches the app shell so the UI
  itself loads without a network hop; API calls always go to the local
  Next.js server, never a cache.

## Architecture

- **Next.js 16 (App Router) + TypeScript + Tailwind v4**, `next dev`/`build`
  pinned to `--webpack` (avoids a Turbopack over-bundling issue observed
  during development).
- **Prisma 7 + SQLite** (`@prisma/adapter-better-sqlite3`) — see
  `prisma/schema.prisma`. One local file, `data/grinnish.db`.
- **`/api/llm`** (`src/app/api/llm/route.ts`) is the single inference entry
  point for the whole app. Every feature funnels through it, which keeps
  the mandatory call shape in one place: `think:false`, `num_ctx:4096`,
  `keep_alive:30m` (keeps the model resident in RAM — reloading costs 30s+
  on the target hardware), and a per-route `num_predict` cap (see
  `src/lib/ollama.ts`) so a slow CPU produces short, dense output by design.
- **Model**: `gemma4:e2b` only, fixed. The larger `e4b` variant has a
  reproducible OOM-kill history on 15GB RAM in testing and is intentionally
  unreachable from the UI — see `src/lib/ollama.ts` and
  `src/app/settings/page.tsx`.
- **Prompts** (`src/lib/prompts.ts`) are kept short and dense on purpose —
  the target device is assumed to be a low-spec CPU-only laptop with no
  GPU; verbose system prompts eat directly into latency and the
  `num_predict` budget for the actual reply.

## Setup

Prerequisites: [Node.js 20+](https://nodejs.org),
[Ollama](https://ollama.com/download).

```bash
git clone <this repo>
cd grinnish-local
./setup.sh        # macOS/Linux
# or
.\setup.ps1       # Windows (PowerShell)
```

This installs dependencies, pulls the `gemma4:e2b` model (~7GB, one-time,
needs internet), creates the local SQLite schema, and produces a production
build. Then:

```bash
ollama serve      # if not already running
npm start
```

Open <http://localhost:3000>.

### Manual setup

If you'd rather run the steps yourself (or the setup script doesn't fit
your platform):

```bash
ollama pull gemma4:e2b
npm install                 # runs `prisma generate` via postinstall
npx prisma migrate deploy   # creates data/grinnish.db with an empty schema
npm run build
npm start
```

### Re-seeding the catalog (maintainers only)

The courses/past-questions catalog (`data/grinnish.db`) is populated once
from the reference Supabase project and then shipped/copied as a file —
end users never need Supabase credentials. To re-seed:

```bash
cp .env.example .env   # fill in SUPABASE_URL / SUPABASE_ANON_KEY
npm run seed
```

## Development

```bash
npm run dev     # dev server, --webpack
npm run lint
npx tsc --noEmit
npm run build   # production build, --webpack
```

Playwright verification scripts (real browser, real local server, real
local Ollama — not mocked) live in `tests/*.mjs` and are run manually
against a clean production build:

```bash
npm run build && npm start &
node tests/phase1-tour.mjs           # dashboard, QOTD, settings, past-Qs/CBT, bookmarks, study mode
node tests/phase2-notes-tour.mjs     # notes: paste + photo intake, quiz, scoped chat, bookmarking
node tests/phase4-offline-audit.mjs  # asserts zero non-localhost network requests across the whole app
```

## Known limitations / open items

- **Catalog coverage**: of the five seeded tables, only `courses` (81 rows)
  is confirmed populated from the reference Supabase project;
  `universities`/`faculties`/`departments`/`past_questions` read back empty
  for the anon key used at seed time, and it isn't possible from the
  client side to tell "RLS is blocking this" from "this table is
  genuinely empty" — flagged to the project owner rather than worked
  around. Practical effect: past-questions/CBT and QOTD are fully wired
  and tested, but there's no actual past-question content yet, so they
  correctly show an empty state.
- **Hausa UI text**: model-generated content (syllabus, tutor chat, note
  summaries/quizzes) fully respects the Hausa/mixed language setting. The
  static UI chrome (buttons, page headers) only has a partial,
  machine-translated pass (nav bar) — not yet reviewed by a native Hausa
  speaker, and not yet applied to every page's microcopy.
- **Audio input**: `gemma4:e2b` is audio-capable per `ollama show`, but
  audio input isn't wired up anywhere in the app (only text and image).
  Deferred — no verified working path was built for it.
- **`setup.ps1`**: written to mirror `setup.sh` exactly and reviewed
  carefully, but not executed on real Windows hardware (none available in
  this environment) — treat as a reviewed-but-unverified first pass.
- **Physical device / native-speaker validation**: this build has not been
  run on the actual target hardware (a lower-spec device, referred to as
  "the EliteBook" in project notes) or reviewed by a native Hausa speaker.
  Both require physical/human access this environment doesn't have.
