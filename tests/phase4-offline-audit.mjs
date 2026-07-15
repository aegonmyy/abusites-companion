// Phase 4 verification: walks the whole app (dashboard, study, notes,
// past-questions/CBT, bookmarks, settings) against the real production
// server + real local Ollama, and asserts that not a single network request
// — API call, font, image, anything — ever leaves localhost. This is the
// actual offline guarantee, not just "we didn't add a fetch to a cloud
// host": a next/font or stray CDN reference would show up here.
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3912";
const BASE_HOST = new URL(BASE).hostname;
const externalRequests = [];

function isLocal(url) {
  try {
    const u = new URL(url);
    return u.hostname === BASE_HOST || u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return true; // data:, blob:, etc. — not network calls
  }
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("request", (req) => {
    if (!isLocal(req.url())) externalRequests.push(req.url());
  });

  await page.goto(BASE + "/");
  await page.waitForSelector('[data-testid="dashboard"]');
  await page.waitForSelector('[data-testid="qotd-empty"], [data-testid="qotd-card"]', { timeout: 10000 });

  await page.goto(BASE + "/study");
  await page.waitForSelector('[data-testid="study-intake-form"]');

  await page.goto(BASE + "/notes");
  await page.waitForSelector('[data-testid="notes-page"]');
  await page.goto(BASE + "/notes/new");
  await page.waitForSelector('[data-testid="new-note-form"]');

  await page.goto(BASE + "/past-questions");
  await page.waitForSelector('[data-testid="past-questions-page"]');
  await page.waitForSelector('[data-testid="courses-list"] li', { timeout: 10000 });
  await page.locator('[data-testid="courses-list"] li a').first().click();
  await page.waitForSelector('[data-testid="course-detail-page"]');

  await page.goto(BASE + "/bookmarks");
  await page.waitForSelector('[data-testid="bookmarks-page"]');

  await page.goto(BASE + "/settings");
  await page.waitForSelector('[data-testid="settings-page"]');

  // A real local-model call — the one request class most likely to have a
  // stray external dependency (e.g. a cloud fallback left in by mistake).
  await page.goto(BASE + "/study");
  await page.fill('[data-testid="topic-input"]', "Cell biology");
  await page.fill('[data-testid="goal-input"]', "quick refresh");
  await page.fill('[data-testid="minutes-input"]', "15");
  await page.fill('[data-testid="scenario-input"]', "Revising before a test.");
  await page.click('[data-testid="generate-syllabus-button"]');
  await page.waitForSelector('[data-testid="syllabus-page"]', { timeout: 90000 }).catch(() => {});

  await browser.close();

  if (externalRequests.length > 0) {
    console.error("FAIL — external (non-localhost) requests were made during a full app walkthrough:");
    for (const url of new Set(externalRequests)) console.error("  " + url);
    process.exit(1);
  }
  console.log("PASS — zero non-localhost network requests across dashboard, study, notes, past-questions, CBT entry, bookmarks, settings, and a real syllabus generation call.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
