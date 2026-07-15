// Phase 2 verification: PDF upload intake for Notes — real text extraction
// (pdfjs-dist, src/lib/pdf-extract.ts) from a real generated PDF, then the
// same real local-model summarization path as the other Notes intake
// modes. Same shape as phase2-notes-tour.mjs.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3912";
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ": " + detail : ""}`);
}

// Real PDF with a real embedded text layer (ghostscript via ps2pdf — a
// genuine PDF text stream, not an image-only scan) — this is the case the
// brief's "notes flow: upload PDF" acceptance criterion targets.
const PDF_PATH = "/tmp/phase2-note-test.pdf";
if (!existsSync(PDF_PATH)) {
  const psPath = "/tmp/phase2-note-test.ps";
  execSync(
    `cat > ${psPath} << 'EOF'\n%!PS\n/Helvetica findfont 18 scalefont setfont\n72 700 moveto\n(Mitochondria is the powerhouse of the cell.) show\n72 670 moveto\n(It produces ATP through cellular respiration.) show\nshowpage\nEOF`,
    { shell: "/bin/bash" },
  );
  execSync(`ps2pdf ${psPath} ${PDF_PATH}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));
  page.on("requestfailed", (req) => console.log("REQFAILED:", req.url(), req.failure()?.errorText));

  await page.goto(BASE + "/notes/new");
  await page.waitForSelector('[data-testid="new-note-form"]');
  await page.click('[data-testid="mode-pdf-tab"]');
  await page.setInputFiles('[data-testid="note-pdf-input"]', PDF_PATH);
  await page.click('[data-testid="generate-note-button"]');

  try {
    await page.waitForSelector('[data-testid="note-detail-page"]', { timeout: 90000 });
  } catch (e) {
    const errText = await page.locator("p.text-red-600").textContent().catch(() => null);
    console.log("notes PDF-mode failure, url=", page.url(), "error on page:", errText);
    throw e;
  }
  record("notes: real local PDF text extraction + summarization succeeded", true);
  const summaryText = await page.locator('[data-testid="note-detail-page"] p').first().textContent();
  record(
    "notes: PDF summary reflects the real extracted PDF content (mentions mitochondria)",
    /mitochondri/i.test(summaryText ?? ""),
    summaryText ?? "(empty)",
  );

  const keyConceptCount = await page.locator('[data-testid="note-key-concepts"] span').count();
  record("notes: key concepts extracted from PDF content", keyConceptCount > 0, `${keyConceptCount} concepts`);

  // Reject path: a non-PDF file through the PDF extraction API should fail
  // cleanly, not silently fabricate a summary.
  const rejectRes = await page.evaluate(async () => {
    const formData = new FormData();
    formData.append("file", new Blob(["not a pdf"], { type: "text/plain" }), "note.txt");
    const res = await fetch("/api/notes/extract-pdf", { method: "POST", body: formData });
    return { status: res.status };
  });
  record("notes: PDF extraction API rejects a non-PDF file cleanly", rejectRes.status === 400, `status ${rejectRes.status}`);

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
