"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Settings has no Grinnish equivalent (the hosted app kept language in the
// account/profile). The target's local language setting is kept as-is and
// dressed in Grinnish's own glass-card / pill vocabulary so it reads as part
// of Grinnish.

type Language = "en" | "ha" | "mixed";

const LANGUAGE_OPTIONS: { value: Language; label: string; hint: string }[] = [
  { value: "en", label: "English", hint: "All replies in English." },
  { value: "ha", label: "Hausa", hint: "Replies in Hausa; technical terms stay in English." },
  {
    value: "mixed",
    label: "Hausa + English (natural mix)",
    hint: "Code-switches the way students actually talk.",
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setLanguage((d.language as Language) ?? "en");
        setTemperature(typeof d.temperature === "number" ? d.temperature : TEMPERATURE_DEFAULT);
        setTokenBudget(typeof d.tokenBudget === "number" ? d.tokenBudget : TOKEN_BUDGET_DEFAULT);
      })
      .finally(() => setLoading(false));
  }, []);

  async function save(next: Partial<{ language: Language; temperature: number; tokenBudget: number }>) {
    setSaving(true);
    if (next.language !== undefined) setLanguage(next.language);
    if (next.temperature !== undefined) setTemperature(next.temperature);
    if (next.tokenBudget !== undefined) setTokenBudget(next.tokenBudget);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-12" data-testid="settings-page">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white">Settings</h1>
            <p className="mt-2 text-sm text-white/70">
              Everything below runs entirely on this machine. No account, no login.
            </p>
          </div>
          <Link href="/" className="nav-button rounded-full px-4 py-2 text-sm font-semibold">
            Back to dashboard
          </Link>
        </header>

        {loading ? (
          <p className="mt-8 text-sm text-white/70">Loading settings…</p>
        ) : (
          <div className="mt-8 flex flex-col gap-6">
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-sm font-semibold uppercase tracking-[0.2em] text-white/50">
                Language
              </legend>
              {LANGUAGE_OPTIONS.map((opt) => {
                const active = language === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 shadow-xl backdrop-blur transition ${
                      active
                        ? "border-emerald-300/50 bg-white/15"
                        : "border-white/10 bg-white/10 hover:border-white/30"
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

            <fieldset className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur">
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
                  Shorter replies come back faster on slower hardware.
                </span>
              </label>
            </fieldset>

            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-white/70 shadow-xl backdrop-blur">
              Model:{" "}
              <span className="font-mono text-white">gemma4:e2b</span> (fixed for
              this build — the larger e4b variant is only ever enabled after
              verified-stable memory testing on the demo hardware).
              {saving && <span className="ml-2 text-white/50">Saving…</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
