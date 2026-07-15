"use client";

import { useEffect, useState } from "react";

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

  if (loading) {
    return <p className="text-sm text-black/60 dark:text-white/60">Loading settings…</p>;
  }

  return (
    <div className="flex flex-col gap-6" data-testid="settings-page">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-black/60 dark:text-white/60 mt-1">
          Everything below runs entirely on this machine. No account, no login.
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="font-medium mb-1">Language</legend>
        {LANGUAGE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex items-start gap-3 border border-black/10 dark:border-white/10 rounded-lg p-3 cursor-pointer has-[:checked]:border-black/40 dark:has-[:checked]:border-white/40"
          >
            <input
              type="radio"
              name="language"
              value={opt.value}
              checked={language === opt.value}
              onChange={() => save(opt.value)}
              className="mt-1"
              data-testid={`language-${opt.value}`}
            />
            <span>
              <span className="block font-medium">{opt.label}</span>
              <span className="block text-sm text-black/60 dark:text-white/60">{opt.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="text-sm text-black/60 dark:text-white/60">
        Model: <span className="font-mono">gemma4:e2b</span> (fixed for this build — the
        larger e4b variant is only ever enabled after verified-stable memory
        testing on the demo hardware).
        {saving && <span className="ml-2">Saving…</span>}
      </div>
    </div>
  );
}
