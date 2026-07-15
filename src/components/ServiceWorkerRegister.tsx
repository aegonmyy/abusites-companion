"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker for offline asset caching. No-ops on
 * unsupported browsers instead of throwing (offline is the premise, but a
 * missing SW should never break the app on an already-loaded page).
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline asset caching is best-effort; the app must still work.
    });
  }, []);

  return null;
}
