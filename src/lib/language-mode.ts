"use client";

import { useEffect, useState } from "react";
import type { StartLanguage } from "./prompts";
import { sanitizeStartLanguage } from "./sanitize-language-mode";

/** Fetches Settings.language once on mount — the default language for the
 * one-shot AI-explain features that have no intake step to ask at (QOTD,
 * CBT review, Past-Questions "Explain with AI"). Study mode and Notes use
 * their own per-topic/per-note language instead (chosen at intake, stored
 * on StudySyllabus/Note) — this hook is only for the features that don't
 * have an intake moment to capture that choice at. */
export function useDefaultStartLanguage(): StartLanguage {
  const [lang, setLang] = useState<StartLanguage>("english");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setLang(sanitizeStartLanguage(d.language));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return lang;
}
