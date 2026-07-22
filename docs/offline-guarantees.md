# Offline guarantees

"Runs offline" is the whole point of this app, so it's worth being precise
about what that claim actually means and how it's checked, rather than
just trusting that nobody added a stray network call.

## What "offline" means here

In local mode (the default), after the one-time setup, every single
feature works with no network connection at all: syllabus generation,
tutoring, notes (including PDF text extraction and image reading), quizzes,
past questions and CBT, chat, the PDF-to-CBT upload pipeline. The model
itself runs on the student's own machine via Ollama. Nothing about using
the app after setup ever needs the network cable plugged in.

Setup itself does need internet once: pulling `gemma4:e2b` is a roughly 7GB
download, and `npm install` needs the npm registry. That's expected and
unavoidable, the guarantee is about runtime use, not installation.

Cloud mode is the one deliberate exception, see
`docs/model-integration.md` and the README's "Model source" section for
why it exists. If `Settings.modelSource` is `"cloud"`, model calls do go
out over HTTPS to Google's API. That's an explicit, opt-in tradeoff a
student makes when their hardware can't run a local model at all, not a
silent leak in the local-mode story.

## How this is actually verified

Claiming an app is offline and actually checking it are different things,
a `next/font` reference, a stray CDN asset, a debug `fetch` left in during
development, any of these would quietly break the guarantee without
looking like a bug in code review.

`tests/phase4-offline-audit.mjs` is the real check. It's a Playwright
script that drives a full production build through the app in a real
browser, real local server, real local Ollama, nothing mocked, and
inspects every single network request the browser makes along the way. If
any request's hostname isn't `localhost`, `127.0.0.1`, or the app's own
base host, the audit fails and prints every offending URL.

The walkthrough it drives is broad on purpose: dashboard, question of the
day, study mode's intake form, notes and the new-note form, past questions
and into a course detail page, bookmarks, settings, and then, deliberately,
a real syllabus generation call. That last step matters most, a model call
is the single request class most likely to have a stray external
dependency if someone left a cloud fallback wired in by mistake, or if a
CDN reference sneaks in through a dependency upgrade.

Run it against a real production build, not dev mode:

```bash
npm run build && npm start &
node tests/phase4-offline-audit.mjs
```

A pass looks like:

```
PASS — zero non-localhost network requests across dashboard, study, notes,
past-questions, CBT entry, bookmarks, settings, and a real syllabus
generation call.
```

## When to re-run this

Any change that touches a dependency, adds a font, adds an image, adds any
kind of asset loading, or touches anything in `src/lib/gemini.ts` or
`src/lib/ollama.ts`, is worth re-running this audit before it ships. It's
cheap to run and it's the only thing in the repo that actually confirms
the offline claim rather than assuming it from reading the code.

The audit only covers the pages and flows it's told to visit. If you add a
genuinely new page or a new model-calling feature, consider extending the
walkthrough in `phase4-offline-audit.mjs` to visit it too, an offline
guarantee that only covers half the app isn't really a guarantee.
