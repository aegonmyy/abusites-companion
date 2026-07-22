# Chat

Chat is the one entry point in the app with no attached context at all, no
syllabus subunit, no note, no question. A student opens it and just talks.

## No scoping, no special setup

`src/app/chat/page.tsx` uses `generalChatSystemPrompt()`, `routeTag:
"chat"`, streamed. Unlike Study mode's tutor or Notes' segment chat, there's
no `StartLanguage` parameter here at all, every message in a general chat
is real student-typed text from the very first turn, there's no synthetic
auto-teach trigger to open with the way Study mode has. That means it
always uses `followUpLanguageLine()`, the adaptive, per-message language
detection described in `docs/model-integration.md`, and never reads
`Settings.language` as a default the way question-of-day or CBT review do.

## Message history is session-only

There's no `messages` column anywhere in the schema for chat. History
lives in plain React state for the duration of the page, the same
precedent already set by Study mode's subunit chat and Notes' segment
chat, none of them persist message history to the database either. If
you're considering adding persistent chat history, that's a real schema
change, not a small one, and it's worth checking whether the other two
chat surfaces in the app should get the same treatment for consistency
rather than making Chat a one-off exception.

## Voice input

The mic button here works the same way it does in Study mode and Notes,
real audio understanding through Ollama's OpenAI-compatible endpoint, not
its native `/api/chat` `images` field (that field doesn't carry audio, see
`docs/AUDIO_FINDING.md` for the full finding behind that). The recording
always gets re-encoded to WAV client-side before it's sent, rather than
relying on whatever codec the browser's native recorder happens to
produce.

## Streaming and rendering

Replies stream in token by token, same reader-loop pattern as every other
streaming surface in the app. Rendering goes through `react-markdown` with
`remark-gfm`, `remark-math`, and `rehype-katex`, so a reply with a table or
an inline formula renders properly rather than showing raw markdown or
LaTeX source.
