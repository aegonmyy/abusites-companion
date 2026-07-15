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

/** Per-route output caps (tokens). Short output is a product decision. */
export const NUM_PREDICT = {
  json: 400,
  lesson: 250,
  chat: 200,
  gloss: 80,
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
