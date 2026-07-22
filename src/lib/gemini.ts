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
 * the local model's audio endpoint (see docs/AUDIO_FINDING.md). The
 * documented way to disable it doesn't work:
 * `generationConfig.thinkingConfig.thinkingBudget` returns `400 Thinking
 * budget is not supported for this model` on both available Gemma 4
 * variants (26b-a4b and 31b dense — tried both directly). Un-costed at
 * first: a trivial "Say OK and nothing else" burned 82 thinking tokens
 * before the 1-token real answer; a realistic gloss-shaped explanation
 * prompt burned 647 thinking tokens against 193 real content tokens; a real
 * syllabus-generation call burned 1538 thinking tokens, 44.3s total before
 * this was found. The actual fix, `thinkingConfig.thinkingLevel:"MINIMAL"`
 * — a different, undocumented parameter, not `thinkingBudget` — does work,
 * confirmed directly (no `thoughtsTokenCount` at all in the response
 * afterward, same syllabus call down to ~12s with identical correct
 * output). Applied below on every request. sseToGeminiTextStream still
 * filters `thought:true` parts as defense in depth, in case any thinking
 * content ever slips through despite MINIMAL.
 *
 * TOKEN BUDGET, DELIBERATELY NOT ROUTE-CAPPED: ollama.ts's NUM_PREDICT
 * table (gloss:80, chat:200, etc.) exists to keep output short and fast on
 * weak local hardware — that reasoning has nothing to do with a cloud call,
 * which runs on Google's infrastructure, not the student's machine. Given
 * the thinking overhead above, reusing those small local caps here would
 * have truncated almost every real reply before it started. Cloud calls
 * instead always request CLOUD_MAX_OUTPUT_TOKENS, the model's own real
 * ceiling (`outputTokenLimit: 32768`, confirmed via GET
 * /v1beta/models/gemma-4-26b-a4b-it with a real key) — the only guardrails
 * that should apply to a cloud call are the ones the API itself enforces
 * (this output ceiling, and the account's RPM/TPM rate limit), not an
 * artificial local-hardware-shaped one. The model still stops naturally at
 * `finishReason: STOP` once it's actually done (verified: real replies in
 * testing ended at 90-943 total tokens, nowhere near this ceiling) — a
 * high ceiling doesn't mean every reply becomes long, it just means a
 * genuinely long one is never cut off. `numPredictOverride` stays in this
 * function's signature only to keep the same call shape as
 * ollamaChatStream (every /api/llm call site passes it); it's intentionally
 * unused for the token cap here. `routeTag` is still used, just for
 * temperature (via TEMPERATURE[routeTag]) and the "json" response-mode
 * switch below, not for sizing output.
 */
import { TEMPERATURE, type RouteTag, type ChatMessage } from "./ollama";

export const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
export const DEFAULT_CLOUD_MODEL = "gemma-4-26b-a4b-it";

/** The model's real output ceiling (see file doc comment) — not a budget
 * this app is choosing, just what the API itself allows. */
const CLOUD_MAX_OUTPUT_TOKENS = 32768;

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
  // numPredictOverride is accepted (see GeminiChatRequest) only to keep the
  // same call shape as ollamaChatStream — every /api/llm call site passes
  // it — but deliberately unused here; see CLOUD_MAX_OUTPUT_TOKENS's doc
  // comment for why.
  temperatureOverride,
  audio,
}: GeminiChatRequest): Promise<Response> {
  const system = messages.find((m) => m.role === "system")?.content;
  const temperature = routeTag === "json" ? TEMPERATURE.json : temperatureOverride ?? TEMPERATURE[routeTag];
  // Deliberately not numPredictOverride ?? NUM_PREDICT[routeTag] — see the
  // file doc comment on CLOUD_MAX_OUTPUT_TOKENS for why local's per-route
  // budgets don't apply to a cloud call.
  const maxOutputTokens = CLOUD_MAX_OUTPUT_TOKENS;
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
      // thinkingConfig.thinkingBudget is flatly rejected for this model
      // ("Thinking budget is not supported for this model") — confirmed
      // directly, that's not this. thinkingLevel:"MINIMAL" is a different,
      // undocumented-but-real parameter that actually works: verified
      // directly against the live API, the real syllabus-generation prompt
      // went from 44.3s (1538 thinking tokens before any real content) down
      // to ~12s with no thoughtsTokenCount at all in the response, same
      // correct output. Applied to every route, not just "json" — the same
      // thinking tax hits conversational routes too (a realistic gloss
      // prompt burned 647 thinking tokens against 193 real content tokens
      // per the file doc comment above), and cloud mode exists specifically
      // for latency/hardware-constrained cases where this matters most.
      thinkingConfig: { thinkingLevel: "MINIMAL" },
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
