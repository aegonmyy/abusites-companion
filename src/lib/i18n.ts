/**
 * Static UI-chrome strings only (nav, page headers, primary buttons, empty
 * states). This is separate from src/lib/prompts.ts, which controls the
 * language of *model-generated* content (syllabi, tutor chat, note
 * summaries/quizzes) — that path is the one that actually matters for
 * comprehension and is fully live for ha/mixed.
 *
 * This dictionary is a machine-translated first pass covering the
 * highest-visibility strings only (not exhaustive — most fine-grained
 * microcopy still falls back to English). Flagged for native Hausa-speaker
 * review before being treated as final; see final report / open items.
 */
import { useEffect, useState } from "react";

export type Language = "en" | "ha" | "mixed";

const STRINGS = {
  nav_home: { en: "Home", ha: "Gida" },
  nav_study: { en: "Study", ha: "Karatu" },
  nav_notes: { en: "Notes", ha: "Bayanai" },
  nav_past_qs: { en: "Past Qs", ha: "Tsofaffin Tambayoyi" },
  nav_bookmarks: { en: "Bookmarks", ha: "Ajiyayyu" },
  nav_settings: { en: "Settings", ha: "Saitunan" },
  day_streak: { en: "day streak", ha: "kwanaki jere" },

  notes_title: { en: "Notes", ha: "Bayanai" },
  notes_new_button: { en: "New note", ha: "Sabon bayani" },
  notes_empty: { en: 'No notes yet. Start with "New note".', ha: 'Babu bayanai tukuna. Fara da "Sabon bayani".' },

  bookmarks_title: { en: "Bookmarks", ha: "Ajiyayyu" },
  bookmarks_empty: { en: "No bookmarks yet.", ha: "Babu ajiyayyu tukuna." },

  settings_title: { en: "Settings", ha: "Saitunan" },
  study_title: { en: "Study mode", ha: "Yanayin karatu" },

  submit: { en: "Submit", ha: "Aika" },
  send: { en: "Send", ha: "Tura" },
  loading: { en: "Loading…", ha: "Ana lodawa…" },
} as const;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, language: Language): string {
  const entry = STRINGS[key];
  // "mixed" reads chrome in English (technical/nav chrome, not explanatory
  // prose) — the code-switch value is for model output, not button labels.
  if (language === "ha") return entry.ha;
  return entry.en;
}

/** Convenience hook: reads the local Settings language once on mount. */
export function useLanguage(): Language {
  const [language, setLanguage] = useState<Language>("en");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setLanguage((d.language as Language) ?? "en");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return language;
}
