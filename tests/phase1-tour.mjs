// One-off Phase 1 verification script (not part of the committed test
// suite — ad hoc, run manually against the production build per the
// brief's verification rules). Drives real clicks against the real local
// Next.js production server + real local Ollama, checks geometry to catch
// zero-pixel-collapse regressions, and prints a pass/fail summary.
import { chromium } from "playwright";

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

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));
  page.on("requestfailed", (req) => console.log("REQFAILED:", req.url(), req.failure()?.errorText));

  // 1. Dashboard loads, nav renders with nonzero geometry.
  await page.goto(BASE + "/");
  await page.waitForSelector('[data-testid="dashboard"]');
  await nonZeroBox(page.locator('[data-testid="dashboard"]'), "dashboard");
  record("dashboard: title visible", await page.locator("h1", { hasText: "Grinnish Local" }).isVisible());

  // 2. QOTD card: empty state expected (no past_questions seeded).
  await page.waitForSelector('[data-testid="qotd-empty"], [data-testid="qotd-card"]', { timeout: 10000 });
  const qotdEmpty = await page.locator('[data-testid="qotd-empty"]').count();
  record("qotd: renders (empty state expected, catalog has 0 past_questions)", qotdEmpty > 0);

  // 3. Settings: change language, verify persisted.
  await page.goto(BASE + "/settings");
  await page.waitForSelector('[data-testid="settings-page"]');
  await page.click('[data-testid="language-ha"]');
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector('[data-testid="settings-page"]');
  const haChecked = await page.locator('[data-testid="language-ha"]').isChecked();
  record("settings: language persists across reload", haChecked);
  // reset back to en for subsequent tests
  await page.click('[data-testid="language-en"]');
  await page.waitForTimeout(300);

  // 4. Past questions: courses list renders real seeded data.
  await page.goto(BASE + "/past-questions");
  await page.waitForSelector('[data-testid="past-questions-page"]');
  await page.waitForSelector('[data-testid="courses-list"] li', { timeout: 10000 });
  const courseCount = await page.locator('[data-testid="courses-list"] li').count();
  record("past-questions: real seeded courses render", courseCount > 0, `${courseCount} courses`);
  await nonZeroBox(page.locator('[data-testid="courses-list"]'), "courses-list");

  // 5. Click into a course, verify CBT empty-state (no past_questions yet).
  await page.locator('[data-testid="courses-list"] li a').first().click();
  await page.waitForSelector('[data-testid="course-detail-page"]');
  await page.click('[data-testid="start-cbt-link"]');
  await page.waitForSelector('[data-testid="cbt-empty"]', { timeout: 10000 });
  record("cbt: graceful empty state for a course with no past_questions", true);

  // 6. Bookmarks page loads (empty or not).
  await page.goto(BASE + "/bookmarks");
  await page.waitForSelector('[data-testid="bookmarks-page"]');
  record("bookmarks: page renders", true);

  // 7. Study mode: full intake -> real Ollama syllabus generation -> subunit tutor chat.
  await page.goto(BASE + "/study");
  await page.waitForSelector('[data-testid="study-intake-form"]');
  await page.fill('[data-testid="topic-input"]', "Photosynthesis");
  await page.fill('[data-testid="goal-input"]', "understand the basics");
  await page.fill('[data-testid="minutes-input"]', "20");
  await page.fill('[data-testid="scenario-input"]', "Never studied biology before.");
  await page.click('[data-testid="generate-syllabus-button"]');

  // Real Ollama call — allow generous time on a shared/cold VPS.
  try {
    await page.waitForSelector('[data-testid="syllabus-page"]', { timeout: 90000 });
  } catch (e) {
    const errText = await page.locator("p.text-red-600").textContent().catch(() => null);
    console.log("study-mode failure, url=", page.url(), "error on page:", errText);
    throw e;
  }
  record("study: real local-model syllabus generated and page navigated", true);
  await page.waitForSelector('[data-testid="syllabus-tree"] button', { timeout: 10000 });
  await nonZeroBox(page.locator('[data-testid="syllabus-tree"]'), "syllabus-tree");

  await page.locator('[data-testid="syllabus-tree"] button').first().click();
  await page.waitForSelector('[data-testid="chat-input"]');
  await page.fill('[data-testid="chat-input"]', "Explain this in one sentence.");
  await page.click('[data-testid="chat-send-button"]');

  // Wait for a real streamed assistant reply (nonzero content).
  await page.waitForFunction(
    () => {
      const log = document.querySelector('[data-testid="chat-log"]');
      if (!log) return false;
      // Two message bubbles (user + assistant) plus a trailing empty
      // scroll-anchor div — check the assistant bubble specifically.
      const bubbles = Array.from(log.children).filter((el) => el.textContent && el.textContent.trim().length > 0);
      return bubbles.length >= 2;
    },
    null, // arg (unused) — waitForFunction(fn, arg, options), timeout must go in options
    { timeout: 90000 },
  );
  record("study: subunit tutor streamed a real reply from local Ollama", true);

  await page.click('[data-testid="mark-complete-button"]');
  await page.waitForTimeout(500);
  record("study: mark-complete click succeeded (no crash)", true);

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
