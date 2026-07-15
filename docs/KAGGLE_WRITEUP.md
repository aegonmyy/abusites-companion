<!--
Draft Kaggle competition writeup for Grinnish Local — Build With Gemma:
GDG on Campus ABU Zaria, Track 1 (Gemma for Local Languages & Literacy,
Hausa). ~1500-word target per the brief. Content is accurate as of this
build (verified — see "Verification"); reshape headings/length to fit the
actual submission form before final entry.
-->

# Grinnish Local — an offline study companion running entirely on a local Gemma model

## The problem

Grinnish is a hosted study platform for Nigerian university students:
AI-generated syllabi, a tutor chat, past-question practice, notes and
quizzes. It works well — if you have a reliable, affordable internet
connection. Many students in Hausa-speaking regions of Nigeria don't.
Mobile data is expensive relative to income, and connectivity is patchy
exactly where and when students need to study — the days before an exam,
in a hostel room, on a bus. A cloud-only tool becomes unusable at the
moment it would matter most.

## The solution

Grinnish Local is a from-scratch local port of the same product surface,
built so every feature runs against a model resident on the student's own
laptop, with **zero runtime network dependency**:

- **Study mode**: describe a topic and goal, get an AI-generated syllabus,
  work through it with a streaming local tutor — by text or by voice.
- **Notes**: paste text, upload a PDF, or photograph a textbook page /
  handwritten notes; the model reads it and produces a summary, key
  concepts, and a short quiz, with follow-up chat (text or voice) scoped
  to that note.
- **Past questions + CBT practice**: browse a course catalog, practice
  past exam questions in a timed, scored flow.
- **Question of the day, streaks, bookmarks** — the retention/habit layer,
  all local.
- **Hausa / English / natural code-switched output** for every
  model-generated response, matching how students actually talk, not a
  stiff formal-Hausa translation.

Everything — Next.js app, SQLite database, and the Gemma model itself via
[Ollama](https://ollama.com) — runs on one machine. Setup needs internet
once (dependencies + a ~7GB model pull); after that, the network cable can
come out. `tests/phase4-offline-audit.mjs` proves this isn't just an
intention: it drives the whole app end to end on a clean production build
and fails if a single request ever leaves `localhost`. It passes.

## Why e2b, not e4b: the MatFormer trade-off

`gemma4:e2b` is shipped as the only selectable model — deliberately, not
as a placeholder. Gemma's e2b/e4b naming reflects a MatFormer (nested
Matryoshka Transformer) architecture: e2b exposes roughly **2.3B
effective parameters out of ~5B total on disk**, elastically activating a
sub-network rather than being a separately trained small model. That
matters on this hardware because the *effective* compute cost is what
determines whether a 2015 dual-core CPU laptop can hold a conversation at
a usable pace, while the *total* parameter count still dictates memory
footprint.

e4b was trialed during development and produced a reproducible OOM-kill
on 15GB RAM. It is intentionally unreachable from the UI (see
`src/lib/ollama.ts`, `src/app/settings/page.tsx`) — not "not implemented
yet," but a guardrail: e4b may only be trialed again after dedicated,
verified memory testing on the real EliteBook 840 G2 target (pending —
see Hardware caveat below), watching specifically for OOM. Shipping
something that crashes on the exact machine it's built for would be worse
than shipping the smaller model. Every Ollama call across the app also
sets `think:false`, `num_ctx:4096`, `keep_alive:30m`, and a per-route
`num_predict` cap (json 400, lesson 250, chat 200, gloss 80) — deliberately
short output, because a compact answer generated in a few seconds beats a
thorough one that takes a minute on a slow CPU.

## The audio finding — and where the initial hypothesis was wrong

`ollama show gemma4:e2b` lists `audio` as a capability, and voice input
was a required, "confirmed feasible" phase, not optional. Getting there
required correcting an initial assumption. The natural guess — reuse the
same `images` field already used for photo input in Ollama's native
`POST /api/chat` — **does not work**: sending raw WAV bytes through
`images` returns a response as if no audio were attached at all (and the
`prompt_eval_count` for that call, 69 tokens for an 81KB clip, confirms
the bytes were silently dropped, not tokenized). Passing an OpenAI-style
content array to that same endpoint fails outright with a Go type error —
`content` is a hard-typed string there.

The real path, found by testing rather than assuming: Ollama's
**OpenAI-compatible endpoint**, `POST /v1/chat/completions`, accepts a
`{"type":"input_audio","input_audio":{"data":base64,"format":"wav"}}`
content block. Verified with a synthesized WAV clip asking "What is the
powerhouse of the cell" — the model's response: *"The powerhouse of the
cell is the mitochondrion."* Correct, and via a real recorded/re-encoded
pipeline, not a canned test. Two more findings fell out of building this
for real: `think:false` is **not honored** on this endpoint for this
model (every audio call runs a full internal reasoning trace regardless —
the app hides it, but budgets `num_predict:400` for audio, roughly double
the text-chat cap, specifically to survive it), and only raw 16-bit PCM
WAV was verified — so the client always re-encodes MediaRecorder's native
codec output to WAV via Web Audio before sending, never assuming the
native codec works. Full raw transcript: `docs/AUDIO_FINDING.md`.

## Hausa quality: a real 30-prompt eval, not a claim

`scripts/hausa-eval.ts` runs 30 real prompts — math, biology, civic
education, in pure Hausa / Hausa-English code-switched / English — through
the exact call shape the tutor chat uses, against the real local model.
All 30 completed successfully. Average latency **10.8s**, average
throughput **14.1 tokens/sec** (raw results, every prompt and output:
`docs/hausa-eval.md`). Qualitatively: pure-Hausa prompts consistently got
Hausa framing with technical nouns (mitochondria, DNA, quadratic formula)
left in English — the intended behavior (`src/lib/prompts.ts`), not a
gap. That said, the prompts and this read were produced without a native
Hausa speaker present in this environment; treat the language-*naturalness*
judgment as provisional pending review, distinct from the latency/success
numbers, which are simply measured.

### Hardware caveat

This eval, and all latency figures in this writeup, were measured on a
shared cloud VPS — **not** the HP EliteBook 840 G2 (i7-5600U, 2-core, 2015,
no GPU, 16GB RAM) that is the actual demo hardware. No EliteBook access
was available in this environment. Re-running `npx tsx
scripts/hausa-eval.ts` on the real device, and re-benchmarking e2b
(then, only then, cautiously trialing e4b) is the pending Phase 4 step,
flagged rather than skipped or faked.

## Verification, not "looks right"

- Clean production builds (`rm -rf .next && npm run build`) after every
  change; a genuine fresh-clone install (`git clone` to scratch, `./setup.sh`
  from nothing — no pre-existing `node_modules` or database) completed
  cleanly twice.
- Playwright drives a real Chromium browser against the real `next start`
  production server and real local Ollama — real clicks, real streamed
  output, geometry checks. This includes a genuinely hard case: voice
  input is tested with Chromium's `--use-file-for-fake-audio-capture`
  flag feeding a real synthesized WAV file as the microphone, through
  real `MediaRecorder` capture, real client-side WAV re-encoding, a real
  `/api/llm` call, and a real Ollama response — then asserts the reply is
  topically correct (mentions mitochondria), not just non-empty.
- Current suite: `tests/phase1-tour.mjs` (12 checks), `tests/phase2-notes-tour.mjs`
  (10, incl. real vision), `tests/phase2-pdf-tour.mjs` (real PDF text
  extraction via pdfjs-dist), `tests/phase3-voice-tour.mjs` (5, real audio
  pipeline), `tests/phase4-offline-audit.mjs` (network audit) — all passing.

## Impact

The target user is a Nigerian university student, plausibly a Hausa
speaker, on a modest laptop, with limited or expensive connectivity. For
that user, Grinnish Local turns "no signal this week" from "can't study
with the tool" into "doesn't matter, it never needed signal." Voice input
matters specifically for the literacy angle of this track: a student who
finds typing a technical question slower or harder than asking it out
loud gets the same tutor either way.

## Honest limitations

- Past-questions catalog: `courses` (81 rows) is populated; four other
  seeded tables read back empty and it's not possible to tell client-side
  whether that's RLS or genuinely empty — flagged to the project owner,
  not guessed around. The UI shows a correct empty state rather than
  fabricating content.
- Hausa UI chrome (buttons, headers) has only a partial machine-translated
  pass; model-generated content (the substantive text) is fully covered.
- Not run on the EliteBook or reviewed by a native Hausa speaker — both
  need access this environment doesn't have; everything else was
  verified for real.
- `setup.ps1` (Windows, the primary target) mirrors `setup.sh` exactly but
  wasn't executed on real Windows hardware.

## Links

- Source: (repo URL — fill in before submitting)
- Reference (hosted) version: <https://grinnish.ameenme.dev>
