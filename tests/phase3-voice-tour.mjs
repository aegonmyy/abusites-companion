// Phase 3 verification: voice input, end to end, for real.
//
// Chromium is launched with --use-file-for-fake-audio-capture pointing at a
// real synthesized WAV clip ("What is the powerhouse of the cell") — this
// is Chromium's supported mechanism for feeding a real audio file as the
// microphone input under automation, not a mock of getUserMedia. The mic
// button in the app records via MediaRecorder from that fake device,
// re-encodes to WAV client-side (src/lib/audio-record.ts), and POSTs it to
// /api/llm, which routes it to Ollama's OpenAI-compatible endpoint (see
// docs/AUDIO_FINDING.md). The assertion checks that the real streamed
// reply is topically correct for the audio content, not just non-empty.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3912";
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ": " + detail : ""}`);
}

const AUDIO_PATH = "/tmp/phase3-voice-test.wav";
if (!existsSync(AUDIO_PATH)) {
  execSync(`espeak-ng -v en -w ${AUDIO_PATH} "What is the powerhouse of the cell"`);
}

async function main() {
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${AUDIO_PATH}`,
    ],
  });
  const context = await browser.newContext();
  await context.grantPermissions(["microphone"]);
  const page = await context.newPage();
  page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));
  page.on("console", (msg) => console.log("CONSOLE:", msg.type(), msg.text()));
  page.on("request", (req) => { if (req.url().includes("/api/llm")) console.log("REQ:", req.method(), req.url(), req.postData()?.length); });
  page.on("response", (res) => { if (res.url().includes("/api/llm")) console.log("RES:", res.status(), res.url()); });
  page.on("requestfailed", (req) => console.log("REQFAILED:", req.url(), req.failure()?.errorText));

  // Real syllabus generation (real local model), then open a subunit so the
  // tutor chat (with the mic button) is on screen.
  await page.goto(BASE + "/study");
  await page.waitForSelector('[data-testid="study-intake-form"]');
  await page.fill('[data-testid="topic-input"]', "Cell biology");
  await page.fill('[data-testid="goal-input"]', "quick refresh");
  await page.fill('[data-testid="minutes-input"]', "15");
  await page.fill('[data-testid="scenario-input"]', "Revising the basics before a quiz.");
  await page.click('[data-testid="generate-syllabus-button"]');
  try {
    await page.waitForSelector('[data-testid="syllabus-page"]', { timeout: 90000 });
  } catch (e) {
    const errText = await page.locator("p.text-red-600").textContent().catch(() => null);
    console.log("syllabus generation failure (known occasional model-JSON flakiness, unrelated to voice), error on page:", errText);
    throw e;
  }
  await page.waitForSelector('[data-testid="syllabus-tree"] button', { timeout: 10000 });
  await page.locator('[data-testid="syllabus-tree"] button').first().click();
  await page.waitForSelector('[data-testid="mic-button"]');
  record("voice: mic button renders in tutor chat", true);

  // Start recording, let the fake device "speak" for a few seconds, stop.
  await page.click('[data-testid="mic-button"]');
  await page.waitForSelector('[data-testid="mic-button"][data-state="recording"]', { timeout: 5000 });
  record("voice: recording state activates on click (real getUserMedia grant)", true);

  await page.waitForTimeout(3500); // let the fake audio device feed the clip
  await page.click('[data-testid="mic-button"]'); // stop -> re-encode to WAV -> send

  // A user bubble for the voice message should appear immediately.
  await page.waitForFunction(
    () => {
      const log = document.querySelector('[data-testid="chat-log"]');
      if (!log) return false;
      return Array.from(log.children).some((el) => el.textContent && el.textContent.includes("voice message"));
    },
    null,
    { timeout: 10000 },
  );
  record("voice: user voice-message bubble appears after stopping", true);

  // Real Ollama call over the audio path — allow generous time; the
  // documented finding is this call is slower than text/image (mandatory
  // reasoning trace not honoring think:false, see docs/AUDIO_FINDING.md).
  let replyText = "";
  try {
    // Wait for the reply to *start* (any non-empty assistant bubble)...
    await page.waitForFunction(
      () => {
        const log = document.querySelector('[data-testid="chat-log"]');
        if (!log) return false;
        const bubbles = Array.from(log.children).filter((el) => el.textContent && el.textContent.trim().length > 0);
        return bubbles.length >= 2;
      },
      null,
      { timeout: 120000 },
    );
    // ...then wait for streaming to actually *finish* — the send button
    // re-enables (setStreaming(false)) once the stream reader hits `done`.
    // Reading mid-stream (e.g. after just "The") would under-test this.
    await page.waitForSelector('[data-testid="chat-send-button"]:not([disabled])', { timeout: 60000 });

    // Filter out the trailing empty scroll-anchor div (see
    // src/app/study/syllabus/[id]/page.tsx: `<div ref={bottomRef} />`
    // after the chat bubbles) — it's always the last child but carries no
    // text, so it must not be mistaken for the assistant's reply.
    const bubbles = (await page.locator('[data-testid="chat-log"] > div').allTextContents()).filter(
      (t) => t.trim().length > 0,
    );
    replyText = bubbles[bubbles.length - 1] ?? "";
  } catch (e) {
    console.log("voice reply timeout, url=", page.url());
    const html = await page.locator('[data-testid="chat-log"]').innerHTML().catch(() => "(no chat-log)");
    console.log("chat-log HTML at timeout:", html);
    throw e;
  }
  record("voice: real streamed reply received from local Ollama over the audio pipeline", replyText.length > 0, replyText);

  // Topical correctness check: the audio asked about the powerhouse of the
  // cell; the reply should be about mitochondria, not a generic "I can't
  // hear audio" refusal (the exact failure mode documented and worked
  // around in docs/AUDIO_FINDING.md).
  const isRelevant = /mitochondri/i.test(replyText);
  record("voice: reply is topically correct for the spoken question (mentions mitochondria)", isRelevant, replyText);

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.error("FAILURES:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
