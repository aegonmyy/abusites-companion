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
    return <p className="text-sm muted">Loading settings…</p>;
  }

  return (
    <div className="flex flex-col gap-6" data-testid="settings-page">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm muted mt-1">
          Everything below runs entirely on this machine. No account, no login.
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="font-semibold mb-1">Language</legend>
        {LANGUAGE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="card flex items-start gap-3 p-4 cursor-pointer transition-shadow has-[:checked]:shadow-[0_0_0_2px_var(--primary)]"
          >
            <input
              type="radio"
              name="language"
              value={opt.value}
              checked={language === opt.value}
              onChange={() => save(opt.value)}
              className="mt-1 accent-[var(--primary)]"
              data-testid={`language-${opt.value}`}
            />
            <span>
              <span className="block font-medium">{opt.label}</span>
              <span className="block text-sm muted">{opt.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="card p-4 text-sm muted">
        Model: <span className="font-mono" style={{ color: "var(--text)" }}>gemma4:e2b</span> (fixed for this build — the
        larger e4b variant is only ever enabled after verified-stable memory
        testing on the demo hardware).
        {saving && <span className="ml-2">Saving…</span>}
      </div>
    </div>
  );
}
