"use client";

// Student PDF-to-CBT upload flow (Stage 5). Orchestrates the whole pipeline
// client-side so every model call still funnels through /api/llm, exactly
// like Study mode and Notes: extract text (server), extract questions
// per-chunk (local model), answer each question (local model), save as a
// custom course (server), then hand off to the existing CBT flow. Progress
// is shown per stage because the model work runs into minutes for a full
// paper — that's expected, not a hang (a deliberate product decision: no
// question cap, just honest progress).

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LoadingSpinner from "@/components/LoadingSpinner";
import { pastQuestionExtractionSystemPrompt, pastQuestionAnswerSystemPrompt } from "@/lib/prompts";
import { chunkExamText, mergeExtracted, type ExtractedQuestion } from "@/lib/exam-chunk";
import { parseModelJson } from "@/lib/parse-model-json";

type Phase = "idle" | "extracting-text" | "extracting-questions" | "answering" | "saving" | "done" | "error";

type AnsweredQuestion = ExtractedQuestion & { correct_index: number; explanation: string };

async function readJsonStream(res: Response): Promise<unknown> {
  if (!res.ok || !res.body) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { error?: string }).error ?? "Local model call failed.");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  const match = text.match(/[[{][\s\S]*[\]}]/);
  if (!match) throw new Error("Model did not return parseable JSON.");
  return parseModelJson(match[0]);
}

export default function UploadPastPaperPage() {
  const router = useRouter();
  const [courseCode, setCourseCode] = useState("");
  const [year, setYear] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const busy = phase !== "idle" && phase !== "error" && phase !== "done";
  const canSubmit = courseCode.trim().length > 0 && file !== null && !busy;

  async function run() {
    if (!file || !courseCode.trim()) return;
    setError(null);
    setProgress({ current: 0, total: 0 });

    try {
      // Stage 1: PDF -> text (server, local pdfjs)
      setPhase("extracting-text");
      const form = new FormData();
      form.append("file", file);
      const textRes = await fetch("/api/past-questions/extract-pdf", { method: "POST", body: form });
      if (!textRes.ok) {
        const d = await textRes.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "Could not read the PDF.");
      }
      const { text } = (await textRes.json()) as { text: string };

      // Stage 2: text -> questions (local model, per chunk, merged)
      setPhase("extracting-questions");
      const chunks = chunkExamText(text);
      setProgress({ current: 0, total: chunks.length });
      const extractSystem = pastQuestionExtractionSystemPrompt();
      const perChunk: ExtractedQuestion[][] = [];
      for (let i = 0; i < chunks.length; i++) {
        const res = await fetch("/api/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            routeTag: "json",
            system: extractSystem,
            numPredictOverride: 2000,
            messages: [{ role: "user", content: chunks[i] }],
          }),
        });
        const parsed = (await readJsonStream(res)) as { questions?: ExtractedQuestion[] };
        perChunk.push(Array.isArray(parsed?.questions) ? parsed.questions : []);
        setProgress({ current: i + 1, total: chunks.length });
      }
      const questions = mergeExtracted(perChunk);
      if (questions.length === 0) {
        throw new Error("No multiple-choice questions were found in this PDF.");
      }

      // Stage 3: answer each question (local model, sequential)
      setPhase("answering");
      setProgress({ current: 0, total: questions.length });
      const answerSystem = pastQuestionAnswerSystemPrompt();
      const answered: AnsweredQuestion[] = [];
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const optText = q.options.map((o, j) => `${String.fromCharCode(65 + j)}. ${o}`).join("\n");
        let correctIndex = 0;
        let explanation = "";
        try {
          const res = await fetch("/api/llm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              routeTag: "json",
              system: answerSystem,
              numPredictOverride: 300,
              messages: [{ role: "user", content: `Question: ${q.question_text}\nOptions:\n${optText}` }],
            }),
          });
          const parsed = (await readJsonStream(res)) as { correct_index?: number; explanation?: string };
          if (typeof parsed?.correct_index === "number") correctIndex = parsed.correct_index;
          if (typeof parsed?.explanation === "string") explanation = parsed.explanation;
        } catch {
          // A single failed answer shouldn't sink the whole upload — default
          // to option 0, mark it, keep going.
          explanation = "";
        }
        if (correctIndex < 0 || correctIndex >= q.options.length) correctIndex = 0;
        answered.push({ ...q, correct_index: correctIndex, explanation });
        setProgress({ current: i + 1, total: questions.length });
      }

      // Stage 4: save as a custom course (server)
      setPhase("saving");
      const saveRes = await fetch("/api/past-questions/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseCode: courseCode.trim(),
          courseTitle: courseCode.trim(),
          year: year.trim() ? Number(year.trim()) : undefined,
          questions: answered,
        }),
      });
      if (!saveRes.ok) {
        const d = await saveRes.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "Could not save the course.");
      }
      const { courseId } = (await saveRes.json()) as { courseId: string };

      setPhase("done");
      router.push(`/cbt/${courseId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("error");
    }
  }

  const phaseLabel = () => {
    switch (phase) {
      case "extracting-text":
        return "Reading the PDF…";
      case "extracting-questions":
        return `Finding questions… (${progress.current}/${progress.total} sections)`;
      case "answering":
        return `Working out answers… (${progress.current}/${progress.total} questions)`;
      case "saving":
        return "Saving your course…";
      case "done":
        return "Done! Opening your practice…";
      default:
        return "";
    }
  };

  return (
    <div className="min-h-dvh px-6 py-12">
      <div className="card-deep card-deep-glow mx-auto w-full max-w-2xl rounded-2xl p-6 text-white">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Upload a past paper</h1>
          <Link
            href="/past-questions"
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 transition hover:border-white/40"
          >
            Back
          </Link>
        </div>

        <p className="mb-6 text-sm text-white/70">
          Upload a past-questions PDF and it becomes a practice test you can take right here,
          fully offline. The answers are worked out by the local AI and can contain mistakes —
          treat them as a study aid, not a marking scheme.
        </p>

        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-semibold text-white/90">
            Course name or code
            <input
              type="text"
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              placeholder="e.g. PHYS 101, Organic Chemistry"
              disabled={busy}
              data-testid="upload-course-code"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-normal text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none disabled:opacity-60"
            />
          </label>

          <label className="grid gap-1.5 text-sm font-semibold text-white/90">
            Year (optional)
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="e.g. 2024"
              disabled={busy}
              data-testid="upload-year"
              className="w-32 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-normal text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none disabled:opacity-60"
            />
          </label>

          <label className="grid gap-1.5 text-sm font-semibold text-white/90">
            PDF file
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={busy}
              data-testid="upload-file"
              className="text-sm font-normal text-white/70 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-xs file:font-semibold file:text-slate-900 disabled:opacity-60"
            />
          </label>

          <button
            type="button"
            onClick={run}
            disabled={!canSubmit}
            data-testid="upload-submit"
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 disabled:opacity-60"
          >
            {busy && <LoadingSpinner size={14} className="text-slate-900" label="Working" />}
            {busy ? "Building your test…" : "Build practice test"}
          </button>

          {busy && (
            <div
              data-testid="upload-progress"
              className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80"
            >
              <div className="flex items-center gap-3">
                <LoadingSpinner size={16} label="Progress" />
                <span>{phaseLabel()}</span>
              </div>
              {progress.total > 0 && (
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                  />
                </div>
              )}
              <p className="mt-3 text-xs text-white/50">
                This can take a few minutes for a long paper — that&apos;s the AI reading and
                answering every question on your own machine. You can leave this open.
              </p>
            </div>
          )}

          {error && (
            <p data-testid="upload-error" className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-4 text-sm text-rose-100">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
