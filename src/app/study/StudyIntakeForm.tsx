"use client";

// Ported from the earlier reference design's app/study-mode/StudyIntakeForm.tsx. Markup/classes
// are the earlier reference design's verbatim: the generating overlay with the liquid-fill spinner,
// the "Previous syllabi" chips + slide-in menu, the topic/goal form, Auto fill.
// Rewired to the local target's generation pipeline: intake -> /api/llm
// (routeTag json, syllabusGenerationSystemPrompt) -> persist via
// /api/study/syllabus, then render the ported SyllabusView inline (the earlier reference design's
// single-page model). Previous syllabi come from GET /api/study/syllabus.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import SyllabusView from "./SyllabusView";
import { parseModelJson } from "@/lib/parse-model-json";
import FullPageLoader from "@/components/FullPageLoader";
import LoadingSpinner from "@/components/LoadingSpinner";
import type { StartLanguage } from "@/lib/prompts";
import { sanitizeStartLanguage } from "@/lib/sanitize-language-mode";

type SyllabusEntry = {
  id: string;
  topic: string;
  created_at: string;
  syllabus_json: unknown;
  language?: string;
};

const START_LANGUAGE_OPTIONS: { value: StartLanguage; label: string }[] = [
  { value: "english", label: "English" },
  { value: "hausa", label: "Hausa" },
];

export default function StudyIntakeForm() {
  const searchParams = useSearchParams();
  // Prefills the topic field when arriving from a Home "Start something new"
  // suggestion chip (?topic=...) — read once on mount, not re-applied on
  // every render, so it never fights the user's own typing.
  const [topic, setTopic] = useState(() => searchParams.get("topic") ?? "");
  const [goal, setGoal] = useState("");
  // Chosen at intake, default English — see prompts.ts's StartLanguage doc
  // comment for why this lives here (per-topic) rather than as a global
  // setting.
  const [startLanguage, setStartLanguage] = useState<StartLanguage>("english");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [syllabus, setSyllabus] = useState<string | null>(null);
  const [syllabusId, setSyllabusId] = useState("");
  // The language of whichever syllabus is currently open in SyllabusView —
  // either just-picked from the form above (new generation) or read back
  // from a saved syllabus's own stored language (reopening one).
  const [openSyllabusLanguage, setOpenSyllabusLanguage] = useState<StartLanguage>("english");
  const [hydrating, setHydrating] = useState(true);
  const [syllabi, setSyllabi] = useState<SyllabusEntry[]>([]);
  const [selectedSyllabusId, setSelectedSyllabusId] = useState("");
  const [syllabusMenuOpen, setSyllabusMenuOpen] = useState(false);
  const [deletingSyllabusId, setDeletingSyllabusId] = useState<string | null>(null);
  const [deleteSyllabusError, setDeleteSyllabusError] = useState<string | null>(null);
  // Live generation progress — self-calibrating from the actual stream
  // (chars received / elapsed time), not a hardcoded per-hardware number,
  // so it adapts automatically whether this is a fast VPS or the slow
  // 2015 dual-core target laptop, local or cloud mode alike.
  const [genStartedAt, setGenStartedAt] = useState<number | null>(null);
  const [genCharsReceived, setGenCharsReceived] = useState(0);
  // Value itself unused — only the setter matters, to force a periodic
  // re-render so the elapsed-time estimate ticks between stream chunks.
  const [, setGenTick] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const loadSyllabi = async () => {
      try {
        const response = await fetch("/api/study/syllabus");
        if (!response.ok) return;
        const payload = (await response.json()) as { syllabi?: SyllabusEntry[] };
        if (!isMounted) return;
        setSyllabi(payload.syllabi ?? []);
      } finally {
        if (isMounted) setHydrating(false);
      }
    };
    loadSyllabi();
    return () => {
      isMounted = false;
    };
  }, []);

  // Forces a re-render every 300ms while generating so the elapsed-time-based
  // estimate updates smoothly even during gaps between stream chunks, not
  // just when new text arrives.
  useEffect(() => {
    if (!submitting) return;
    const interval = setInterval(() => setGenTick((t) => t + 1), 300);
    return () => clearInterval(interval);
  }, [submitting]);

  // ~4 chars/token is a standard rough heuristic for English/JSON text — good
  // enough for a live ETA, not meant to be exact. TYPICAL_SYLLABUS_TOKENS is
  // the average of the real measured completions documented in ollama.ts's
  // NUM_PREDICT.json comment (round 1: 250/612/705/907, round 2:
  // 201/281/615/1101 — averages to ~584; rounded up slightly since broader
  // topics skew the estimate worth erring toward, so "almost done" doesn't
  // fire too early on a long one).
  const CHARS_PER_TOKEN = 4;
  const TYPICAL_SYLLABUS_TOKENS = 650;

  function genSubMessage(): string {
    if (!genStartedAt) return "This could take a while.";
    const elapsedSec = (Date.now() - genStartedAt) / 1000;
    if (elapsedSec < 2) return "Connecting to the model…";
    const estTokens = genCharsReceived / CHARS_PER_TOKEN;
    const tokPerSec = estTokens / elapsedSec;
    if (tokPerSec < 0.1) return `Warming up the model… (${Math.round(elapsedSec)}s elapsed)`;
    if (estTokens >= TYPICAL_SYLLABUS_TOKENS * 0.95) {
      return `Almost done — finishing up… (${Math.round(elapsedSec)}s elapsed, ${tokPerSec.toFixed(1)} tok/s)`;
    }
    const etaSec = Math.max(1, Math.round((TYPICAL_SYLLABUS_TOKENS - estTokens) / tokPerSec));
    return `~${etaSec}s left · ${tokPerSec.toFixed(1)} tok/s`;
  }

  const canSubmit = topic.trim().length > 0;

  const handleAutofill = () => {
    setTopic("Limits");
    setGoal("Understand limits and solve problems under it");
  };

  // Optimistic remove, same pattern as bookmarks' toggleBookmark: update the
  // list immediately, revert if the DELETE actually fails. The "currently
  // open" case doesn't need special handling here — this list only renders
  // while no syllabus is open (the component returns SyllabusView early
  // otherwise), so there's no risk of deleting what's on screen.
  const deleteSyllabus = async (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (deletingSyllabusId) return;
    setDeleteSyllabusError(null);
    setDeletingSyllabusId(id);
    const previous = syllabi;
    setSyllabi((prev) => prev.filter((entry) => entry.id !== id));
    if (selectedSyllabusId === id) setSelectedSyllabusId("");
    try {
      const res = await fetch(`/api/study/syllabus/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Could not delete this syllabus.");
      }
    } catch (err) {
      setSyllabi(previous);
      setDeleteSyllabusError(err instanceof Error ? err.message : "Could not delete this syllabus.");
    } finally {
      setDeletingSyllabusId(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    setSaved(false);
    setSyllabus(null);

    try {
      const cleanTopic = topic.trim();
      const cleanGoal = goal.trim();

      const intakeRes = await fetch("/api/study/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: cleanTopic,
          goal: cleanGoal,
          studyMinutes: 30,
          scenarioType: "quick-refresh",
          scenario: cleanGoal,
        }),
      });
      if (!intakeRes.ok) {
        const d = await intakeRes.json().catch(() => ({}));
        throw new Error(d.error ?? "Could not save intake.");
      }
      const intake = await intakeRes.json();

      const { syllabusGenerationSystemPrompt } = await import("@/lib/prompts");
      const system = syllabusGenerationSystemPrompt();

      // One generation attempt: stream the model output and parse it into a
      // syllabus. `strictSuffix` is appended to the system prompt on the retry
      // to nudge the model toward clean, single-line JSON (the small local
      // model occasionally emits raw newlines/control chars inside string
      // values, which parseModelJson repairs, or malformed JSON, which the
      // retry regenerates).
      //
      // GENERATION_TIMEOUT_MS guards against a genuine hang (Ollama crashed,
      // never responds) rather than a slow-but-progressing generation: the
      // documented worst-case real output is ~1101 tokens (see ollama.ts's
      // NUM_PREDICT.json comment); even at a pessimistic 3 tok/s on weak
      // hardware that's ~370s, so 6 minutes leaves real headroom without
      // leaving the UI stuck indefinitely on an actual dead connection.
      const GENERATION_TIMEOUT_MS = 6 * 60 * 1000;

      const attemptGenerate = async (strictSuffix: string) => {
        setGenStartedAt(Date.now());
        setGenCharsReceived(0);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

        let llmRes: Response;
        try {
          llmRes = await fetch("/api/llm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              routeTag: "json",
              system: system + strictSuffix,
              messages: [
                {
                  role: "user",
                  content: [`Topic: ${cleanTopic}`, cleanGoal ? `Goal: ${cleanGoal}` : null, `Available minutes: 30`]
                    .filter(Boolean)
                    .join("\n"),
                },
              ],
            }),
          });
        } catch (err) {
          clearTimeout(timeoutId);
          if (err instanceof DOMException && err.name === "AbortError") {
            throw new Error("The model timed out — it may be stuck or Ollama may have stopped responding. Try again.");
          }
          throw err;
        }
        if (!llmRes.ok || !llmRes.body) {
          clearTimeout(timeoutId);
          const d = await llmRes.json().catch(() => ({}));
          throw new Error(d.error ?? "Local model call failed.");
        }

        const reader = llmRes.body.getReader();
        const decoder = new TextDecoder();
        let text = "";
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            text += chunk;
            setGenCharsReceived((c) => c + chunk.length);
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            throw new Error("The model timed out mid-response — it may be stuck. Try again.");
          }
          throw err;
        } finally {
          clearTimeout(timeoutId);
        }

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Model did not return a parseable syllabus.");
        const result = parseModelJson(jsonMatch[0]) as { units?: unknown };
        if (!result.units) throw new Error("Model's syllabus JSON had no units.");
        return result;
      };

      let parsed: { units?: unknown };
      try {
        parsed = await attemptGenerate("");
      } catch {
        // Retry once with a corrective instruction before surfacing an error.
        parsed = await attemptGenerate(
          "\n\nIMPORTANT: Return ONLY valid, minified JSON on a single line. Do not put line breaks, tabs, or backslashes inside any string value.",
        );
      }

      const syllabusRes = await fetch("/api/study/syllabus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intakeId: intake.id,
          topic: cleanTopic,
          goal: cleanGoal,
          units: parsed.units,
          language: startLanguage,
        }),
      });
      if (!syllabusRes.ok) {
        const d = await syllabusRes.json().catch(() => ({}));
        throw new Error(d.error ?? "Could not save syllabus.");
      }
      const savedSyllabus = await syllabusRes.json();

      fetch("/api/streaks", { method: "POST" }).catch(() => {});

      setSyllabus(JSON.stringify({ topic: cleanTopic, goal: cleanGoal, units: parsed.units }));
      setSyllabusId(savedSyllabus.id ?? "");
      setOpenSyllabusLanguage(startLanguage);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save study details.");
    } finally {
      setSubmitting(false);
      setGenStartedAt(null);
      setGenCharsReceived(0);
    }
  };

  if (syllabus) {
    return (
      <SyllabusView
        raw={syllabus}
        syllabusId={syllabusId}
        startLanguage={openSyllabusLanguage}
        onExit={() => {
          setSyllabus(null);
          setSyllabusId("");
          setSaved(false);
        }}
      />
    );
  }

  if (hydrating) {
    return (
      <div className="card-deep card-deep-glow mx-auto w-full max-w-3xl rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-semibold">Study mode</h1>
        <div className="card-deep mt-6 rounded-2xl p-6 text-white/70">
          <p className="flex items-center gap-3 text-sm">
            <LoadingSpinner size={18} label="Loading" />
            Loading your saved syllabi...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card-deep card-deep-glow mx-auto w-full max-w-3xl rounded-2xl p-6 text-white">
      <h1 className="text-2xl font-semibold">Study mode</h1>
      <div className="mt-6">
      {submitting ? (
        <FullPageLoader
          message={`Generating full syllabus for "${topic.trim()}"`}
          subMessage={genSubMessage()}
        />
      ) : null}

      <div className="mb-4 flex justify-end">
        <a
          href="/"
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 transition hover:border-white/40"
        >
          Back to dashboard
        </a>
      </div>
      <p className="mb-4 text-sm text-white/70">
        Tell us a bit about your goal so we can build a tailored syllabus.
      </p>
      <div className="card-deep mb-6 rounded-2xl p-5 text-white/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Previous syllabi</p>
            <p className="text-xs text-white/60">
              Start fresh or open a past syllabus from the menu.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {syllabi.length === 0 ? (
              <p className="text-xs text-white/50">No saved syllabi yet.</p>
            ) : (
              <>
                {syllabi.slice(0, 3).map((entry) => {
                  const date = new Date(entry.created_at).toLocaleDateString();
                  const isSelected = entry.id === selectedSyllabusId;
                  const isDeleting = deletingSyllabusId === entry.id;
                  return (
                    <div
                      key={entry.id}
                      className={`flex items-center gap-1 rounded-full border pl-3 pr-1.5 py-1.5 text-xs font-semibold ${
                        isSelected
                          ? "border-white/60 bg-white text-slate-900"
                          : "border-white/20 bg-white/5 text-white/70"
                      } ${isDeleting ? "opacity-50" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSyllabusId(entry.id);
                          if (entry.syllabus_json) {
                            setSyllabus(JSON.stringify(entry.syllabus_json));
                            setSyllabusId(entry.id);
                            setOpenSyllabusLanguage(sanitizeStartLanguage(entry.language));
                          }
                        }}
                        disabled={isDeleting}
                        className={`flex items-center gap-2 ${!isSelected ? "hover:text-white" : ""}`}
                      >
                        <span>{entry.topic}</span>
                        <span className={isSelected ? "text-slate-700/70" : "text-white/40"}>
                          {date}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => deleteSyllabus(entry.id, e)}
                        disabled={isDeleting}
                        aria-label={`Delete syllabus for ${entry.topic}`}
                        data-testid={`syllabus-chip-delete-${entry.id}`}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-sm leading-none disabled:cursor-not-allowed ${
                          isSelected ? "text-slate-500 hover:bg-slate-900/10" : "text-white/40 hover:bg-white/10 hover:text-white/80"
                        }`}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
                {syllabi.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => setSyllabusMenuOpen(true)}
                    className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:border-white/40"
                  >
                    +{syllabi.length - 3} more
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
        {deleteSyllabusError && (
          <p className="mt-2 text-xs text-rose-300">{deleteSyllabusError}</p>
        )}
      </div>

      <form className="space-y-4" onSubmit={handleSubmit} data-testid="study-intake-form">
        <div>
          <label className="text-sm font-semibold text-white/90">Topic name</label>
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. Linear Algebra, Electrochemistry, React Basics"
            data-testid="topic-input"
            className="mt-2 w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
            required
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-white/90">Goal (optional)</label>
          <input
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="e.g. Ace my midterm, build a portfolio project"
            data-testid="goal-input"
            className="mt-2 w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-white/90">Tutor language</label>
          <p className="mt-1 text-xs text-white/50">
            Follow-up questions always adapt to whatever language you actually type, regardless of this choice.
          </p>
          <div className="mt-2 flex gap-2">
            {START_LANGUAGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStartLanguage(opt.value)}
                data-testid={`start-language-${opt.value}`}
                aria-pressed={startLanguage === opt.value}
                className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                  startLanguage === opt.value
                    ? "border-emerald-300/50 bg-emerald-500/15 text-emerald-200"
                    : "border-white/20 text-white/60 hover:border-white/40 hover:text-white/80"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {saved ? <p className="text-sm text-emerald-300">Syllabus generated.</p> : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleAutofill}
            className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white/80"
          >
            Auto fill
          </button>
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            data-testid="generate-syllabus-button"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
          >
            {submitting ? "Generating..." : "Generate custom syllabus"}
          </button>
        </div>

        {syllabusMenuOpen ? (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/80 backdrop-blur">
            <button
              type="button"
              onClick={() => setSyllabusMenuOpen(false)}
              className="absolute inset-0"
              aria-label="Close syllabus menu"
            />
            <aside className="card-deep relative flex h-full w-full max-w-sm flex-col gap-4 p-6 text-white shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
                    Syllabi
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">Previous syllabi</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSyllabusMenuOpen(false)}
                  className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/70 hover:border-white/40"
                >
                  Close
                </button>
              </div>
              <div className="flex flex-col gap-3 overflow-y-auto">
                {syllabi.map((entry) => {
                  const date = new Date(entry.created_at).toLocaleDateString();
                  const isSelected = entry.id === selectedSyllabusId;
                  const isDeleting = deletingSyllabusId === entry.id;
                  return (
                    <div
                      key={entry.id}
                      className={`flex items-center gap-2 rounded-2xl border px-4 py-3 ${
                        isSelected
                          ? "border-white/60 bg-white text-slate-900"
                          : "border-white/15 bg-white/5 text-white/80"
                      } ${isDeleting ? "opacity-50" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSyllabusId(entry.id);
                          if (entry.syllabus_json) {
                            setSyllabus(JSON.stringify(entry.syllabus_json));
                            setSyllabusId(entry.id);
                            setOpenSyllabusLanguage(sanitizeStartLanguage(entry.language));
                            setSyllabusMenuOpen(false);
                          }
                        }}
                        disabled={isDeleting}
                        className={`flex flex-1 items-center justify-between gap-3 text-left text-sm font-semibold ${
                          !isSelected ? "hover:text-white" : ""
                        }`}
                      >
                        <span>{entry.topic}</span>
                        <span className={isSelected ? "text-slate-600/70" : "text-white/40"}>
                          {date}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => deleteSyllabus(entry.id, e)}
                        disabled={isDeleting}
                        aria-label={`Delete syllabus for ${entry.topic}`}
                        data-testid={`syllabus-menu-delete-${entry.id}`}
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base leading-none disabled:cursor-not-allowed ${
                          isSelected ? "text-slate-500 hover:bg-slate-900/10" : "text-white/40 hover:bg-white/10 hover:text-white/80"
                        }`}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>
        ) : null}
      </form>
      </div>
    </div>
  );
}
