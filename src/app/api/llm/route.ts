import { prisma } from "@/lib/prisma";
import {
  ollamaChatStream,
  ollamaChatAudioStream,
  ndjsonToTextStream,
  sseToTextStream,
  DEFAULT_MODEL,
  type ChatMessage,
  type RouteTag,
} from "@/lib/ollama";
import { geminiChatStream, sseToGeminiTextStream, DEFAULT_CLOUD_MODEL } from "@/lib/gemini";

export const runtime = "nodejs";

type LlmRequestBody = {
  routeTag: RouteTag;
  messages: ChatMessage[];
  system?: string;
  /** Present only for voice input (see src/lib/audio-record.ts) — routes
   * this call through the audio-capable OpenAI-compatible endpoint instead
   * of the native one. See ollamaChatAudioStream for why. */
  audio?: { base64: string; format: string };
  /** Explicit per-call token-budget override. Used by Notes: the segment-
   * split call ("json") asks for a smaller budget than the full syllabus
   * cap, and the per-segment deep-explanation call ("lesson") uses this to
   * implement the three depth tiers (quick/standard/deep) as a per-request
   * choice rather than new fixed NUM_PREDICT route entries. Takes priority
   * over the route's own NUM_PREDICT default when present. Clamped
   * defensively either way. There's no Settings-level "Response length"
   * override anymore — see ollama.ts's NUM_PREDICT doc comment for why the
   * conversational routes are uncapped by default now. */
  numPredictOverride?: number;
};

/**
 * The single local-inference entry point for the whole app. Every feature
 * (tutor chat, syllabus generation, QOTD gloss, notes summary, image/audio
 * input) goes through this route so the mandatory Ollama call shape
 * (think:false, num_ctx, keep_alive, per-route num_predict) lives in one
 * place.
 */
export async function POST(request: Request) {
  let body: LlmRequestBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { routeTag, messages, system, audio, numPredictOverride: clientNumPredictOverride } = body;

  if (!routeTag || !["json", "lesson", "chat", "gloss", "audio"].includes(routeTag)) {
    return new Response(JSON.stringify({ error: "Invalid or missing routeTag." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "messages must be an array." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!audio && messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages must be non-empty unless audio is present." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (audio && (typeof audio.base64 !== "string" || !audio.base64)) {
    return new Response(JSON.stringify({ error: "audio.base64 is required when audio is present." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const isCloud = settings?.modelSource === "cloud";
  const model = isCloud ? settings?.cloudModel ?? DEFAULT_CLOUD_MODEL : settings?.model ?? DEFAULT_MODEL;

  if (isCloud && !settings?.cloudApiKey) {
    return new Response(
      JSON.stringify({ error: "Cloud mode is on but no API key is set. Add one in Settings, or switch back to Local (Ollama)." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // User-configurable override from Settings ("Response creativity") — only
  // ever applied to the conversational routes (lesson/chat/gloss/audio),
  // never "json" (structural JSON reliability stays fixed regardless of
  // what the user picks). Re-clamped here even though /api/settings already
  // clamps on write, since this is the actual point where an out-of-range
  // value would reach Ollama.
  const temperatureOverride =
    routeTag !== "json" && typeof settings?.temperature === "number"
      ? Math.min(1, Math.max(0, settings.temperature))
      : undefined;
  const numPredictOverride =
    typeof clientNumPredictOverride === "number" && Number.isFinite(clientNumPredictOverride)
      ? Math.min(2500, Math.max(80, Math.round(clientNumPredictOverride)))
      : undefined;

  let upstream: Response;
  let textStream: ReadableStream<Uint8Array>;
  try {
    const fullMessages: ChatMessage[] = system
      ? [{ role: "system", content: system }, ...messages]
      : messages;

    if (isCloud) {
      // Gemini's API takes audio as just another part on the same call —
      // no separate endpoint needed, unlike Ollama's native/OpenAI-compat
      // split (see ollamaChatAudioStream).
      upstream = await geminiChatStream({
        routeTag,
        messages: fullMessages,
        apiKey: settings!.cloudApiKey!,
        model,
        numPredictOverride,
        temperatureOverride,
        audio,
      });
      textStream = sseToGeminiTextStream(upstream.body!);
    } else if (audio) {
      upstream = await ollamaChatAudioStream({
        system,
        history: messages,
        audio,
        model,
        numPredictOverride,
        temperatureOverride,
      });
      textStream = sseToTextStream(upstream.body!);
    } else {
      upstream = await ollamaChatStream({
        routeTag,
        messages: fullMessages,
        model,
        numPredictOverride,
        temperatureOverride,
      });
      textStream = ndjsonToTextStream(upstream.body!);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = isCloud
      ? "Cloud model call failed. Check your API key in Settings and your internet connection. "
      : "Local model unavailable. Is Ollama running (http://localhost:11434)? ";
    return new Response(
      JSON.stringify({ error: hint + message }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(textStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Model": model,
    },
  });
}
