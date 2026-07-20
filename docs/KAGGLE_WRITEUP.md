# ABUsites Companion

*An offline-first Gemma 4 study companion that teaches Nigerian students in the language they actually think in*

## What was built

ABUsites Companion is an offline-first study companion for Nigerian university students, built around a locally-hosted Gemma 4 model instead of a cloud API. It's meant for studying day to day, not just cramming before an exam. Describe a topic and get a syllabus with a tutor you can talk to by text or voice. Paste or photograph your own notes and have them broken down, explained segment by segment, and turned into a quiz whenever you're ready. Work through real past exam questions in a timed CBT-style practice mode, or just open a free chat and ask the model anything, no setup required. A daily question and streak tracking keep the habit going, and anything worth revisiting can be bookmarked. All of it runs against the same local model, on the student's own machine.

## Why it was built

Nigerian university students studying in Hausa-speaking regions of Northern Nigeria often deal with mobile data that's expensive relative to income, and connectivity that's patchy exactly when it matters most, the week before an exam, in a hostel room, on a bus with no signal. A cloud-only study app becomes unusable at the precise moment a student needs it. It also assumes English is the only language worth replying in, which doesn't match how these students actually think and talk, mixing Hausa and English naturally rather than switching fully into one or the other. ABUsites Companion was built to remove both dependencies at once: no connection required after setup, and no forced choice between "explained well" and "explained in a language that's actually comfortable."

## How it was built

The app is a single Next.js application (App Router, TypeScript, Tailwind), with SQLite as the only database, no hosted backend at all. There's no login and no accounts, just one implicit local user, since the whole point is that everything lives on the student's own machine. Every feature that talks to the model funnels through one API route, which keeps the call shape (context size, keep-alive, per-route settings) consistent no matter which screen triggered it, rather than each feature reimplementing its own model-calling logic.

Local inference runs through Ollama, serving `gemma4:e2b` on-device, comfortably on a machine with 16GB of RAM. The larger `e4b` variant was tried first, but its memory footprint pushed well past what's reasonable to expect a student's laptop to spare alongside everything else running, so `e2b` became the default without a meaningful quality trade-off for this use case. For students whose hardware falls short even of that, there's an opt-in fallback to Google AI Studio's hosted Gemma 4 instead, built behind the exact same internal contract so the rest of the app can't tell which one is answering. Local stays the default and the actual thesis of the project; cloud is there so a lack of RAM doesn't lock a student out entirely.

A one-time setup step installs dependencies and pulls the model. After that, the app is verified offline for real: an automated audit drives the whole app end to end on a production build and fails if a single request ever leaves localhost.

## How Gemma 4 was specifically integrated

Every AI-facing feature calls the same local Gemma 4 model through one route, but each one hands it a different, purpose-built system prompt rather than one generic "assistant" prompt reused everywhere. Generating a syllabus, splitting a note into segments, writing a quiz, tutoring a topic, and free chat are each their own prompt, tuned for that specific job. Structured features like syllabus and quiz generation constrain Gemma 4 to strict JSON output, since the rest of the app parses that response directly into the database.

Notes don't have to be typed. A student can photograph a page of handwritten or printed notes, and Gemma 4's multimodal input reads the image directly and breaks it into the same segment structure a pasted note would get, no separate OCR step involved.

The language behavior is the deepest integration point. Nigerian students studying in Hausa-speaking regions often mix Hausa and English naturally rather than picking one, so tutoring and chat responses can start in Hausa when a student chooses that at setup, and always mirror whatever language the student actually types in a follow-up message, even if that means switching mid-conversation. Getting Gemma 4 to hold real Hausa instead of drifting into Pidgin took direct trial and error: a vague instruction like "code-switch naturally" failed every time it was tested, while explicitly naming real Hausa function words and banning Pidgin outright made it fluent and reliable.

Responses also aren't cut off at an arbitrary length. Early on, replies were capped at a fixed token budget, but since a student reads slower than the model generates, that cap only ever worked against them, so it was removed and the model is left to stop on its own, verified directly against the running model rather than assumed. Responses stream back token by token as they're generated, and voice input feeds transcribed speech into the same chat path as typed text.

## Challenges overcome

Reliable Hausa output was the hardest problem. Early prompts told the model to "code-switch naturally," and in direct testing that produced Nigerian Pidgin English every time, not Hausa. The fix wasn't a stronger instruction in the same direction, it was a completely different kind of instruction: naming actual Hausa function words to use and explicitly ruling out Pidgin. Tested repeatedly against the real model, that combination is what finally produced consistent, grammatical Hausa.

Structured output and Hausa didn't mix well either. Forcing Hausa into features that generate strict JSON, like syllabus and quiz generation, made the model unstable: the JSON would break mid-structure, or English commentary would leak into fields that were supposed to be clean data. Rather than fight that, those fields stay in English by design, titles and structure in English, explanations in whichever language the student chose.

Language selection itself went through a redesign. It started as one global toggle for the whole app, but that didn't match how students actually study, wanting Hausa for one subject and English for another, sometimes switching notes within the same subject. It became a per-topic, per-note choice instead, set once when the syllabus or note is created.

Fitting the model on ordinary student hardware was its own constraint. The larger `e4b` variant was the first thing tried, but its memory use made it impractical to expect on a typical laptop running alongside everything else a student has open, which is what pushed the switch to `e2b`.

And offline had to mean offline, not "mostly." That got checked directly rather than assumed, with an automated pass that drives the whole app on a production build and fails the moment a single request tries to leave localhost.

## Why the technical choices were right

Every choice here traces back to the same constraint: students, not infrastructure, decide what "good enough" means. Local `gemma4:e2b` was picked over a bigger model because it runs on hardware a student actually owns, an app that needs a machine most people don't have solves a problem nobody has. The per-topic language choice, rather than one global setting, matches how these students genuinely switch between Hausa and English by subject, not by mood. Keeping structured data in English while explanations flex with the student wasn't a compromise, it kept the parts of the app that have to be exact, exact, and left the parts that have to feel natural, natural. And removing the response length cap cost nothing technically but removed a real, if small, daily friction, since nobody was ever waiting on the model faster than they could read anyway.

## How it addresses the problem

The Local Languages & Literacy track asks for tools that meet people in the language and conditions they actually live in, not the ones a cloud API assumes. ABUsites Companion does that on both fronts at once: it works with no connection because the model never leaves the device, and it teaches in Hausa when that's genuinely more comfortable than English, adapting to whichever language a student is actually using, mid-conversation, not just at setup. Neither piece is a demo feature bolted onto an English-only, cloud-only app. Both are load-bearing, tested against the real model, and used every day the app is open, not just at exam time.
