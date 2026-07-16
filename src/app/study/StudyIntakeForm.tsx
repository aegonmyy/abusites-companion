"use client";

// Ported from Grinnish's app/study-mode/StudyIntakeForm.tsx. Markup/classes
// are Grinnish's verbatim: the generating overlay with the liquid-fill spinner,
// the "Previous syllabi" chips + slide-in menu, the topic/goal form, Auto fill.
// Rewired to the local target's generation pipeline: intake -> /api/llm
// (routeTag json, syllabusGenerationSystemPrompt) -> persist via
// /api/study/syllabus, then render the ported SyllabusView inline (Grinnish's
// single-page model). Previous syllabi come from GET /api/study/syllabus.

import { useEffect, useState } from "react";
import SyllabusView from "./SyllabusView";
import { parseModelJson } from "@/lib/parse-model-json";

type SyllabusEntry = {
  id: string;
  topic: string;
  created_at: string;
  syllabus_json: unknown;
};

export default function StudyIntakeForm() {
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [syllabus, setSyllabus] = useState<string | null>(null);
  const [syllabusId, setSyllabusId] = useState("");
  const [loadingMessage, setLoadingMessage] = useState("Booting study engine...");
  const [hydrating, setHydrating] = useState(true);
  const [syllabi, setSyllabi] = useState<SyllabusEntry[]>([]);
  const [selectedSyllabusId, setSelectedSyllabusId] = useState("");
  const [syllabusMenuOpen, setSyllabusMenuOpen] = useState(false);

  const loadingMessages = [
    "Booting study engine...",
    "Reading your topic...",
    "Brewing a custom syllabus...",
    "Aligning knowledge satellites...",
    "Tuning the concept radar...",
  ];

  useEffect(() => {
    if (!submitting) return;
    let index = 0;
    setLoadingMessage(loadingMessages[index]);
    const interval = window.setInterval(() => {
      index = (index + 1) % loadingMessages.length;
      setLoadingMessage(loadingMessages[index]);
    }, 1800);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting]);

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

  const canSubmit = topic.trim() && goal.trim();

  const handleAutofill = () => {
    setTopic("Limits");
    setGoal("Understand limits and solve problems under it");
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

      const settingsRes = await fetch("/api/settings");
      const settings = await settingsRes.json();
      const { syllabusGenerationSystemPrompt } = await import("@/lib/prompts");
      const system = syllabusGenerationSystemPrompt(settings.language ?? "en");

      // One generation attempt: stream the model output and parse it into a
      // syllabus. `strictSuffix` is appended to the system prompt on the retry
      // to nudge the model toward clean, single-line JSON (the small local
      // model occasionally emits raw newlines/control chars inside string
      // values, which parseModelJson repairs, or malformed JSON, which the
      // retry regenerates).
      const attemptGenerate = async (strictSuffix: string) => {
        const llmRes = await fetch("/api/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            routeTag: "json",
            system: system + strictSuffix,
            messages: [
              {
                role: "user",
                content: `Topic: ${cleanTopic}\nGoal: ${cleanGoal}\nAvailable minutes: 30`,
              },
            ],
          }),
        });
        if (!llmRes.ok || !llmRes.body) {
          const d = await llmRes.json().catch(() => ({}));
          throw new Error(d.error ?? "Local model call failed.");
        }

        const reader = llmRes.body.getReader();
        const decoder = new TextDecoder();
        let text = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
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
        body: JSON.stringify({ intakeId: intake.id, topic: cleanTopic, goal: cleanGoal, units: parsed.units }),
      });
      if (!syllabusRes.ok) {
        const d = await syllabusRes.json().catch(() => ({}));
        throw new Error(d.error ?? "Could not save syllabus.");
      }
      const savedSyllabus = await syllabusRes.json();

      fetch("/api/streaks", { method: "POST" }).catch(() => {});

      setSyllabus(JSON.stringify({ topic: cleanTopic, goal: cleanGoal, units: parsed.units }));
      setSyllabusId(savedSyllabus.id ?? "");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save study details.");
    } finally {
      setSubmitting(false);
    }
  };

  if (syllabus) {
    return (
      <SyllabusView
        raw={syllabus}
        syllabusId={syllabusId}
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
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/70">
        <p className="text-sm">Loading your saved syllabi...</p>
      </div>
    );
  }

  return (
    <>
      {submitting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-6 backdrop-blur">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/10 p-6 text-white shadow-2xl backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full border border-white/20 p-2 text-white/80">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  viewBox="0 0 32 32"
                  role="img"
                  aria-label="Sending"
                >
                  <defs>
                    <linearGradient id="liquidGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38BDF8" />
                      <stop offset="100%" stopColor="#10B981" />
                    </linearGradient>
                    <mask id="liquidMask">
                      <circle cx="16" cy="16" r="12" fill="white" />
                    </mask>
                  </defs>
                  <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2" fill="none" />
                  <g mask="url(#liquidMask)">
                    <rect x="0" y="32" width="32" height="32" fill="url(#liquidGrad)">
                      <animateTransform
                        attributeName="transform"
                        type="translate"
                        from="0 0"
                        to="0 -32"
                        dur="1.6s"
                        repeatCount="indefinite"
                      />
                    </rect>
                  </g>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold">Generating syllabus</p>
                <p className="text-xs text-white/60">Please hold tight.</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
              {loadingMessage}
            </div>
          </div>
        </div>
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
      <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-5 text-white/80">
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
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => {
                        setSelectedSyllabusId(entry.id);
                        if (entry.syllabus_json) {
                          setSyllabus(JSON.stringify(entry.syllabus_json));
                          setSyllabusId(entry.id);
                        }
                      }}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        isSelected
                          ? "border-white/60 bg-white text-slate-900"
                          : "border-white/20 bg-white/5 text-white/70 hover:border-white/40"
                      }`}
                    >
                      <span>{entry.topic}</span>
                      <span className={isSelected ? "text-slate-700/70" : "text-white/40"}>
                        {date}
                      </span>
                    </button>
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
          <label className="text-sm font-semibold text-white/90">Goal</label>
          <input
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="e.g. Ace my midterm, build a portfolio project"
            data-testid="goal-input"
            className="mt-2 w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
            required
          />
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
            <aside className="relative flex h-full w-full max-w-sm flex-col gap-4 border-l border-white/10 bg-white/10 p-6 text-white shadow-2xl backdrop-blur">
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
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedSyllabusId(entry.id)}
                      className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold ${
                        isSelected
                          ? "border-white/60 bg-white text-slate-900"
                          : "border-white/15 bg-white/5 text-white/80 hover:border-white/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span>{entry.topic}</span>
                        <span className={isSelected ? "text-slate-600/70" : "text-white/40"}>
                          {date}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    const entry = syllabi.find((item) => item.id === selectedSyllabusId);
                    if (entry?.syllabus_json) {
                      setSyllabus(JSON.stringify(entry.syllabus_json));
                      setSyllabusId(entry.id);
                      setSyllabusMenuOpen(false);
                    }
                  }}
                  disabled={!selectedSyllabusId}
                  className="w-full rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
                >
                  Open selected syllabus
                </button>
              </div>
            </aside>
          </div>
        ) : null}
      </form>
    </>
  );
}
