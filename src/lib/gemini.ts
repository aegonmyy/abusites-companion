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
 * MODEL ID: confirmed directly against the live API's ListModels response
 * (2026-07-17) using a real key — two Gemma 4 variants are available,
 * `gemma-4-26b-a4b-it` (26B total / 4B active, MoE) and `gemma-4-31b-it`
 * (dense). DEFAULT_CLOUD_MODEL below picks the lighter A4B variant, a
 * closer match to the free-tier rate limits (15 RPM / 16k TPM) this app
 * should default to for a student's own free-tier key. The Settings
 * "Cloud model" field lets a user override this to the 31B variant or any
 * other model id they have access to.
 *
 * THINKING OVERHEAD (verified empirically against the real API, not a
 * guess): this model streams internal reasoning as ordinary content parts
 * flagged `"thought": true`, unrequested and unfiltered by default — the
 * same class of finding as ollamaChatAudioStream's documented behavior for
 * the local model's audio endpoint (see docs/AUDIO_FINDING.md). There is
 * no way to disable it: `generationConfig.thinkingConfig.thinkingBudget`
 * returns `400 Thinking budget is not supported for this model`. Measured
 * cost: a trivial "Say OK and nothing else" burned 82 thinking tokens
 * before the 1-token real answer; a realistic gloss-shaped explanation
 * prompt burned 647 thinking tokens against 193 real content tokens.
 * sseToGeminiTextStream filters `thought:true` parts out of what the user
 * sees; CLOUD_THINKING_BUFFER below inflates every route's token budget so
 * the real answer doesn't get cut off by MAX_TOKENS before it ever starts
 * (this app's local NUM_PREDICT budgets, e.g. gloss:80, are sized for a
 * model with no thinking overhead at all and are nowhere near enough on
 * their own).
 */
import { NUM_PREDICT, TEMPERATURE, type RouteTag, type ChatMessage } from "./ollama";

export const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
export const DEFAULT_CLOUD_MODEL = "gemma-4-26b-a4b-it";

/** Headroom added on top of the route's normal token budget to survive
 * this model's hidden thinking pass — see the file doc comment above for
 * the measurements this is based on. 900 comfortably covers the largest
 * observed real case (647) with margin for run-to-run variance. */
const CLOUD_THINKING_BUFFER = 900;

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
  const maxOutputTokens = (numPredictOverride ?? NUM_PREDICT[routeTag]) + CLOUD_THINKING_BUFFER;
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
      const parts: { text?: string; thought?: boolean }[] = parsed?.candidates?.[0]?.content?.parts ?? [];
      // Drop thought:true parts — the model's internal reasoning trace,
      // never meant to be shown to the user. See the file doc comment for
      // why this is unavoidable rather than something a flag turns off.
      const chunk = parts
        .filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("");
      if (chunk.length > 0) {
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
