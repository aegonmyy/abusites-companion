# Model integration

This is the part of the app that actually talks to Gemma, whether that's the
local Ollama model or the cloud fallback. If you're trying to understand how
a feature turns into a model call, or why the JSON sometimes needs repairing,
or why the app never asks the model to detect its own language, this is the
page.

## One route, every feature

Every single model call in the app, syllabus generation, tutoring, notes,
quizzes, chat, the past-paper extraction pipeline, all of it, goes through
one endpoint: `src/app/api/llm/route.ts`. Nothing calls Ollama or the Gemini
API directly from anywhere else in the codebase.

That's not an accident. Ollama has a mandatory call shape this app relies
on everywhere: `think:false`, a fixed `num_ctx` of 4096, `keep_alive:30m` so
the model stays resident in RAM (reloading costs 30+ seconds on the target
hardware), and a per-route output cap. Centralizing the call means that
shape lives in exactly one place instead of being copy-pasted into every
feature and quietly drifting apart over time.

The request body is small and consistent: a `routeTag`, the message array,
an optional `system` prompt, and an optional `numPredictOverride`. The route
looks at `Settings.modelSource` to decide whether to call Ollama or Gemini,
and everything downstream of that branch is the same either way. A
component calling `/api/llm` has no idea, and doesn't need to know, which
one actually answered.

## Route tags control everything

`routeTag` isn't just a label, it picks the output cap and the sampling
temperature for that call. Both live in `src/lib/ollama.ts`:

- `json` gets a real cap (450 tokens) and a near-greedy temperature (0.1).
  Anything asking for structured output, syllabus generation, question
  extraction, quiz generation, needs to come back as valid JSON every time,
  and a high temperature is the main reason a small model produces broken
  JSON (missing colons, unterminated strings). Keeping this route tight and
  predictable matters more than giving it room to be creative.
- `lesson`, `chat`, `gloss`, and `audio` are conversational routes. They're
  uncapped (`num_predict:-1`, meaning "stop naturally" rather than "stop
  at N tokens") because response generation on this hardware is already
  faster than a student reads. A token cap here only risks cutting a real
  answer off mid-thought for no actual speed benefit. This was verified
  directly: an uncapped tutor reply came back at 1347 tokens with a genuine
  `done_reason:"stop"`, not a truncation.

A caller can override the token budget per request with `numPredictOverride`
when it needs something route defaults don't cover, Notes' three depth
tiers (quick/standard/deep) work this way instead of needing three new
route entries.

## Prompts are built, not hardcoded

`src/lib/prompts.ts` is where every system prompt lives, one function per
model call. A few things worth knowing if you're adding a new one:

**Prompts stay short on purpose.** The target device is assumed to be a
low-spec CPU laptop with no GPU. A long, careful system prompt eats
directly into latency and into the token budget available for the actual
reply, so prompts here are dense, not verbose.

**Structured JSON calls skip the language line entirely**, even when the
student chose Hausa. Syllabus titles, note segment titles, and extracted
question text all stay in whatever language the source material is in
(usually English structure, or whatever the exam paper was written in).
This isn't an oversight, it was tested: forcing Hausa into a strict-JSON
call made the model unstable, sometimes breaking the JSON mid-structure,
sometimes leaking English commentary into fields that were supposed to be
clean data. Only the actual explanation content, the tutoring, the note
segment explanations, the chat replies, is Hausa-enforced.

**Small models respond to blunt, exact instructions, not soft ones.** The
syllabus prompt used to say "at most 10 subunits" and the model produced
12 to 17 anyway. Changing it to an exact "EXACTLY 3 units, EXACTLY 2
subunits" fixed both the count and the latency (down to 25 to 34 seconds
from 51 to 69). This pattern shows up again below with language switching.
If you're writing a new prompt and the model isn't following an
instruction, try making it blunter and more literal before making it
longer.

## Language switching without asking the model to self-diagnose

This is probably the most interesting piece of prompt engineering in the
app, and it's worth understanding before you touch anything related to
language.

The first version asked the model to detect the language of the student's
last message itself and reply in kind. Tested directly against real
mid-conversation switches (English topic, Hausa follow-up, and the
reverse), it failed constantly. Stronger wording with worked examples fixed
one direction but broke the other, 5 out of 5 times, regardless of topic.
The conclusion: asking a 2B-class model to both diagnose a language and act
on that diagnosis in a single step just isn't reliable.

The fix moved the detection out of the model entirely. `looksHausa()` in
`prompts.ts` is a cheap regex over common Hausa function words (`kuma`,
`amma`, `domin`, `wannan`, and so on). The app runs that check itself, then
hands the model a direct, unconditional command, "the student's message is
in Hausa, reply in Hausa", with nothing left for the model to figure out.
That got both directions to 10 out of 10 reliable.

Two related functions build on this:

- `followUpLanguageLine(lastUserMessage)` is used everywhere there's real
  student-typed text to react to, chat replies, note follow-ups, tutor
  follow-ups. It's rebuilt fresh from the actual last message every call.
- `generatedLanguageLine(start)` is used where there's no real student text
  yet, the very first tutor message in a new subunit, the first explanation
  of a note segment. There's nothing to detect, so it just uses whatever
  language was chosen at intake time.

If you ever touch this wording, re-verify with the same method that found
the bug in the first place: real mid-conversation switches, both
directions, several trials each. A single test in one direction hides
direction-dependent bias.

## Getting real Hausa, not Pidgin

A related, separate finding: an early version of the Hausa instruction just
said "code-switch naturally, the way a student talks." Tested against the
real model across several tasks, it produced Nigerian Pidgin English every
time, "wahala," "I go explain," zero real Hausa. The fix wasn't a longer or
more emphatic instruction, it was specificity: naming actual Hausa function
words to use (`kuma`, `amma`, `domin`, `wannan`, `misali`, `yadda`, `idan`)
and explicitly stating that Pidgin isn't Hausa. That alone flipped it to
grammatical Hausa, consistently.

## The JSON repair layer

Even with a low temperature, a small model asked for strict JSON doesn't
always produce parseable JSON. `src/lib/parse-model-json.ts` handles three
real, observed failure modes:

1. **Stray backslashes.** Something like `$\text{CO}_2$` inside a string
   value contains a backslash that isn't a valid JSON escape.
2. **Raw control characters inside strings**, a literal newline the model
   wrote inside a title, which JSON doesn't allow unescaped.
3. **Trailing commas** before a closing `}` or `]`.

`repairModelJson()` walks the raw text as a small state machine that tracks
whether it's currently inside a string, so it only touches backslashes and
control characters inside strings, and only strips commas outside them.
`parseModelJson()` tries a plain `JSON.parse()` first and only falls back
to the repaired version if that fails.

There's a fourth failure mode that isn't a syntax problem at all: in cloud
mode, Gemini sometimes wraps the whole response in a single-element array,
`[{...}]`, instead of returning the bare object every prompt asks for.
Confirmed directly at roughly 50% frequency across real test calls. Every
caller in this app expects a bare object, so `parseModelJson()` unwraps a
single-element array automatically rather than making every call site
defend against it separately.

## Streaming

Local and cloud calls stream back in different native formats (NDJSON from
Ollama, SSE from Gemini), and `src/app/api/llm/route.ts` normalizes both
into the same plain-text stream before it reaches the client. Nothing in
the UI needs to know which upstream format produced it.

## Cloud mode specifics

`src/lib/gemini.ts` is built to the exact same external contract as the
local client, same route tags, same message shape, same "raw Response in,
caller applies a stream transformer" pattern, specifically so `/api/llm`
can switch between them with one branch. A few things are cloud-specific
enough to be worth knowing:

**Thinking overhead.** Gemini streams internal reasoning as ordinary
content parts flagged `thought:true`, on by default, uncosted anywhere
obvious. A trivial "say OK" prompt burned 82 thinking tokens before the
1-token real answer. The documented way to disable this,
`thinkingConfig.thinkingBudget`, returns a flat 400 error on both available
Gemma 4 cloud variants. The actual fix is a different, undocumented
parameter, `thinkingConfig.thinkingLevel:"MINIMAL"`, confirmed directly to
eliminate thinking tokens entirely while producing the same correct output,
cutting a real syllabus call from about 44 seconds down to 12.

**No local-hardware token caps.** The small per-route caps in `ollama.ts`
exist because of weak local hardware, that reasoning doesn't apply to a
call running on Google's own infrastructure. Cloud calls always request the
model's real ceiling instead (32768 tokens) and let the model stop
naturally, verified in testing to land between 90 and 943 tokens for real
replies, nowhere near that ceiling.

**The API key lives in plaintext** in the local `Settings` row. That's a
deliberate choice consistent with the app's whole trust model: there are no
accounts, no multi-tenant boundary, the database file only ever lives on
the student's own machine, and the key is sent nowhere except directly to
Google's API from the same local server process that already holds it.

## Adding a new model-backed feature

If you're adding something new that needs the model:

1. Write a system prompt function in `prompts.ts`. Keep it short. Decide
   up front whether it needs a language line, and if it does, whether it's
   `followUpLanguageLine` (real student text exists) or
   `generatedLanguageLine` (it doesn't).
2. Pick a `routeTag`. If you need genuinely new budget/temperature
   behavior that doesn't fit the existing four tags, that's a real decision
   worth writing a comment about, not just a place to reach for a
   `numPredictOverride`.
3. Call `/api/llm` from the client the same way every other feature does,
   don't add a new endpoint that talks to Ollama or Gemini directly.
4. If the response needs to be JSON, run it through `parseModelJson()`
   rather than a bare `JSON.parse()`.
5. Test the prompt against the real model, not just for parseability, for
   the actual behavior you're asking for. Several of the fixes described
   above only became obvious once someone ran real trials instead of
   trusting that reasonable-sounding wording would work.
