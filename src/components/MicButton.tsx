"use client";

import { useRef, useState } from "react";
import { startRecording, type AudioRecorder, type RecordedAudio } from "@/lib/audio-record";

type Props = {
  onRecorded: (audio: RecordedAudio) => void;
  disabled?: boolean;
};

/** Tap to start recording, tap again to stop and send. Records via
 * MediaRecorder, then always re-encodes to WAV client-side before handing
 * off — see src/lib/audio-record.ts for why. */
export default function MicButton({ onRecorded, disabled }: Props) {
  const [state, setState] = useState<"idle" | "recording" | "processing" | "error">("idle");
  const recorderRef = useRef<AudioRecorder | null>(null);

  async function handleClick() {
    if (state === "recording") {
      setState("processing");
      try {
        const recorder = recorderRef.current;
        recorderRef.current = null;
        if (!recorder) {
          setState("idle");
          return;
        }
        const audio = await recorder.stop();
        setState("idle");
        onRecorded(audio);
      } catch {
        setState("error");
      }
      return;
    }

    try {
      recorderRef.current = await startRecording();
      setState("recording");
    } catch {
      setState("error");
    }
  }

  const showText = state === "processing" || state === "error";
  const label = state === "processing" ? "…" : state === "error" ? "!" : null;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || state === "processing"}
      data-testid="mic-button"
      data-state={state}
      aria-pressed={state === "recording"}
      aria-label={state === "recording" ? "Stop recording" : "Ask by voice"}
      title="Ask by voice"
      className={"btn-icon " + (state === "recording" ? "animate-pulse" : "btn-icon-ghost")}
      style={
        state === "recording"
          ? { background: "var(--bad)", color: "#fff", border: "1px solid var(--bad)" }
          : undefined
      }
    >
      {showText ? (
        <span className="text-sm font-semibold">{label}</span>
      ) : state === "recording" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v3" />
        </svg>
      )}
    </button>
  );
}
