import { prisma } from "@/lib/prisma";
import { ollamaChatStream, ndjsonToTextStream, DEFAULT_MODEL, type ChatMessage, type RouteTag } from "@/lib/ollama";

export const runtime = "nodejs";

type LlmRequestBody = {
  routeTag: RouteTag;
  messages: ChatMessage[];
  system?: string;
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

  const { routeTag, messages, system } = body;

  if (!routeTag || !["json", "lesson", "chat", "gloss"].includes(routeTag)) {
    return new Response(JSON.stringify({ error: "Invalid or missing routeTag." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages must be a non-empty array." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const model = settings?.model ?? DEFAULT_MODEL;

  const fullMessages: ChatMessage[] = system
    ? [{ role: "system", content: system }, ...messages]
    : messages;

  let upstream: Response;
  try {
    upstream = await ollamaChatStream({ routeTag, messages: fullMessages, model });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({
        error:
          "Local model unavailable. Is Ollama running (http://localhost:11434)? " +
          message,
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const textStream = ndjsonToTextStream(upstream.body!);

  return new Response(textStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Model": model,
    },
  });
}
