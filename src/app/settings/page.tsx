"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";

// Settings has no Grinnish equivalent (the hosted app kept language in the
// account/profile). The target's local language setting is kept as-is and
// dressed in Grinnish's own glass-card / pill vocabulary so it reads as part
// of Grinnish.

type Language = "en" | "ha" | "mixed";
type ModelSource = "local" | "cloud";

const LANGUAGE_OPTIONS: { value: Language; label: string; hint: string }[] = [
  { value: "en", label: "English", hint: "All replies in English." },
  { value: "ha", label: "Hausa", hint: "Replies in Hausa; technical terms stay in English." },
  {
    value: "mixed",
    label: "Hausa + English (natural mix)",
    hint: "Code-switches the way students actually talk.",
  },
];

const MODEL_SOURCE_OPTIONS: { value: ModelSource; label: string; hint: string }[] = [
  {
    value: "local",
    label: "Local (Ollama)",
    hint: "Runs on this device, no internet needed after setup. Best if your machine can run a local model.",
  },
  {
    value: "cloud",
    label: "Cloud (Google AI Studio)",
    hint: "Uses your own API key over the internet. Best if your device can't run a local model at all.",
  },
];

// Same safe ranges enforced server-side in /api/settings — kept in sync by
// hand since this is a small, stable pair of constants (not worth a shared
// module for two numbers).
const TEMPERATURE_DEFAULT = 0.6; // matches the "chat" route default in ollama.ts
const TOKEN_BUDGET_DEFAULT = 200; // matches the "chat" route default in ollama.ts
const TEMPERATURE_MIN = 0;
const TEMPERATURE_MAX = 1;
const TOKEN_BUDGET_MIN = 80;
const TOKEN_BUDGET_MAX = 500;

export default function SettingsPage() {
  const [language, setLanguage] = useState<Language>("en");
  const [temperature, setTemperature] = useState(TEMPERATURE_DEFAULT);
  const [tokenBudget, setTokenBudget] = useState(TOKEN_BUDGET_DEFAULT);
  const [modelSource, setModelSource] = useState<ModelSource>("local");
  const [cloudApiKey, setCloudApiKey] = useState("");
  const [cloudModel, setCloudModel] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setLanguage((d.language as Language) ?? "en");
        setTemperature(typeof d.temperature === "number" ? d.temperature : TEMPERATURE_DEFAULT);
        setTokenBudget(typeof d.tokenBudget === "number" ? d.tokenBudget : TOKEN_BUDGET_DEFAULT);
        setModelSource((d.modelSource as ModelSource) ?? "local");
        setCloudApiKey(typeof d.cloudApiKey === "string" ? d.cloudApiKey : "");
        setCloudModel(typeof d.cloudModel === "string" ? d.cloudModel : "");
      })
      .finally(() => setLoading(false));
  }, []);

  async function save(
    next: Partial<{
      language: Language;
      temperature: number;
      tokenBudget: number;
      modelSource: ModelSource;
      cloudApiKey: string | null;
      cloudModel: string | null;
    }>,
  ) {
    setSaveStatus("saving");
    setSaveError(null);
    if (next.language !== undefined) setLanguage(next.language);
    if (next.temperature !== undefined) setTemperature(next.temperature);
    if (next.tokenBudget !== undefined) setTokenBudget(next.tokenBudget);
    if (next.modelSource !== undefined) setModelSource(next.modelSource);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Could not save settings.");
      }
      setSaveStatus("saved");
      // Transient success indicator — clears itself so it doesn't linger
      // as stale "saved" text next to a field the user has since changed
      // again. Errors are NOT cleared this way (see catch below): a failed
      // save should stay visible until the next attempt, not silently
      // disappear after 2s.
      window.setTimeout(() => {
        setSaveStatus((s) => (s === "saved" ? "idle" : s));
      }, 2000);
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Could not save settings.");
    }
  }

  return (
    <div className="min-h-screen px-6 py-12" data-testid="settings-page">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white">Settings</h1>
            <p className="mt-2 text-sm text-white/70">
              No account, no login. Local mode keeps everything on your
              device; cloud mode sends prompts to Google using your own key.
            </p>
          </div>
          <Link href="/" className="nav-button rounded-full px-4 py-2 text-sm font-semibold">
            Back to dashboard
          </Link>
        </header>

        {loading ? (
          <p className="mt-8 flex items-center gap-3 text-sm text-white/70">
            <LoadingSpinner size={18} label="Loading" />
            Loading settings…
          </p>
        ) : (
          <div className="mt-8 flex flex-col gap-6">
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-sm font-semibold uppercase tracking-[0.2em] text-white/50">
                Model source
              </legend>
              {MODEL_SOURCE_OPTIONS.map((opt) => {
                const active = modelSource === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`card-deep flex cursor-pointer items-start gap-3 rounded-2xl p-4 transition ${
                      active ? "border-emerald-300/50" : "hover:border-white/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="modelSource"
                      value={opt.value}
                      checked={active}
                      onChange={() => save({ modelSource: opt.value })}
                      className="mt-1 h-4 w-4 accent-emerald-400"
                      data-testid={`model-source-${opt.value}`}
                    />
                    <span>
                      <span className="block font-semibold text-white">{opt.label}</span>
                      <span className="block text-sm text-white/60">{opt.hint}</span>
                    </span>
                  </label>
                );
              })}

              {modelSource === "cloud" && (
                <div className="card-deep flex flex-col gap-4 rounded-2xl p-4" data-testid="cloud-settings">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-white/90">Google AI Studio API key</label>
                    <div className="flex items-center gap-2">
                      <input
                        type={showKey ? "text" : "password"}
                        value={cloudApiKey}
                        onChange={(e) => setCloudApiKey(e.target.value)}
                        placeholder="AIza..."
                        data-testid="cloud-api-key-input"
                        className="min-w-0 flex-1 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((s) => !s)}
                        className="shrink-0 rounded-full border border-white/20 px-3 py-2 text-xs font-semibold text-white/70 hover:border-white/40"
                      >
                        {showKey ? "Hide" : "Show"}
                      </button>
                    </div>
                    <span className="text-xs text-white/50">
                      Stored only in your local database, sent only to Google&apos;s API. Get a
                      key at{" "}
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-white"
                      >
                        aistudio.google.com/apikey
                      </a>
                      .
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-white/90">Cloud model (advanced)</label>
                    <input
                      value={cloudModel}
                      onChange={(e) => setCloudModel(e.target.value)}
                      placeholder="gemma-4-26b-a4b-it"
                      data-testid="cloud-model-input"
                      className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                    />
                    <span className="text-xs text-white/50">
                      Leave blank to use Gemma 4 (26B A4B), fits the free tier&apos;s
                      15 RPM / 16k TPM limits. Try gemma-4-31b-it if you need the
                      larger variant and have quota for it.
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => save({ cloudApiKey: cloudApiKey || null, cloudModel: cloudModel || null })}
                      disabled={saveStatus === "saving"}
                      data-testid="save-cloud-settings-button"
                      className="w-fit rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-900 disabled:opacity-60"
                    >
                      {saveStatus === "saving" ? "Saving…" : "Save cloud settings"}
                    </button>
                    {saveStatus === "saved" && (
                      <span data-testid="save-cloud-settings-success" className="text-xs font-semibold text-emerald-300">
                        Saved
                      </span>
                    )}
                    {saveStatus === "error" && (
                      <span data-testid="save-cloud-settings-error" className="text-xs font-semibold text-rose-300">
                        {saveError}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </fieldset>

            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-sm font-semibold uppercase tracking-[0.2em] text-white/50">
                Language
              </legend>
              {LANGUAGE_OPTIONS.map((opt) => {
                const active = language === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`card-deep flex cursor-pointer items-start gap-3 rounded-2xl p-4 transition ${
                      active ? "border-emerald-300/50" : "hover:border-white/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="language"
                      value={opt.value}
                      checked={active}
                      onChange={() => save({ language: opt.value })}
                      className="mt-1 h-4 w-4 accent-emerald-400"
                      data-testid={`language-${opt.value}`}
                    />
                    <span>
                      <span className="block font-semibold text-white">{opt.label}</span>
                      <span className="block text-sm text-white/60">{opt.hint}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <fieldset className="card-deep card-deep-glow flex flex-col gap-5 rounded-2xl p-4">
              <legend className="mb-1 text-sm font-semibold uppercase tracking-[0.2em] text-white/50">
                Response tuning
              </legend>
              <p className="-mt-3 text-xs text-white/50">
                Applies to the tutor, chat, and voice replies. Note generation and
                syllabus generation stay fixed for reliability.
              </p>

              <label className="flex flex-col gap-2">
                <span className="flex items-center justify-between text-sm font-semibold text-white/90">
                  Response creativity
                  <span className="font-mono text-xs text-white/60">{temperature.toFixed(2)}</span>
                </span>
                <input
                  type="range"
                  min={TEMPERATURE_MIN}
                  max={TEMPERATURE_MAX}
                  step={0.05}
                  value={temperature}
                  onChange={(e) => save({ temperature: Number(e.target.value) })}
                  className="w-full accent-emerald-400"
                  data-testid="temperature-slider"
                />
                <span className="text-xs text-white/50">
                  Lower = more predictable and to-the-point. Higher = more varied phrasing.
                </span>
              </label>

              <label className="flex flex-col gap-2">
                <span className="flex items-center justify-between text-sm font-semibold text-white/90">
                  Response length
                  <span className="font-mono text-xs text-white/60">{tokenBudget} tokens</span>
                </span>
                <input
                  type="range"
                  min={TOKEN_BUDGET_MIN}
                  max={TOKEN_BUDGET_MAX}
                  step={10}
                  value={tokenBudget}
                  onChange={(e) => save({ tokenBudget: Number(e.target.value) })}
                  className="w-full accent-emerald-400"
                  data-testid="token-budget-slider"
                />
                <span className="text-xs text-white/50">
                  Shorter replies come back faster on slower hardware. Local
                  mode only, cloud replies aren&apos;t capped by this since
                  they don&apos;t run on your device.
                </span>
              </label>
            </fieldset>

            {saveStatus === "saving" && <p className="text-xs text-white/50">Saving…</p>}
            {saveStatus === "saved" && <p className="text-xs font-semibold text-emerald-300">Saved</p>}
            {saveStatus === "error" && <p className="text-xs font-semibold text-rose-300">{saveError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
