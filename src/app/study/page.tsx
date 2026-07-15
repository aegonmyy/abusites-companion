"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SCENARIOS = [
  { value: "quick-refresh", label: "Quick refresh" },
  { value: "practice-heavy", label: "Practice-heavy" },
  { value: "stuck-on-concepts", label: "Stuck on concepts" },
  { value: "custom", label: "Custom" },
];

/**
 * Ported from the reference repo's StudyIntakeForm.tsx UX (topic / goal /
 * minutes / scenario), rewritten to call the local intake + syllabus
 * generation routes instead of the reference repo's cloud backend/model.
 */
export default function StudyIntakePage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [studyMinutes, setStudyMinutes] = useState(30);
  const [scenarioType, setScenarioType] = useState("quick-refresh");
  const [scenario, setScenario] = useState("");
  const [status, setStatus] = useState<"idle" | "generating" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("generating");

    try {
      const intakeRes = await fetch("/api/study/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, goal, studyMinutes, scenarioType, scenario }),
      });
      if (!intakeRes.ok) {
        const d = await intakeRes.json();
        throw new Error(d.error ?? "Could not save intake.");
      }
      const intake = await intakeRes.json();

      const settingsRes = await fetch("/api/settings");
      const settings = await settingsRes.json();

      const { syllabusGenerationSystemPrompt } = await import("@/lib/prompts");
      const system = syllabusGenerationSystemPrompt(settings.language ?? "en");

      const llmRes = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeTag: "json",
          system,
          messages: [
            {
              role: "user",
              content: `Topic: ${topic}\nGoal: ${goal}\nAvailable minutes: ${studyMinutes}\nScenario: ${scenario}`,
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
      const parsed = JSON.parse(jsonMatch[0]);

      const syllabusRes = await fetch("/api/study/syllabus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intakeId: intake.id, topic, goal, units: parsed.units }),
      });
      if (!syllabusRes.ok) {
        const d = await syllabusRes.json();
        throw new Error(d.error ?? "Could not save syllabus.");
      }
      const syllabus = await syllabusRes.json();

      fetch("/api/streaks", { method: "POST" }).catch(() => {});
      router.push(`/study/syllabus/${syllabus.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="study-intake-form">
      <div>
        <h1 className="text-xl font-semibold">Study mode</h1>
        <p className="text-sm text-black/60 dark:text-white/60 mt-1">
          Tell it what you want to study — the local model builds a compact
          syllabus, then tutors you through each subunit.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Topic
        <input
          required
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          data-testid="topic-input"
          className="border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 bg-transparent"
          placeholder="e.g. Newton's laws of motion"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Goal
        <input
          required
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          data-testid="goal-input"
          className="border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 bg-transparent"
          placeholder="e.g. pass Friday's quiz"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Minutes available
        <input
          required
          type="number"
          min={5}
          value={studyMinutes}
          onChange={(e) => setStudyMinutes(Number(e.target.value))}
          data-testid="minutes-input"
          className="border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 bg-transparent"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Scenario
        <select
          value={scenarioType}
          onChange={(e) => setScenarioType(e.target.value)}
          data-testid="scenario-type-select"
          className="border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 bg-transparent"
        >
          {SCENARIOS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Describe your situation
        <textarea
          required
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          data-testid="scenario-input"
          className="border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 bg-transparent"
          rows={3}
          placeholder="e.g. I understand the basics but keep messing up direction/sign conventions."
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={status === "generating"}
        data-testid="generate-syllabus-button"
        className="self-start rounded-full bg-black text-white dark:bg-white dark:text-black px-5 py-2 text-sm font-medium disabled:opacity-50"
      >
        {status === "generating" ? "Generating syllabus…" : "Generate syllabus"}
      </button>
    </form>
  );
}
