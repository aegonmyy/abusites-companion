# ABUsites Companion

*An offline-first Gemma 4 study companion that teaches Nigerian students in the language they actually think in*

## What was built

ABUsites Companion is an offline-first study companion for Nigerian university students, built around a locally-hosted Gemma 4 model instead of a cloud API. It's meant for studying day to day, not just cramming before an exam. Describe a topic and get a syllabus with a tutor you can talk to by text or voice. Paste or photograph your own notes and have them broken down, explained segment by segment, and turned into a quiz whenever you're ready. Work through real past exam questions in a timed CBT-style practice mode, or upload your own past-paper PDF and have the model extract every question, answer them, and turn the whole thing into a playable practice test, all offline. Or just open a free chat and ask the model anything, no setup required. A daily question and streak tracking keep the habit going, and anything worth revisiting can be bookmarked. All of it runs against the same local model, on the student's own machine.

## Why it was built

Nigerian university students studying in Hausa-speaking regions of Northern Nigeria often deal with mobile data that's expensive relative to income, and connectivity that's patchy exactly when it matters most, the week before an exam, in a hostel room, on a bus with no signal. A cloud-only study app becomes unusable at the precise moment a student needs it. It also assumes English is the only language worth replying in, which doesn't match how these students actually think and talk, mixing Hausa and English naturally rather than switching fully into one or the other. ABUsites Companion was built to remove both dependencies at once: no connection required after setup, and no forced choice between "explained well" and "explained in a language that's actually comfortable."

## How we built it

The app runs on `gemma4:e2b`, accessed locally through Ollama, with an opt-in fallback to Gemma 4 via Google AI Studio for lower-spec hardware. No RAG and no fine-tuning, this is prompt engineering: every feature (syllabus generation, tutoring, notes, quizzes, chat) gets its own purpose-built system prompt funneled through a single inference route, rather than one generic assistant prompt reused everywhere. There's no retrieval step because there's nothing to search for, the app hands the model already-selected, already-known content directly, a specific note, a specific past question, not results pulled from a search over a corpus. The language behavior is the deepest part of that: prompts adapt bilingual Hausa/English output to whatever the student actually writes, tuned through direct testing against the real model rather than assumption.

On the framework side, this isn't a Python ML stack, there's no Transformers or Keras involved, since Gemma 4 runs entirely through Ollama's own inference server. The application itself is Next.js and TypeScript, with Prisma over SQLite for local storage, and Tailwind for the UI. That split matters: the model runs as its own local process, the app just talks to it over HTTP, the same way it would talk to any API.

Notes don't have to be typed, either. A student can photograph a page of handwritten or printed notes, and Gemma 4's multimodal input reads the image directly and breaks it into the same segment structure a pasted note would get, no separate OCR step involved. Structured features like syllabus and quiz generation constrain Gemma 4 to strict JSON output, since the rest of the app parses that response directly into the database. Responses aren't cut off at an arbitrary length either, replies stream back token by token and the model is left to stop on its own rather than hitting a fixed cap.

A one-time setup step installs dependencies and pulls the model. After that, the app is verified offline for real: an automated audit drives the whole app end to end on a production build and fails if a single request ever leaves localhost.

## Challenges overcome

Reliable Hausa output was the hardest problem. Early prompts told the model to "code-switch naturally," and in direct testing that produced Nigerian Pidgin English every time, not Hausa. The fix wasn't a stronger instruction in the same direction, it was a completely different kind of instruction: naming actual Hausa function words to use and explicitly ruling out Pidgin. Tested repeatedly against the real model, that combination is what finally produced consistent, grammatical Hausa.

Mid-conversation language switching was a separate, harder problem. A student might start a topic in English, then switch to Hausa for a follow-up (or the reverse), and the reply needs to switch with them. The first instinct was to ask the model to detect the last message's language itself and reply accordingly. Tested directly, repeatedly, in both directions: every wording tried fixed one direction while breaking the other, sometimes 5 out of 5 times, regardless of topic. Asking a model this size to both diagnose a language and act on that diagnosis in a single step just isn't reliable. The actual fix was architectural, not linguistic: the app detects the language itself, a cheap check, and hands the model a direct, unconditional command instead of a question it has to answer first. That got both directions reliable. The broader lesson carried into every other prompt in the app: a small local model follows direct instructions far better than it performs multi-step reasoning about its own instructions.

Structured output and Hausa didn't mix well either. Forcing Hausa into features that generate strict JSON, like syllabus and quiz generation, made the model unstable: the JSON would break mid-structure, or English commentary would leak into fields that were supposed to be clean data. Rather than fight that, those fields stay in English by design, titles and structure in English, explanations in whichever language the student chose.

Language selection itself went through a redesign. It started as one global toggle for the whole app, but that didn't match how students actually study, wanting Hausa for one subject and English for another, sometimes switching notes within the same subject. It became a per-topic, per-note choice instead, set once when the syllabus or note is created.

Fitting the model on ordinary student hardware was its own constraint. The larger `e4b` variant was the first thing tried, but its memory use made it impractical to expect on a typical laptop running alongside everything else a student has open, which is what pushed the switch to `e2b`.

And offline had to mean offline, not "mostly." That got checked directly rather than assumed, with an automated pass that drives the whole app on a production build and fails the moment a single request tries to leave localhost.

## Why the technical choices were right

Every choice here traces back to the same constraint: students, not infrastructure, decide what "good enough" means. Local `gemma4:e2b` was picked over a bigger model because it runs on hardware a student actually owns, an app that needs a machine most people don't have solves a problem nobody has. The per-topic language choice, rather than one global setting, matches how these students genuinely switch between Hausa and English by subject, not by mood. Keeping structured data in English while explanations flex with the student wasn't a compromise, it kept the parts of the app that have to be exact, exact, and left the parts that have to feel natural, natural. And removing the response length cap cost nothing technically but removed a real, if small, daily friction, since nobody was ever waiting on the model faster than they could read anyway.

## How it addresses the problem

The Local Languages & Literacy track asks for tools that meet people in the language and conditions they actually live in, not the ones a cloud API assumes. ABUsites Companion does that on both fronts at once: it works with no connection because the model never leaves the device, and it teaches in Hausa when that's genuinely more comfortable than English, adapting to whichever language a student is actually using, mid-conversation, not just at setup. Neither piece is a demo feature bolted onto an English-only, cloud-only app. Both are load-bearing, tested against the real model, and used every day the app is open, not just at exam time.
