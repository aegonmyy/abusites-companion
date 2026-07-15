// Phase 2/3 verification script (Notes feature) — same shape as
// phase1-tour.mjs: real clicks against the real local Next.js production
// server + real local Ollama (text and vision paths), geometry checks,
// pass/fail summary.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3912";
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ": " + detail : ""}`);
}

async function nonZeroBox(locator, label) {
  const box = await locator.boundingBox();
  const ok = !!box && box.width > 0 && box.height > 0;
  record(`geometry: ${label}`, ok, box ? `${box.width}x${box.height}` : "no box");
  return ok;
}

// Generate a small test image with readable text (used for the vision path).
const IMG_PATH = "/tmp/phase2-note-test.png";
if (!existsSync(IMG_PATH)) {
  execSync(
    `convert -size 500x120 xc:white -pointsize 20 -fill black -annotate +10+60 "Mitochondria is the powerhouse of the cell" ${IMG_PATH}`,
  );
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));
  page.on("requestfailed", (req) => console.log("REQFAILED:", req.url(), req.failure()?.errorText));

  // 1. Notes nav link present, notes list loads (empty state expected first run).
  await page.goto(BASE + "/");
  await page.waitForSelector('[data-testid="dashboard"]');
  await page.click('nav a[href="/notes"]');
  await page.waitForSelector('[data-testid="notes-page"]');
  record("notes: page renders from nav", true);

  // 2. Text-mode note: paste text -> real local-model summary/key concepts/quiz.
  await page.click('[data-testid="new-note-button"]');
  await page.waitForSelector('[data-testid="new-note-form"]');
  await page.fill('[data-testid="note-title-input"]', "Mitochondria basics");
  await page.fill(
    '[data-testid="note-text-input"]',
    "The mitochondria is the powerhouse of the cell. It produces ATP through cellular respiration, using oxygen to break down glucose. Mitochondria have their own DNA and are believed to have originated from ancient bacteria.",
  );
  await page.click('[data-testid="generate-note-button"]');

  try {
    await page.waitForSelector('[data-testid="note-detail-page"]', { timeout: 90000 });
  } catch (e) {
    const errText = await page.locator("p.text-red-600").textContent().catch(() => null);
    console.log("notes text-mode failure, url=", page.url(), "error on page:", errText);
    throw e;
  }
  record("notes: real local-model summary generated from pasted text", true);
  await nonZeroBox(page.locator('[data-testid="note-detail-page"]'), "note-detail-page");

  const keyConceptCount = await page.locator('[data-testid="note-key-concepts"] span').count();
  record("notes: key concepts extracted", keyConceptCount > 0, `${keyConceptCount} concepts`);

  const quizPresent = await page.locator('[data-testid="note-quiz"]').count();
  record("notes: quiz generated", quizPresent > 0);
  if (quizPresent > 0) {
    await page.click('[data-testid="note-quiz-q0-opt0"]');
    await page.click('[data-testid="note-quiz-submit"]');
    await page.waitForSelector('[data-testid="note-quiz-score"]');
    record("notes: quiz submit + scoring works", true);
  }

  // 3. Notes chat: real streamed reply scoped to the note.
  await page.fill('[data-testid="note-chat-input"]', "Summarize this in one short sentence.");
  await page.click('[data-testid="note-chat-send-button"]');
  await page.waitForFunction(
    () => {
      const log = document.querySelector('[data-testid="note-chat-log"]');
      if (!log) return false;
      const bubbles = Array.from(log.children).filter((el) => el.textContent && el.textContent.trim().length > 0);
      return bubbles.length >= 2;
    },
    null,
    { timeout: 90000 },
  );
  record("notes: chat streamed a real reply scoped to the note", true);

  // 4. Bookmark the note, verify it shows up in /bookmarks.
  await page.click('[data-testid="bookmark-note-button"]');
  await page.waitForTimeout(500);
  await page.goto(BASE + "/bookmarks");
  await page.waitForSelector('[data-testid="bookmarks-list"] li');
  const bookmarkCount = await page.locator('[data-testid="bookmarks-list"] li').count();
  record("notes: bookmarked note appears in /bookmarks", bookmarkCount > 0);

  // 5. Image-mode note: real vision call against the local model.
  await page.goto(BASE + "/notes/new");
  await page.waitForSelector('[data-testid="new-note-form"]');
  await page.click('[data-testid="mode-image-tab"]');
  await page.setInputFiles('[data-testid="note-image-input"]', IMG_PATH);
  await page.waitForSelector('[data-testid="note-image-preview"]');
  await page.click('[data-testid="generate-note-button"]');

  try {
    await page.waitForSelector('[data-testid="note-detail-page"]', { timeout: 90000 });
  } catch (e) {
    const errText = await page.locator("p.text-red-600").textContent().catch(() => null);
    console.log("notes image-mode failure, url=", page.url(), "error on page:", errText);
    throw e;
  }
  record("notes: real local-model vision call summarized a photo", true);
  const summaryText = await page.locator('[data-testid="note-detail-page"] p').first().textContent();
  record(
    "notes: photo summary plausibly reflects image content",
    /mitochondri/i.test(summaryText ?? ""),
    summaryText ?? "(empty)",
  );

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
