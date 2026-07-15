<!--
Draft Kaggle competition writeup for Grinnish Local. This is a first draft
written without the exact submission template/word-count/section rules for
the target competition in hand — re-shape headings/length to match
whatever the actual Kaggle writeup form asks for before submitting. The
content and claims below are accurate as of this build (verified — see
"Verification" section); only the framing/format is provisional.
-->

# Grinnish Local — an offline study companion running entirely on a local Gemma model

## The problem

Grinnish is a hosted study platform for Nigerian university students:
AI-generated syllabi, a tutor chat, past-question practice, notes and
quizzes. It works well — if you have a reliable, affordable internet
connection. Many students in Hausa-speaking regions of Nigeria don't.
Mobile data is expensive relative to income, and connectivity is patchy
exactly where and when students need to study — in the days before an
exam, in a hostel room, on a bus. A cloud-only tool becomes unusable at
the moment it would matter most.

## The solution

Grinnish Local is a from-scratch local port of the same product surface,
rebuilt so every feature runs against a model resident on the student's
own machine, with **zero runtime network dependency**:

- **Study mode**: describe a topic and goal, get an AI-generated syllabus,
  work through it with a streaming local tutor.
- **Notes**: paste text or photograph a textbook page / handwritten notes;
  the model (multimodal — text and vision) reads it and produces a
  summary, key concepts, and a short quiz, with follow-up chat scoped to
  that note.
- **Past questions + CBT practice**: browse a course catalog, practice
  past exam questions in a timed, scored flow.
- **Question of the day, streaks, bookmarks** — the retention/habit layer,
  all local.
- **Hausa / English / natural code-switched output** for every
  model-generated response, matching how students actually talk, not a
  stiff formal-Hausa translation.

Everything — Next.js app, SQLite database, and the Gemma model itself via
[Ollama](https://ollama.com) — runs on one machine. Setup needs internet
once (to download the app's dependencies and pull the ~7GB model); after
that, the network cable can come out.

## Why a local model, and why this one

The model is `gemma4:e2b`, run through Ollama with a deliberately
constrained call shape used by every single inference request in the app
(one funnel: `src/app/api/llm/route.ts`):

- `think:false` — thinking-mode tokens are pure latency cost on a CPU-only
  target device with no payoff for short study-app answers.
- `num_ctx: 4096` — small enough to keep memory and prompt-processing time
  bounded on modest hardware.
- `keep_alive: 30m` — the model stays resident in RAM across requests;
  measured cold-load cost on the dev VPS was 30+ seconds, which is not
  acceptable mid-conversation.
- Per-route `num_predict` caps (json: 400, lesson: 250, chat: 200, gloss:
  80) — short output is a *product* decision, not an accident: a compact,
  dense answer generated in a few seconds beats a thorough one that takes
  a minute on a slow CPU.

The larger `gemma4:e4b` variant is deliberately **not** reachable from the
UI. It has a reproducible OOM-kill history on 15GB RAM during development
and is only ever meant to become available after separate, verified
memory testing on the actual target hardware — a explicit engineering
guardrail against shipping something that crashes on the exact machines
this project is for.

`gemma4:e2b` also turned out to be vision- and audio-capable
(`ollama show gemma4:e2b`), which the Notes feature uses directly: a photo
of a textbook page goes straight into the model as an image message
(`ChatMessage.images`), no separate OCR step, and the model reads and
summarizes it in one call. Verified end-to-end with a real generated test
image containing the text "Mitochondria is the powerhouse of the cell" —
the model correctly read and summarized it.

## What "offline" actually means here (verified, not asserted)

It's easy to claim an app is offline-capable and be wrong about a stray
font CDN reference or an API fallback nobody remembered. This build has an
automated check for it: `tests/phase4-offline-audit.mjs` drives a real
browser through the entire app — dashboard, study mode (including a real
syllabus-generation model call), notes, past-questions/CBT, bookmarks,
settings — against a clean production build, logging every network
request, and fails if a single one leaves `localhost`. It passes.

## Verification

Every phase of this build was checked against the real thing, not mocked:

- Clean production builds (`rm -rf .next && npm run build`) after every
  change, plus a genuine fresh-clone install (`git clone` into a scratch
  directory, `./setup.sh` from nothing) to catch anything that only
  worked because of leftover local state.
- Playwright scripts drive a real Chromium browser against the real
  `next start` production server and the real local Ollama daemon — real
  clicks, real streamed model output, geometry checks to catch invisible/
  zero-size UI regressions. `tests/phase1-tour.mjs` (12 checks),
  `tests/phase2-notes-tour.mjs` (10 checks, including a real vision call),
  `tests/phase4-offline-audit.mjs` (network audit) — all currently
  passing.
- `setup.sh` (macOS/Linux) was run for real, twice: once against an
  already-set-up machine (idempotent path) and once against a from-scratch
  fresh clone (empty database, no node_modules) — both completed cleanly
  through to a production build. `setup.ps1` (Windows) mirrors it but has
  not been run on real Windows hardware — see limitations.

## Impact

The target user is a Nigerian university student, plausibly a Hausa
speaker, on a modest laptop, with limited or expensive connectivity. For
that user, Grinnish Local turns "no signal this week" from "can't study
with the tool" into "doesn't matter, it never needed signal." The
Hausa/code-switched language setting matters for the same reason
accessibility features generally do: it's not a translation layer bolted
on afterward, every model call (syllabus generation, tutoring, note
summarization, quizzing) is prompted for the student's actual language
preference from the start.

## Honest limitations

- The past-questions catalog has real course data (81 courses, seeded from
  the production Supabase project) but the actual past-exam-question
  content, universities/faculties/departments tables read back empty from
  the seed source, and it's not possible to tell from the client side
  whether that's Row-Level Security blocking anonymous reads or genuinely
  empty tables — flagged to the project owner rather than guessed around.
  The past-questions/CBT/QOTD UI is fully built and tested against this
  reality: it shows a correct, graceful empty state rather than crashing
  or fabricating content.
- Hausa coverage for *model-generated* content (the substantive text
  students actually read) is complete. Static UI chrome (buttons, page
  headers) only has a partial, machine-translated pass and needs native
  speaker review before being called finished.
- Not yet run on the actual target hardware or reviewed by a native Hausa
  speaker — both require physical/human access unavailable in this
  environment. Everything that could be verified without them was.

## Links

- Source: (repo URL — fill in before submitting)
- Reference (hosted) version: <https://grinnish.ameenme.dev>
