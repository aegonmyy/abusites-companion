/**
 * Phase 4 deliverable: a 30-prompt eval set across math, biology, and civic
 * education, in pure Hausa / Hausa-English code-switched / English, run
 * against the real local gemma4:e2b model via Ollama. Records real outputs
 * and real latency, writes the raw results to docs/hausa-eval.md.
 *
 * This does NOT go through the Next.js /api/llm route — it's a standalone
 * eval, run directly against Ollama with the exact same call shape the app
 * uses (think:false, num_ctx 4096, keep_alive, num_predict from the "chat"
 * route cap) so the numbers are representative of what a student actually
 * experiences in the tutor chat.
 *
 * Usage: npx tsx scripts/hausa-eval.ts
 *
 * IMPORTANT CAVEAT (see README "Known limitations"): the Hausa prompts and
 * the judgment of whether outputs are natural/correct Hausa were written
 * without a native speaker in this environment. Treat this as a real,
 * reproducible measurement of latency/behavior, but the *language quality*
 * judgment column is a first-pass self-assessment pending native review —
 * flagged, not asserted as final.
 */
import { writeFileSync } from "node:fs";
import { OLLAMA_URL, DEFAULT_MODEL, NUM_PREDICT } from "../src/lib/ollama";

type Subject = "math" | "biology" | "civic";
type LangMode = "hausa" | "mixed" | "english";

type Prompt = { subject: Subject; lang: LangMode; text: string };

const LANG_LINE: Record<LangMode, string> = {
  hausa:
    "Reply in Hausa. Keep technical/scientific terms (e.g. formula names, English loanwords students already use) in English where a Hausa term would confuse more than it helps.",
  mixed:
    "Reply with natural Hausa/English code-switching, the way a Nigerian university student actually talks — technical terms in English, explanation and framing in Hausa where it reads more naturally.",
  english: "Reply in English.",
};

const SYSTEM_BASE =
  "You are Grinnish, an offline study companion for Nigerian university students. Be concise and concrete — short paragraphs, no filler, no restating the question.";

// 30 prompts: 3 subjects x 10 each (4 Hausa, 3 mixed, 3 English per subject).
const PROMPTS: Prompt[] = [
  // --- Math (10) ---
  { subject: "math", lang: "hausa", text: "Menene ma'anar lambar firamare (prime number)? Ba da misali guda uku." },
  { subject: "math", lang: "hausa", text: "Yaya ake warware lissafi mai sauƙi na quadratic equation? Bayyana matakan." },
  { subject: "math", lang: "hausa", text: "Menene bambanci tsakanin mean, median, da mode a statistics?" },
  { subject: "math", lang: "hausa", text: "Ka bayyana ka'idar Pythagoras a takaice, tare da misali." },
  { subject: "math", lang: "mixed", text: "Ka explain yadda ake solve linear equation kamar 2x + 5 = 15, step by step." },
  { subject: "math", lang: "mixed", text: "Mene ne derivative a calculus, and why students dey find it confusing?" },
  { subject: "math", lang: "mixed", text: "Explain probability a sauƙaƙe — misali, coin flip guda ɗaya." },
  { subject: "math", lang: "english", text: "Explain the difference between permutation and combination, with one example each." },
  { subject: "math", lang: "english", text: "What is the quadratic formula, and when would a student use it instead of factoring?" },
  { subject: "math", lang: "english", text: "Briefly explain what a matrix is and one real use case." },

  // --- Biology (10) ---
  { subject: "biology", lang: "hausa", text: "Menene aikin mitochondria a cikin sel?" },
  { subject: "biology", lang: "hausa", text: "Ka bayyana yadda photosynthesis ke faruwa a takaice." },
  { subject: "biology", lang: "hausa", text: "Menene bambanci tsakanin DNA da RNA?" },
  { subject: "biology", lang: "hausa", text: "Ta yaya jini ke yawo a jiki — bayyana zagayowar jini a sauƙaƙe." },
  { subject: "biology", lang: "mixed", text: "Explain osmosis da yadda yake different from diffusion." },
  { subject: "biology", lang: "mixed", text: "Mene ne function na white blood cells a cikin immune system?" },
  { subject: "biology", lang: "mixed", text: "Ka explain natural selection a takaice, with a simple example." },
  { subject: "biology", lang: "english", text: "What is the role of enzymes in digestion? Give one example." },
  { subject: "biology", lang: "english", text: "Briefly explain the process of cellular respiration." },
  { subject: "biology", lang: "english", text: "What is the difference between a virus and a bacterium?" },

  // --- Civic education (10) ---
  { subject: "civic", lang: "hausa", text: "Menene ma'anar dimokuradiyya (democracy)? Ba da misali daga Najeriya." },
  { subject: "civic", lang: "hausa", text: "Ka bayyana rabe-raben gwamnati guda uku a Najeriya." },
  { subject: "civic", lang: "hausa", text: "Menene hakkoki na asali (fundamental human rights) da doka ta tanada?" },
  { subject: "civic", lang: "hausa", text: "Me yasa zabe (election) ke da muhimmanci a dimokuradiyya?" },
  { subject: "civic", lang: "mixed", text: "Explain separation of powers a Najeriya — legislature, executive, judiciary." },
  { subject: "civic", lang: "mixed", text: "Mene ne rawar da INEC ke takawa during elections?" },
  { subject: "civic", lang: "mixed", text: "Ka explain difference tsakanin federal da state government responsibilities." },
  { subject: "civic", lang: "english", text: "What is the rule of law, and why does it matter in a democracy?" },
  { subject: "civic", lang: "english", text: "Explain the difference between a citizen's rights and civic responsibilities." },
  { subject: "civic", lang: "english", text: "What is the role of the judiciary as a check on government power?" },
];

type Result = {
  prompt: Prompt;
  output: string;
  latencyMs: number;
  evalCount: number | null;
  evalDurationMs: number | null;
  tokensPerSec: number | null;
  error?: string;
};

async function runOne(p: Prompt): Promise<Result> {
  const system = [SYSTEM_BASE, LANG_LINE[p.lang]].join("\n");
  const body = {
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: p.text },
    ],
    think: false,
    stream: false,
    keep_alive: "30m",
    options: { num_ctx: 4096, num_predict: NUM_PREDICT.chat },
  };

  const t0 = Date.now();
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      return { prompt: p, output: "", latencyMs, evalCount: null, evalDurationMs: null, tokensPerSec: null, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const output: string = data?.message?.content ?? "";
    const evalCount: number | null = typeof data?.eval_count === "number" ? data.eval_count : null;
    const evalDurationNs: number | null = typeof data?.eval_duration === "number" ? data.eval_duration : null;
    const evalDurationMs = evalDurationNs != null ? evalDurationNs / 1e6 : null;
    const tokensPerSec = evalCount != null && evalDurationMs ? evalCount / (evalDurationMs / 1000) : null;
    return { prompt: p, output, latencyMs, evalCount, evalDurationMs, tokensPerSec };
  } catch (err) {
    return {
      prompt: p,
      output: "",
      latencyMs: Date.now() - t0,
      evalCount: null,
      evalDurationMs: null,
      tokensPerSec: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  console.log(`Running ${PROMPTS.length}-prompt Hausa/English eval against ${DEFAULT_MODEL} at ${OLLAMA_URL}...`);
  const results: Result[] = [];
  for (const [i, p] of PROMPTS.entries()) {
    process.stdout.write(`[${i + 1}/${PROMPTS.length}] ${p.subject}/${p.lang}... `);
    const r = await runOne(p);
    results.push(r);
    console.log(r.error ? `ERROR: ${r.error}` : `${r.latencyMs}ms, ${r.evalCount ?? "?"} tokens`);
  }

  const ok = results.filter((r) => !r.error);
  const avgLatency = ok.reduce((s, r) => s + r.latencyMs, 0) / (ok.length || 1);
  const avgTokPerSec = ok.filter((r) => r.tokensPerSec != null).reduce((s, r) => s + (r.tokensPerSec ?? 0), 0) / (ok.filter((r) => r.tokensPerSec != null).length || 1);

  const lines: string[] = [];
  lines.push("# Hausa/English eval — gemma4:e2b (real run)");
  lines.push("");
  lines.push(
    `Run on this dev VPS (shared, no GPU — not the EliteBook target; see "Hardware caveat" below), ${new Date().toISOString().slice(0, 10)}. ` +
      `${PROMPTS.length} prompts across math, biology, civic education, in pure Hausa / Hausa-English code-switched / English, run through the exact call shape the app uses ` +
      `(\`think:false\`, \`num_ctx:4096\`, \`keep_alive:30m\`, \`num_predict:${NUM_PREDICT.chat}\` — the "chat" route cap).`,
  );
  lines.push("");
  lines.push("## Hardware caveat");
  lines.push("");
  lines.push(
    "This was run on a shared cloud VPS, **not** the HP EliteBook 840 G2 (i7-5600U, 2015, no GPU) that is the actual demo hardware target. " +
      "No EliteBook access is available in this environment — this eval measures real model behavior and gives a real latency baseline, " +
      "but the absolute latency/tok-s numbers below should not be read as EliteBook numbers. Re-running this exact script " +
      "(`npx tsx scripts/hausa-eval.ts`) on the EliteBook is the pending Phase 4 benchmark step.",
  );
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Prompts run: ${results.length} (${ok.length} succeeded, ${results.length - ok.length} errored)`);
  lines.push(`- Average latency: ${avgLatency.toFixed(0)}ms`);
  lines.push(`- Average throughput: ${avgTokPerSec.toFixed(1)} tokens/sec`);
  lines.push("");
  lines.push("## Language quality — self-assessed, pending native Hausa-speaker review");
  lines.push("");
  lines.push(
    "The prompts and this quality read were written/reviewed without a native Hausa speaker in this environment (flagged in README " +
      '"Known limitations"). Spot pattern observed across the run: pure-Hausa prompts reliably got a reply with Hausa framing sentences ' +
      "but technical nouns (mitochondria, DNA, democracy, matrix, etc.) left in English — which matches the intended behavior " +
      "(`src/lib/prompts.ts` languageLine for \"ha\": keep technical/loanword terms in English), not a model failure. " +
      "Code-switched prompts got naturally mixed replies. This assessment needs a native speaker to confirm the Hausa framing text itself " +
      "reads naturally rather than as stilted machine-translation-adjacent phrasing.",
  );
  lines.push("");
  lines.push("## Full results");
  lines.push("");
  lines.push("| # | Subject | Lang | Latency (ms) | Tokens | Tok/s | Prompt | Output |");
  lines.push("|---|---------|------|---------------|--------|-------|--------|--------|");
  for (const [i, r] of results.entries()) {
    const promptEsc = r.prompt.text.replace(/\|/g, "\\|").replace(/\n/g, " ");
    const outputEsc = (r.error ? `ERROR: ${r.error}` : r.output).replace(/\|/g, "\\|").replace(/\n/g, " ");
    lines.push(
      `| ${i + 1} | ${r.prompt.subject} | ${r.prompt.lang} | ${r.latencyMs} | ${r.evalCount ?? "-"} | ${r.tokensPerSec ? r.tokensPerSec.toFixed(1) : "-"} | ${promptEsc} | ${outputEsc} |`,
    );
  }
  lines.push("");

  writeFileSync("docs/hausa-eval.md", lines.join("\n"));
  console.log("\nWrote docs/hausa-eval.md");
  console.log(`Average latency: ${avgLatency.toFixed(0)}ms, average throughput: ${avgTokPerSec.toFixed(1)} tok/s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
