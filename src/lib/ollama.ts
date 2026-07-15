/**
 * Local Ollama client. Every call here is mandatory-shaped per the brief:
 * think:false, small num_ctx, keep_alive to pin the model in RAM, and a
 * per-route num_predict cap so a slow CPU produces short, dense output by
 * design rather than by accident.
 *
 * This file never talks to any network host other than localhost:11434.
 */

export const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";

// Shipped model is gemma4:e2b only (see brief: e4b has a reproducible
// OOM-kill history on 15GB RAM and may never be the default).
export const DEFAULT_MODEL = "gemma4:e2b";

// Keep the model resident in RAM across requests — reloading costs ~30s+ on
// the target CPU (measured on this VPS's cold call), which is unacceptable
// mid-conversation.
const KEEP_ALIVE = "30m";

const NUM_CTX = 4096;

/** Per-route output caps (tokens). Short output is a product decision.
 *
 * "audio" is intentionally much larger than "chat": empirically, Ollama's
 * OpenAI-compatible endpoint (the only one that accepts audio input — see
 * ollamaChatAudioStream) does not honor think:false / enable_thinking:false
 * for this model — every audio call produces a full internal reasoning
 * trace before the real answer, regardless of what's sent. That reasoning
 * burns num_predict budget the caller never sees (it's filtered out of the
 * stream), so the cap has to be large enough to survive it. This is a
 * documented, verified finding, not a guess — see docs/AUDIO_FINDING.md. */
export const NUM_PREDICT = {
  json: 400,
  lesson: 250,
  chat: 200,
  gloss: 80,
  audio: 400,
} as const;

export type RouteTag = keyof typeof NUM_PREDICT;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[]; // base64-encoded, no data: prefix
};

export type OllamaChatRequest = {
  routeTag: RouteTag;
  messages: ChatMessage[];
  model?: string;
  numPredictOverride?: number;
};

/**
 * Streams a chat completion from Ollama. Returns the raw fetch Response;
 * caller is responsible for transforming the NDJSON body (see
 * ndjsonToTextStream below) — kept separate so routes can also consume this
 * for non-streaming JSON-mode calls if needed later.
 */
export async function ollamaChatStream({
  routeTag,
  messages,
  model,
  numPredictOverride,
}: OllamaChatRequest): Promise<Response> {
  const body = {
    model: model ?? DEFAULT_MODEL,
    messages,
    think: false,
    stream: true,
    keep_alive: KEEP_ALIVE,
    options: {
      num_ctx: NUM_CTX,
      num_predict: numPredictOverride ?? NUM_PREDICT[routeTag],
    },
  };

  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Ollama request failed (${response.status}): ${text || response.statusText}`,
    );
  }

  return response;
}

export type AudioChatRequest = {
  system?: string;
  /** Prior text-only turns, oldest first. The audio is appended as the
   * final user turn. */
  history: ChatMessage[];
  audio: { base64: string; format: string };
  model?: string;
};

/**
 * Sends an audio message to the local model.
 *
 * VERIFIED FINDING (see docs/AUDIO_FINDING.md for the raw transcript):
 * Ollama's native /api/chat endpoint rejects a `content` array outright
 * (`json: cannot unmarshal array into Go struct field ... content of type
 * string`) — the `images` field only ever carries image bytes for this
 * model, not audio, despite `ollama show gemma4:e2b` listing "audio" as a
 * capability. Real audio input only works through Ollama's
 * OpenAI-compatible endpoint, POST /v1/chat/completions, using an
 * OpenAI-style content array with a `{"type":"input_audio","input_audio":
 * {"data":base64,"format":"wav"}}` block. Confirmed empirically: a
 * synthesized WAV clip saying "What is the powerhouse of the cell" was
 * correctly transcribed and answered ("The powerhouse of the cell is the
 * mitochondrion.") through this exact path.
 *
 * Only WAV was verified — this app always re-encodes to WAV client-side
 * before it gets here (src/lib/audio-record.ts) rather than trusting
 * MediaRecorder's native codec, per the brief.
 */
export async function ollamaChatAudioStream({
  system,
  history,
  audio,
  model,
}: AudioChatRequest): Promise<Response> {
  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    ...history,
    {
      role: "user",
      content: [
        { type: "input_audio", input_audio: { data: audio.base64, format: audio.format } },
      ],
    },
  ];

  const body = {
    model: model ?? DEFAULT_MODEL,
    messages,
    stream: true,
    max_tokens: NUM_PREDICT.audio,
  };

  const response = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Ollama audio request failed (${response.status}): ${text || response.statusText}`,
    );
  }

  return response;
}

/**
 * Transforms the OpenAI-compatible SSE stream ("data: {...}\n\n", terminated
 * by "data: [DONE]") into a plain UTF-8 text stream of content deltas.
 * Deliberately drops `delta.reasoning` chunks — the model's internal
 * thinking trace (see ollamaChatAudioStream) is never shown to the user,
 * only the final answer content.
 */
export function sseToTextStream(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  function processLine(line: string, controller: ReadableStreamDefaultController<Uint8Array>) {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const parsed = JSON.parse(payload);
      const chunk = parsed?.choices?.[0]?.delta?.content;
      if (typeof chunk === "string" && chunk.length > 0) {
        controller.enqueue(encoder.encode(chunk));
      }
    } catch {
      // ignore malformed line
    }
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) processLine(line, controller);
        }
        if (buffer.trim()) processLine(buffer, controller);
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * Transforms Ollama's newline-delimited JSON stream
 * ({"message":{"content":"..."},"done":false}\n...) into a plain UTF-8 text
 * stream of content deltas, easy to consume with a basic fetch + reader on
 * the client (no EventSource / SSE parsing needed).
 */
export function ndjsonToTextStream(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              const chunk = parsed?.message?.content;
              if (typeof chunk === "string" && chunk.length > 0) {
                controller.enqueue(encoder.encode(chunk));
              }
            } catch {
              // ignore malformed line
            }
          }
        }
        if (buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer);
            const chunk = parsed?.message?.content;
            if (typeof chunk === "string" && chunk.length > 0) {
              controller.enqueue(encoder.encode(chunk));
            }
          } catch {
            // ignore
          }
        }
      } finally {
        controller.close();
      }
    },
  });
}
