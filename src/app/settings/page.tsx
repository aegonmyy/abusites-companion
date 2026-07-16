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

export default function SettingsPage() {
  const [language, setLanguage] = useState<Language>("en");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setLanguage((d.language as Language) ?? "en"))
      .finally(() => setLoading(false));
  }, []);

  async function save(next: Language) {
    setSaving(true);
    setLanguage(next);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: next }),
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
                      onChange={() => save(opt.value)}
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
