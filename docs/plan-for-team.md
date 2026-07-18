# The Plan — Abusites Companion

Hey — now that you've had a look at the earlier reference design, this'll make a lot more sense. Short version: we're taking the earlier reference design's *idea* and rebuilding it to run entirely on a student's own laptop, no internet, no accounts. Everything below is what I'm thinking. Poke holes wherever you want — this is a plan, not a decree.

## Why we're even doing this

The hackathon is **Build With Gemma (GDG on Campus ABU Zaria), Track 1: Local Languages & Literacy — Hausa**. Deadline July 25. The whole judging angle is: *cloud AI doesn't work for students in Northern Nigeria who have bad or no internet and study in Hausa.* So a slick cloud app — which is basically what the earlier reference design is — actually scores badly here. The winning story is "pull the wifi cable and it still teaches you, in your language." That single idea drives every cut and every addition below.

So think of the earlier reference design as our **feature and UX blueprint**, not our codebase. We're keeping the good study flows and throwing away everything that assumes a server and a login.

## The one big pivot everything hangs off

The earlier reference design is: Supabase (Postgres + Auth + Realtime) + Gemini (cloud AI) + accounts.

Ours is: **SQLite on the device + Gemma 4 running locally through Ollama + no accounts at all.**

That's the whole move. Once you accept "it all runs on the laptop, offline," the cut list and the add list basically write themselves.

## What I'm cutting (and why)

- **Auth / login / accounts** → gone. There's one implicit local user. No sign-up, no sessions, no user table. the earlier reference design's whole `user_profiles` / auth-gated dashboard disappears. (Why: no server to authenticate against, and it's a personal offline tool — a login screen would be pure friction.)
- **Supabase as the live backend** → gone from the running app. We still borrow its *data* once (see "seeding" below), but the app itself never talks to Supabase at runtime. Postgres → local SQLite.
- **Gemini / any cloud model** → gone as the default. Replaced by local Gemma. (There *may* be an optional "use cloud for higher quality when you happen to be online" toggle, but it's strictly opt-in, clearly labelled, and never automatic. Lowest priority — likely cut if we're tight on time.)
- **Realtime** → not needed, nothing's syncing to a server.
- **Admin panel, support chat, notifications, billing / pricing / "Get Plus", workspace switching** → all gone. Every one of those assumes accounts and a business behind the app. We're a single offline study tool, not a SaaS.

If it existed in the earlier reference design only because the earlier reference design is a cloud product with paying users, it's cut. That's the rule.

## What I'm keeping (ported, not copied)

These are the actual study experiences worth keeping — we rebuild each one against SQLite + local Gemma instead of Supabase + Gemini:

- **Study mode** — the core loop: type a topic + goal → get a compact syllabus → work through subunits with a streaming tutor. This is the heart of it.
- **Past questions + CBT** — browse courses, do timed practice, get scored.
- **Question of the Day, streaks, bookmarks** — the light engagement stuff. Cheap to keep, nice to have.
- **Notes flow** — feed it your material, get a summary + key concepts + a quick quiz.
- **MathText / KaTeX rendering** — the earlier reference design already does this well and it matters for STEM content; we reuse the same markdown+math stack.

One deliberate change I made to the study content itself: syllabi are **shorter and denser** than the earlier reference design's. That's not laziness — on a 2015 laptop with no GPU the model is slow, so short, punchy lessons ("here's the core idea, ask me to go deeper") genuinely beat long essays. Tight output is a *design choice* for this hardware, not a limitation we're apologising for.

## What I'm adding (stuff the earlier reference design never had)

This is where it becomes its own thing:

- **Fully offline, for real** — every feature works with the network cable pulled. We prove it, not just claim it (there's an automated check that asserts the app never makes a single request off the device). This *is* the pitch.
- **Local Gemma via Ollama** — with the model pinned in memory and tight limits so it stays usable on weak hardware.
- **Image input** — snap a photo of your notes or a textbook question, the model reads it and explains. (Gemma's vision, running locally.)
- **Voice input** — speak a question, in Hausa or English, and it answers. This one's a genuine technical find: Gemma 4 can take audio *directly*, no separate speech-to-text step — worth showing off in the demo.
- **PDF upload** — drop in a PDF of notes, we extract the text on-device (no cloud OCR) and study from it.
- **Hausa + English with natural code-switching** — this is the actual differentiator for the track. Explanations in Hausa, technical terms kept in English with a gloss, and it answers you in whatever language you asked in. We've got a proper eval set to sanity-check the Hausa quality — and honestly this is the part I'd most want a fluent Hausa speaker (you? someone you know?) to actually read and grade.
- **Runs as an installable offline app (PWA)** + Windows-friendly setup, because the demo laptop is a Windows machine.

## The one bit of Supabase we *do* use (seeding)

We do a **one-time pull** of the course/past-question catalog out of Supabase into our local SQLite, at setup time only — never at runtime. Heads up: some of those tables came back empty for us, which is probably a permissions (RLS) thing on the source project rather than the data genuinely being empty. **I'll need you (or whoever owns that Supabase project) to either open up read access, or hand me a key that can read those tables**, otherwise the past-questions section has courses but no questions to practise. That's the one concrete blocker I need resolved.

## On the look/UI

Separate from all the above, I'm reworking the visual design (cleaner, light, calmer — moving away from anything that reads as a generic dark dashboard). That's still in flux, so don't anchor on the current look — the *features and flows* above are the stable part. If you've got strong opinions on the visual direction, now's a good time.

## Where I'd genuinely want your input

1. **Hausa quality** — the single most important thing for the track, and the thing I can least judge alone. Can you review the tutor's Hausa output, or line up someone who can?
2. **The seeding/permissions blocker** — need read access to those past-question tables.
3. **Scope sanity check** — anything in the "keep" list you'd actually cut, or anything I've cut that you think is worth fighting for?
4. **Visual direction** — open to input while it's still moving.

That's the plan. Tear into it.
