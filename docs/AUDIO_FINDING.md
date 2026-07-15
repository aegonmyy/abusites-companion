# Audio input via Ollama — verified finding

`gemma4:e2b` lists `audio` as a capability (`ollama show gemma4:e2b`), but
how to actually reach it is undocumented and non-obvious. This is the raw
record of what was tried and what actually works, run against Ollama
0.32.0 + `gemma4:e2b` on this machine.

## What doesn't work

Ollama's native `POST /api/chat` endpoint — the one the rest of this app
uses for text and image input via the `images` field
(`src/lib/ollama.ts` → `ollamaChatStream`) — does **not** accept audio:

- Sending raw WAV bytes through the `images` field (same field used for
  photos) does not error, but the model responds as if no audio were
  attached ("I'm sorry, but I cannot access or listen to any attached
  audio files"). `prompt_eval_count` for that call was 69 tokens for an
  81KB WAV file — far too small for the audio to have actually been
  tokenized. The field silently drops non-image bytes.
- Sending an OpenAI-style `content` array (`[{type:"text",...},
  {type:"input_audio",...}]`) to `/api/chat` fails outright:
  `{"error":"json: cannot unmarshal array into Go struct field
  ChatRequest.messages.content of type string"}` — this endpoint's
  `content` field is strictly a string.

## What works

`POST /v1/chat/completions` (Ollama's OpenAI-compatible endpoint) accepts
a `content` array with an `input_audio` block:

```json
{
  "model": "gemma4:e2b",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": [
      { "type": "input_audio", "input_audio": { "data": "<base64 WAV>", "format": "wav" } }
    ]}
  ],
  "stream": true,
  "max_tokens": 400
}
```

Verified with a synthesized WAV clip (`espeak-ng`, 16-bit PCM mono,
22050Hz) saying "What is the powerhouse of the cell":

- The model's `reasoning` field correctly transcribed the audio content
  ("...the question asked is 'What is the power house of the cell?'").
- The final `content` field gave the correct answer: **"The powerhouse of
  the cell is the mitochondrion."**
- Only tested with raw WAV. Not tested: mp3, native MediaRecorder
  webm/opus output sent directly. The app never relies on this — it
  always re-encodes to WAV client-side first (`src/lib/audio-record.ts`),
  per the brief's explicit instruction not to assume the native codec
  works.

## Caveats found along the way

1. **`think:false` is not honored on this endpoint for this model.**
   Every audio call produces a full internal reasoning trace regardless
   of `think:false`, `chat_template_kwargs.enable_thinking:false`, or
   `reasoning_effort:"low"` — all three were tried; none suppressed it.
   The app never surfaces `delta.reasoning` to the user (`sseToTextStream`
   in `src/lib/ollama.ts` drops it, only forwards `delta.content`), but
   the token budget has to cover the reasoning trace before the real
   answer starts. This is why `NUM_PREDICT.audio` (400) is roughly 2x
   `NUM_PREDICT.chat` (200) — a direct, measured consequence of this
   finding, not an arbitrary choice.
2. **Latency**: end-to-end (audio in, first content token out) measured
   13–16s on this dev VPS for a one-sentence question, most of it spent
   on the mandatory reasoning trace. This is expected to be materially
   slower on the 2015 dual-core EliteBook target — flagged for the
   Phase 4 benchmark table (pending real hardware access).
3. **Native `/api/chat` `images` field genuinely only does vision.** Don't
   assume a capability flag from `ollama show` means every endpoint
   exposes it the same way.

## Where this is used in the app

- `src/lib/ollama.ts` — `ollamaChatAudioStream`, `sseToTextStream`.
- `src/app/api/llm/route.ts` — `audio` field on the request body routes
  through the audio path instead of the native one.
- `src/lib/audio-record.ts` — client-side mic capture + WAV re-encoding.
- Mic input is wired into the study-mode subunit tutor chat
  (`src/app/study/syllabus/[id]/page.tsx`) and the notes chat
  (`src/app/notes/[id]/page.tsx`).
- `tests/phase3-voice-tour.mjs` — real Playwright verification using
  Chromium's fake-audio-capture flag to feed a real synthesized WAV file
  as the microphone input, through the full client → `/api/llm` →
  Ollama → streamed response pipeline.
