# Abusites Companion

An offline study companion for Nigerian university students — AI-generated
syllabi, a streaming tutor you can talk to by text or voice, past-question
CBT practice, and paste/PDF/photo notes with auto-generated summaries and
quizzes — running entirely on the student's own machine against a local
Gemma model. No account, no login, no cloud calls at runtime.

Built single-user and local-first from the ground up: SQLite instead of a
hosted database, [Ollama](https://ollama.com) running `gemma4:e2b` on-device
instead of a cloud API, no auth (one implicit local user). It exists for
students who don't have a reliable, affordable connection — the whole app,
model included, works with the network cable pulled out.

## Why this exists

Nigerian university students studying in Hausa-speaking regions often deal
with expensive or unreliable mobile data. A cloud-only study app is
unusable exactly when it would help most — the week before an exam, with
patchy signal. Abusites Companion trades scale and a hosted database for
something that keeps working when the connection doesn't: install once
(needs internet for the npm/model download), then every feature — syllabus
generation, tutoring, notes, quizzes — runs against a model resident in RAM
on the same machine.

## Features

- **Study mode** — describe a topic and goal, get a compact AI-generated
  syllabus, then work through each subunit with a streaming local tutor —
  by typing or by tapping the mic and asking out loud.
- **Notes** — paste text, upload a PDF, or snap a photo of a textbook
  page/handwritten notes; the local model (vision-capable, and PDF text
  extracted locally via pdfjs-dist) reads it and produces a summary, key
  concepts, and a short quiz. Follow-up chat (text or voice) scoped to the
  note.
- **Voice input** — real audio understanding via Ollama's OpenAI-compatible
  endpoint (not the native `/api/chat` `images` field — that doesn't carry
  audio; see `docs/AUDIO_FINDING.md` for the full finding). The mic always
  re-encodes to WAV client-side before sending, never relying on the
  browser's native recording codec.
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
  `prisma/schema.prisma`. One local file, `data/abusites.db`.
- **`/api/llm`** (`src/app/api/llm/route.ts`) is the single inference entry
  point for the whole app. Every feature funnels through it, which keeps
  the mandatory call shape in one place: `think:false`, `num_ctx:4096`,
  `keep_alive:30m` (keeps the model resident in RAM — reloading costs 30s+
  on the target hardware), and a per-route `num_predict` cap (see
  `src/lib/ollama.ts`) so a slow CPU produces short, dense output by design.
- **Model, local mode**: `gemma4:e2b` only, fixed. The larger `e4b` variant
  has a reproducible OOM-kill history on 15GB RAM in testing and is
  intentionally unreachable from the UI — see `src/lib/ollama.ts` and
  `src/app/settings/page.tsx`.
- **Model, cloud mode**: a Gemma model served through Google AI Studio's
  Generative Language API (`src/lib/gemini.ts`), used when Settings ->
  Model source is set to Cloud. Built to the same external contract as the
  local client (same route budgets, same streaming shape), so `/api/llm`
  switches between them with one branch and no other code in the app knows
  or cares which one is active. See "Model source: local vs. cloud" below.
- **Prompts** (`src/lib/prompts.ts`) are kept short and dense on purpose —
  the target device is assumed to be a low-spec CPU-only laptop with no
  GPU; verbose system prompts eat directly into latency and the
  `num_predict` budget for the actual reply. This applies to both model
  sources, not just local.

## Model source: local vs. cloud

This app supports two ways to run the model, switchable in Settings, no
code changes needed:

**Local (Ollama)** — the default, and the app's actual thesis: install
once, then every feature runs on-device with zero ongoing network
dependency and zero per-request cost. The tradeoff is hardware: `gemma4:e2b`
needs enough free RAM to hold the model resident, and the one-time ~7GB
download needs a real internet connection somewhere, even if the machine
is offline the rest of the time (a campus WiFi session is enough).

**Cloud (Google AI Studio)** — a fallback for a real constraint local mode
doesn't solve: the students this app is built for are exactly the ones
least likely to have data or a reliable connection, but they're also not
guaranteed to have a machine that can run a local model at all. A lot of
affordable laptops in this context sit at 4 to 8GB of RAM, not the double-
digit headroom a comfortable local-inference setup assumes. Cloud mode
trades the offline story for a much lighter local footprint: no multi-GB
download, no RAM budget to manage, at the cost of needing *some* network
access (even a slow one, since only short text prompts/replies cross the
wire, not model weights) and the student's own free-tier Google AI Studio
API key.

**Rule of thumb:** if the machine can comfortably run a 2B-class model,
local is strictly better, it's faster once warmed up, fully private, and
free forever. If the machine can't (very low RAM, no room for the
download, or the student would rather not tie up disk space), cloud mode
gets them running immediately with nothing to install beyond the app
itself. Nothing about the rest of the app changes based on this choice,
the same syllabus generation, tutoring, notes, and quizzes work either way.

The API key is stored in plaintext in the local SQLite settings row. This
is intentional and consistent with the app's existing trust model, there
are no accounts and no multi-tenant boundary, the database file only ever
lives on the student's own machine, and the key is sent nowhere except
directly to Google's API from the same local server process that already
holds it.

## Quick install (one line, nothing pre-installed required)

On a machine that has nothing set up yet, this single command installs
git/Node/Ollama if missing, clones the repo, pulls the model, builds, and
starts the app, then opens it in your browser:

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/aegonmyy/Abu-hackathon/main/bootstrap.sh | bash
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/aegonmyy/Abu-hackathon/main/bootstrap.ps1 | iex
```

Downloads the ~7GB model on first run (needs internet once); everything
after that runs offline. Safe to re-run, later runs just pull the latest
code and restart. See `bootstrap.sh` / `bootstrap.ps1` for exactly what
each step does.

## Setup (if you already have the repo cloned)

Prerequisites: [Node.js 20+](https://nodejs.org),
[Ollama](https://ollama.com/download).

```bash
git clone <this repo>
cd abusites-companion
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
npx prisma migrate deploy   # creates data/abusites.db with the schema
npm run seed                # loads the full catalog from the bundled dataset
npm run build
npm start
```

`npm run seed` reads the static, git-committed bundle at
`prisma/seed-bundle/catalog.json` and upserts it into local SQLite by id.
It needs **no environment variables, no network access, and no
credentials** — the data is already in the repo. It's idempotent (safe to
re-run) and this is what `setup.sh`/`setup.ps1` run automatically, so a
normal clone-and-setup gets the full real course/past-questions catalog
(2 universities, 3 faculties, 8 departments, 81 courses, ~6.8k past
questions) with zero configuration.

### Refreshing the bundled seed data (maintainers only)

The bundle (`prisma/seed-bundle/catalog.json`) is a point-in-time snapshot
of the reference Supabase project. It's committed to the repo so end users
never need Supabase credentials at all. Only a maintainer with real
credentials to the source project needs to touch the scripts below, and
only when the source data has changed and the bundle needs refreshing:

```bash
cp .env.example .env    # fill in SUPABASE_URL / SUPABASE_ANON_KEY / DIRECT_DB_URL
npm run seed:from-supabase   # pulls what the anon key can read (courses only; RLS blocks the rest)
npx tsx scripts/reseed-direct.ts   # direct-Postgres, RLS-bypassing pull for the remaining tables
npm run seed:export-bundle   # re-exports local SQLite -> prisma/seed-bundle/catalog.json
git add prisma/seed-bundle/catalog.json
git commit -m "chore: refresh seed bundle"
```

`DIRECT_DB_URL` is a real database superuser credential — keep it out of
git (`.env` is gitignored) and never add it to `.env.example` or any
distributed artifact. `scripts/fetch-seed-data.ts` and
`scripts/reseed-direct.ts` are maintainer-only tools; no app runtime path
and no part of `setup.sh`/`setup.ps1`/`npm run seed` ever invokes them.

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
node tests/phase2-pdf-tour.mjs       # notes: real PDF text extraction + summarization
node tests/phase3-voice-tour.mjs     # voice: real mic capture -> WAV -> Ollama -> streamed reply
node tests/phase4-offline-audit.mjs  # asserts zero non-localhost network requests across the whole app
```

Hausa/English eval (30 real prompts against the local model, math/biology/
civic, pure Hausa / code-switched / English — raw results committed at
`docs/hausa-eval.md`):

```bash
npm run eval:hausa
```

## Known limitations / open items

- **Hausa UI text**: model-generated content (syllabus, tutor chat, note
  summaries/quizzes) fully respects the Hausa/mixed language setting. The
  static UI chrome (buttons, page headers) only has a partial,
  machine-translated pass (nav bar) — not yet reviewed by a native Hausa
  speaker, and not yet applied to every page's microcopy.
- **`setup.ps1`**: written to mirror `setup.sh` exactly and reviewed
  carefully, but not executed on real Windows hardware (none available in
  this environment) — treat as a reviewed-but-unverified first pass.
- **Physical device / native-speaker validation**: this build has not been
  run on the actual target hardware (HP EliteBook 840 G2, i7-5600U,
  2015, no GPU, 16GB RAM) or reviewed by a native Hausa speaker. Both
  require physical/human access this environment doesn't have. The
  30-prompt Hausa eval (`docs/hausa-eval.md`) and all latency numbers in
  this repo were measured on a shared dev VPS, not the EliteBook —
  re-running `npm run eval:hausa` on the real device, and only then
  cautiously trialing `gemma4:e4b` while watching for OOM, is the
  pending hardware-verification step.
- **Audio latency**: voice replies take noticeably longer than text/image
  (13–18s measured on the dev VPS) because Ollama's audio-capable endpoint
  doesn't honor `think:false` for this model — every audio call runs a
  full internal reasoning trace before the visible answer. See
  `docs/AUDIO_FINDING.md`. Expect this to be slower still on the EliteBook.
