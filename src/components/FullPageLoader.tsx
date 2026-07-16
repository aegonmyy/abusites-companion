"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import LoadingSpinner from "./LoadingSpinner";

/**
 * A true full-page loading state for real, multi-second model waits
 * (syllabus generation, note generation): the whole viewport dims/blurs
 * behind a centered spinner + status text, replacing the previous partial
 * overlay boxes / inline button spinners. Not for the in-chat "Thinking"
 * indicator inside an assistant bubble — that one stays small/inline since
 * it's part of an ongoing conversation, not a blocking page-level wait.
 *
 * Rendered via a portal straight into document.body rather than inline:
 * several ancestor cards in this app use `backdrop-blur` (a CSS filter),
 * and per spec, `filter`/`backdrop-filter` on an ancestor creates a new
 * containing block for `position: fixed` descendants — so without the
 * portal this overlay would size itself to the nearest blurred ancestor
 * card instead of the actual viewport. Verified with a real Playwright
 * geometry check during development.
 */
export default function FullPageLoader({
  message,
  subMessage,
}: {
  message: string;
  subMessage?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;

  return createPortal(
    <div
      data-testid="full-page-loader"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-slate-950/80 px-6 text-center backdrop-blur-md"
    >
      <LoadingSpinner size={48} label={message} />
      <div>
        <p className="text-base font-semibold text-white">{message}</p>
        {subMessage ? (
          <p className="mt-2 text-sm text-white/60">{subMessage}</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
