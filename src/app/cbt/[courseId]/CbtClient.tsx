"use client";

// Ported from the earlier reference design's app/cbt/[courseId]/CbtClient.tsx — verbatim markup and
// behavior (setup: questions-per-year + custom timer; test: paged questions,
// countdown, one-minute toast, submit-confirm; report: score cards; review:
// per-question correct/wrong highlighting). The earlier reference design's CBT is entirely
// client-side and scores locally, so nothing here needed rewiring except a
// streak check-in on submit (the local app's "did an activity today" signal).

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import MathText from "@/components/MathText";
import LoadingSpinner from "@/components/LoadingSpinner";
import { cbtQuestionExplanationSystemPrompt, type Language } from "@/lib/prompts";

const labels = ["A", "B", "C", "D"] as const;

type Course = {
  id: string;
  code: string;
  title: string;
};

type Question = {
  id: string | number;
  year: number | null;
  question_text: string | null;
  options: string[] | null;
  answer: string | number | null;
  details: string | null;
};

type Props = {
  course: Course;
  questions: Question[];
};

type Phase = "setup" | "test" | "report" | "review";

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function CbtClient({ course, questions }: Props) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [selectedYearCounts, setSelectedYearCounts] = useState<Record<string, number>>({});
  const [customMinutes, setCustomMinutes] = useState<string>("");
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [language, setLanguage] = useState<Language>("en");
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [aiExplainLoadingId, setAiExplainLoadingId] = useState<string | null>(null);
  const [aiExplainErrorId, setAiExplainErrorId] = useState<string | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTriggered = useRef(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setLanguage((d.language as Language) ?? "en"))
      .catch(() => {});
  }, []);

  const grouped = useMemo(() => {
    return questions.reduce<Record<string, Question[]>>((acc, item) => {
      const key = item.year ? String(item.year) : "Unknown";
      acc[key] = acc[key] ?? [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [questions]);

  const years = useMemo(() => Object.keys(grouped).sort((a, b) => Number(b) - Number(a)), [grouped]);

  const totalSelected = useMemo(
    () => Object.values(selectedYearCounts).reduce((sum, count) => sum + count, 0),
    [selectedYearCounts],
  );

  const hasInvalidSelection = useMemo(() => {
    return Object.entries(selectedYearCounts).some(([year, count]) => {
      const available = grouped[year]?.length ?? 0;
      return count < 0 || count > available;
    });
  }, [selectedYearCounts, grouped]);

  const availableCount = useMemo(() => questions.length, [questions.length]);

  const handleSubmit = () => {
    fetch("/api/streaks", { method: "POST" }).catch(() => {});
    setPhase("report");
  };

  useEffect(() => {
    if (phase !== "test" || timerSeconds == null) return;

    setRemaining(timerSeconds);
    setShowToast(false);
    toastTriggered.current = false;

    const interval = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;
        if (next <= 60 && next > 0 && !toastTriggered.current) {
          toastTriggered.current = true;
          setShowToast(true);
          if (toastTimeout.current) clearTimeout(toastTimeout.current);
          toastTimeout.current = setTimeout(() => setShowToast(false), 10000);
        }
        if (next <= 0) {
          clearInterval(interval);
          handleSubmit();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timerSeconds]);

  const startSession = () => {
    if (totalSelected === 0 || hasInvalidSelection) return;

    const picked: Question[] = [];
    years.forEach((year) => {
      const count = selectedYearCounts[year] ?? 0;
      if (count <= 0) return;
      const pool = grouped[year] ?? [];
      const sampled = shuffle(pool).slice(0, count);
      picked.push(...sampled);
    });

    const shuffled = shuffle(picked);
    setSessionQuestions(shuffled);
    setAnswers({});
    setCurrentIndex(0);

    const defaultMinutes = Math.max(1, totalSelected);
    const minutes = customMinutes.trim() ? Number(customMinutes) : defaultMinutes;
    const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : defaultMinutes;
    const seconds = Math.floor(safeMinutes * 60);

    setTimerSeconds(seconds);
    setPhase("test");
  };

  const handleAnswer = (questionId: string | number, value: number) => {
    setAnswers((prev) => ({ ...prev, [String(questionId)]: value }));
  };

  const report = useMemo(() => {
    const total = sessionQuestions.length;
    const answered = sessionQuestions.filter((q) => answers[String(q.id)] != null).length;
    const correct = sessionQuestions.filter((q) => {
      const answerIndex = Number.isFinite(Number(q.answer)) ? Number(q.answer) : null;
      return answerIndex != null && answers[String(q.id)] === answerIndex;
    }).length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { total, answered, correct, score };
  }, [answers, sessionQuestions]);

  const getAnswerIndex = (answer: Question["answer"]) => {
    const parsed = Number(answer);
    return Number.isFinite(parsed) ? parsed : null;
  };

  // On-demand, per-question "AI explanation" — one call for the single
  // question the student clicks, triggered from the review-answers screen.
  // Always sends the full option list for this question regardless of
  // outcome (see cbtQuestionExplanationSystemPrompt's doc comment for why),
  // plus the student's selected letter (or "not answered") and the correct
  // letter.
  const explainQuestion = async (question: Question) => {
    const key = String(question.id);
    if (aiExplainLoadingId) return;
    setAiExplainLoadingId(key);
    setAiExplainErrorId(null);
    setAiExplanations((prev) => ({ ...prev, [key]: "" }));
    try {
      const options = Array.isArray(question.options) ? question.options : [];
      const optionsText = options
        .map((opt, idx) => (opt ? `${labels[idx]}. ${opt}` : null))
        .filter(Boolean)
        .join("\n");
      const correctIdx = getAnswerIndex(question.answer);
      const selectedIdx = answers[key];
      const correctLabel = correctIdx != null ? labels[correctIdx] ?? "Unknown" : "Unknown";
      const selectedLabel = selectedIdx != null ? labels[selectedIdx] ?? "Unknown" : "not answered";
      const userContent = [
        `Question: ${question.question_text ?? ""}`,
        `Options:\n${optionsText}`,
        `Student's answer: ${selectedLabel}`,
        `Correct answer: ${correctLabel}`,
      ].join("\n");

      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeTag: "lesson",
          system: cbtQuestionExplanationSystemPrompt(language),
          numPredictOverride: 350,
          messages: [{ role: "user", content: userContent }],
        }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Local model call failed.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assembled = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          assembled += chunk;
          setAiExplanations((prev) => ({ ...prev, [key]: assembled }));
        }
      }
      if (!assembled.trim()) throw new Error("Local model unavailable — is Ollama running?");
    } catch (err) {
      setAiExplainErrorId(key);
      setAiExplanations((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : "Could not generate an explanation.",
      }));
    } finally {
      setAiExplainLoadingId(null);
    }
  };

  const formattedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (availableCount === 0) {
    return (
      <div
        data-testid="cbt-empty"
        className="card-deep mt-8 rounded-2xl p-6 text-sm text-white/70"
      >
        No questions available yet.
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <div
        data-testid="cbt-setup"
        className="card-deep card-deep-glow mt-8 grid gap-6 rounded-2xl p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Build your CBT</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Choose questions per year</h2>
          </div>
          <div className="text-sm text-white/70">{availableCount} questions available</div>
        </div>

        <div className="grid gap-4">
          {years.map((year) => {
            const available = grouped[year]?.length ?? 0;
            const value = selectedYearCounts[year] ?? 0;
            const invalid = value > available;
            return (
              <div
                key={year}
                className="card-deep flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{year}</p>
                  <p className="text-xs text-white/60">{available} available</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={available}
                    value={value}
                    onChange={(event) =>
                      setSelectedYearCounts((prev) => ({
                        ...prev,
                        [year]: Number(event.target.value || 0),
                      }))
                    }
                    className={`w-24 rounded-full border px-4 py-2 text-sm text-white focus:outline-none ${
                      invalid
                        ? "border-rose-400/70 bg-rose-500/10"
                        : "border-white/20 bg-white/5 focus:border-white/60"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedYearCounts((prev) => ({ ...prev, [year]: available }))
                    }
                    className="rounded-full border border-white/20 px-3 py-2 text-xs font-semibold text-white/70 transition hover:border-white/50 hover:text-white"
                  >
                    All
                  </button>
                  <span className="text-xs text-white/50">questions</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="card-deep grid gap-3 rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">Timer</p>
            <p className="text-xs text-white/60">Default: 1 minute per question</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="number"
              min={1}
              placeholder={`${Math.max(1, totalSelected)} minutes`}
              value={customMinutes}
              onChange={(event) => setCustomMinutes(event.target.value)}
              className="w-40 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-white focus:border-white/60 focus:outline-none"
            />
            <span className="text-xs text-white/50">Total minutes</span>
          </div>
        </div>

        {hasInvalidSelection ? (
          <div className="rounded-full border border-rose-400/60 bg-rose-500/10 px-4 py-2 text-xs text-rose-100">
            One or more selections exceed available questions.
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={startSession}
            disabled={totalSelected === 0 || hasInvalidSelection}
            data-testid="cbt-start-session"
            className="rounded-full bg-white px-6 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Start CBT ({totalSelected} questions)
          </button>
          <button
            type="button"
            onClick={() => setSelectedYearCounts({})}
            className="rounded-full border border-white/20 px-6 py-2 text-sm font-semibold text-white/70"
          >
            Reset
          </button>
        </div>
      </div>
    );
  }

  if (phase === "report") {
    return (
      <div
        data-testid="cbt-report"
        className="card-deep card-deep-glow mt-8 grid gap-6 rounded-2xl p-6"
      >
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">CBT Report</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{course.code} results</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card-deep rounded-2xl p-4">
            <p className="text-xs text-white/60">Score</p>
            <p className="mt-2 text-2xl font-semibold text-white">{report.score}%</p>
          </div>
          <div className="card-deep rounded-2xl p-4">
            <p className="text-xs text-white/60">Correct</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {report.correct} / {report.total}
            </p>
          </div>
          <div className="card-deep rounded-2xl p-4">
            <p className="text-xs text-white/60">Answered</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {report.answered} / {report.total}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setPhase("setup")}
            className="rounded-full bg-white px-6 py-2 text-sm font-semibold text-slate-900"
          >
            New CBT
          </button>
          <button
            type="button"
            onClick={() => setPhase("review")}
            className="rounded-full border border-white/20 px-6 py-2 text-sm font-semibold text-white/70"
          >
            Review answers
          </button>
        </div>
      </div>
    );
  }

  if (phase === "review") {
    return (
      <div className="mt-8 grid gap-6">
        <div className="card-deep card-deep-glow flex flex-wrap items-center justify-between gap-3 rounded-2xl p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Review answers</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {course.code} · {sessionQuestions.length} questions
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setPhase("report")}
            className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white/70"
          >
            Back to report
          </button>
        </div>

        {sessionQuestions.map((question, index) => {
          const selected = answers[String(question.id)];
          const correct = getAnswerIndex(question.answer);
          const options = Array.isArray(question.options) ? question.options : [];
          return (
            <div
              key={question.id}
              className="card-deep rounded-2xl p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">
                  Question {index + 1}
                </p>
                <p className="text-xs text-white/60">Year {question.year ?? "N/A"}</p>
              </div>
              <MathText
                as="p"
                className="mt-3 text-base text-white"
                text={question.question_text ?? ""}
              />
              <div className="mt-4 grid gap-2">
                {options.map((option, idx) => {
                  const isSelected = selected === idx;
                  const isCorrect = correct === idx;
                  const isWrongSelection = isSelected && !isCorrect;
                  return (
                    <div
                      key={labels[idx]}
                      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
                        isCorrect
                          ? "border-emerald-400/70 bg-emerald-500/10"
                          : isWrongSelection
                            ? "border-rose-400/70 bg-rose-500/10"
                            : "border-white/10 bg-white/5"
                      }`}
                    >
                      <span
                        className={`mt-0.5 text-xs font-semibold ${
                          isCorrect
                            ? "text-emerald-200"
                            : isWrongSelection
                              ? "text-rose-200"
                              : "text-white/60"
                        }`}
                      >
                        {labels[idx]}.
                      </span>
                      <MathText
                        as="span"
                        className={
                          isCorrect
                            ? "text-emerald-50"
                            : isWrongSelection
                              ? "text-rose-100"
                              : "text-white"
                        }
                        text={option ?? ""}
                      />
                      <span className="ml-auto text-xs uppercase tracking-wide text-white/50">
                        {isCorrect ? "Correct answer" : isWrongSelection ? "Your answer" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {!aiExplanations[String(question.id)] && (
                  <button
                    type="button"
                    onClick={() => explainQuestion(question)}
                    disabled={aiExplainLoadingId === String(question.id)}
                    data-testid={`cbt-${question.id}-explain-ai-button`}
                    className="w-fit rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold text-white/70 transition hover:border-white/40 hover:text-white disabled:opacity-60"
                  >
                    {aiExplainLoadingId === String(question.id) ? "Explaining…" : "AI explanation"}
                  </button>
                )}
                {(aiExplanations[String(question.id)] || aiExplainLoadingId === String(question.id)) && (
                  <div
                    data-testid={`cbt-${question.id}-explanation-ai`}
                    className="rounded-xl border border-emerald-300/20 bg-emerald-500/5 p-3 text-sm text-white/85"
                  >
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
                      AI explanation
                    </p>
                    {aiExplainLoadingId === String(question.id) && !aiExplanations[String(question.id)] ? (
                      <p className="flex items-center gap-2 text-xs text-white/50">
                        <LoadingSpinner size={14} label="Thinking" />
                        Asking the model…
                      </p>
                    ) : aiExplainErrorId === String(question.id) ? (
                      <p className="text-xs text-rose-300">{aiExplanations[String(question.id)]}</p>
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {aiExplanations[String(question.id)]}
                      </ReactMarkdown>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const current = sessionQuestions[currentIndex];
  const currentOptions = Array.isArray(current.options) ? current.options : [];

  return (
    <div className="mt-8 grid gap-6" data-testid="cbt-test">
      {showToast ? (
        <div className="rounded-full border border-amber-300/60 bg-amber-200/10 px-4 py-2 text-sm text-amber-100">
          One minute left. Your CBT will auto-submit when time is up.
        </div>
      ) : null}

      <div className="card-deep card-deep-glow grid gap-4 rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">
              {course.code} · CBT in progress
            </p>
            <p className="mt-2 text-xl font-semibold text-white">
              Question {currentIndex + 1} of {sessionQuestions.length}
            </p>
          </div>
          <div className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-white/80">
            {timerSeconds != null ? formattedTime(remaining) : "--:--"}
          </div>
        </div>

        <div className="card-deep rounded-2xl p-5">
          <p className="text-sm text-white/60">Year {current.year ?? "N/A"}</p>
          <MathText as="p" className="mt-2 text-base text-white" text={current.question_text ?? ""} />
          <div className="mt-4 grid gap-2">
            {currentOptions.map((option, idx) => (
              <label
                key={labels[idx]}
                role="button"
                aria-pressed={answers[String(current.id)] === idx}
                data-selected={answers[String(current.id)] === idx ? "true" : undefined}
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm text-white transition ${
                  answers[String(current.id)] === idx
                    ? "border-emerald-400/70 bg-emerald-500/10"
                    : "border-white/10 bg-white/5 hover:border-white/30"
                }`}
              >
                <input
                  type="radio"
                  name={`question-${current.id}`}
                  checked={answers[String(current.id)] === idx}
                  onChange={() => handleAnswer(current.id, idx)}
                  className="h-4 w-4 accent-emerald-400"
                />
                <span className="text-white/80">{labels[idx]}.</span>
                <MathText as="span" className="text-white" text={option ?? ""} />
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setCurrentIndex((prev) => Math.max(prev - 1, 0))}
            disabled={currentIndex === 0}
            className="nav-button rounded-full px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() =>
              setCurrentIndex((prev) => Math.min(prev + 1, sessionQuestions.length - 1))
            }
            disabled={currentIndex === sessionQuestions.length - 1}
            className="nav-button rounded-full px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      <div className="flex flex-wrap justify-end">
        <button
          type="button"
          onClick={() => setShowSubmitConfirm(true)}
          data-testid="cbt-submit"
          className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900"
        >
          Submit CBT
        </button>
      </div>

      {showSubmitConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur">
          <div className="card-deep w-full max-w-md rounded-3xl p-6 text-white shadow-2xl">
            <h3 className="text-lg font-semibold">Submit CBT?</h3>
            <p className="mt-2 text-sm text-white/70">
              This will end the session and lock your answers.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70"
              >
                Continue test
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSubmitConfirm(false);
                  handleSubmit();
                }}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900"
              >
                Submit now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
