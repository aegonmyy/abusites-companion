/**
 * Cloud model client — Google AI Studio's Generative Language API, used
 * when Settings.modelSource is "cloud" instead of the default "local"
 * (Ollama, see src/lib/ollama.ts). Exists for students whose hardware can't
 * run a local model at all (low RAM, no room for a multi-GB download), who
 * have some network access even if it's too limited/expensive to make a
 * cloud-only app usable all day. See README for the actual local-vs-cloud
 * decision guide — this file is deliberately built to the same external
 * contract as ollama.ts (same RouteTag budgets, same ChatMessage shape, same
 * "raw fetch Response in, caller applies a stream transformer" pattern) so
 * /api/llm/route.ts can switch between them with one branch, and the client
 * side (every component that calls /api/llm) needs zero changes either way.
 *
 * MODEL ID: DEFAULT_CLOUD_MODEL below is a placeholder pointing at the
 * current Gemini-API naming convention for a Gemma model
 * ("gemma-3-27b-it"-style) — Google AI Studio's model picker is the source
 * of truth for whatever the actual "Gemma 4" model id is at demo time; this
 * constant (and the Settings "Cloud model" field, which overrides it) must
 * be checked against that picker before relying on it. Do not assume this
 * string is correct without checking.
 */
import { NUM_PREDICT, TEMPERATURE, type RouteTag, type ChatMessage } from "./ollama";

export const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
export const DEFAULT_CLOUD_MODEL = "gemma-3-27b-it";

export type GeminiChatRequest = {
  routeTag: RouteTag;
  messages: ChatMessage[];
  apiKey: string;
  model?: string;
  numPredictOverride?: number;
  temperatureOverride?: number;
  /** Present only for voice input — see ollamaChatAudioStream's doc comment
   * for the local equivalent. Gemini's API takes audio as just another
   * inline part on the same endpoint, unlike Ollama's split between a
   * native and an OpenAI-compatible endpoint, so there's no separate
   * "audio stream" function needed here. */
  audio?: { base64: string; format: string };
};

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

const AUDIO_MIME: Record<string, string> = {
  wav: "audio/wav",
  webm: "audio/webm",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
};

/** Maps this app's role vocabulary ("system" | "user" | "assistant") onto
 * Gemini's ("user" | "model", with system carried in a separate top-level
 * field rather than as a content turn). */
function toGeminiContents(messages: ChatMessage[], audio?: GeminiChatRequest["audio"]): GeminiContent[] {
  const contents: GeminiContent[] = [];
  for (const m of messages) {
    if (m.role === "system") continue; // handled separately via systemInstruction
    const parts: GeminiPart[] = [{ text: m.content }];
    if (m.images?.length) {
      for (const img of m.images) parts.push({ inlineData: { mimeType: "image/jpeg", data: img } });
    }
    contents.push({ role: m.role === "assistant" ? "model" : "user", parts });
  }
  if (audio) {
    const mimeType = AUDIO_MIME[audio.format] ?? "audio/wav";
    const last = contents[contents.length - 1];
    if (last?.role === "user") {
      last.parts.push({ inlineData: { mimeType, data: audio.base64 } });
    } else {
      contents.push({ role: "user", parts: [{ inlineData: { mimeType, data: audio.base64 } }] });
    }
  }
  return contents;
}

/**
 * Streams a chat completion from Google's Generative Language API. Returns
 * the raw fetch Response (SSE body, ?alt=sse) — caller applies
 * sseToGeminiTextStream below, mirroring ollamaChatStream's contract.
 */
export async function geminiChatStream({
  routeTag,
  messages,
  apiKey,
  model,
  numPredictOverride,
  temperatureOverride,
  audio,
}: GeminiChatRequest): Promise<Response> {
  const system = messages.find((m) => m.role === "system")?.content;
  const temperature = routeTag === "json" ? TEMPERATURE.json : temperatureOverride ?? TEMPERATURE[routeTag];
  const maxOutputTokens = numPredictOverride ?? NUM_PREDICT[routeTag];
  const modelId = model ?? DEFAULT_CLOUD_MODEL;

  const body = {
    contents: toGeminiContents(messages, audio),
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig: {
      temperature,
      maxOutputTokens,
      // Same constrained-decoding idea as Ollama's format:"json" — forces
      // structurally valid JSON at the source for the "json" route.
      ...(routeTag === "json" ? { responseMimeType: "application/json" } : {}),
    },
  };

  const url = `${GEMINI_API_URL}/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(`Gemini request failed (${response.status}): ${text || response.statusText}`);
  }

  return response;
}

/**
 * Transforms Gemini's SSE stream ("data: {...}\n\n") into a plain UTF-8
 * text stream of content deltas — the same external shape
 * ndjsonToTextStream/sseToTextStream produce for the local path, so
 * /api/llm/route.ts can treat both providers identically past this point.
 */
export function sseToGeminiTextStream(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  function processLine(line: string, controller: ReadableStreamDefaultController<Uint8Array>) {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    try {
      const parsed = JSON.parse(payload);
      const chunk = parsed?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
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
