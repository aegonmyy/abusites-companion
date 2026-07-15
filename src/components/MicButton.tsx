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

  const label =
    state === "recording" ? "Stop" : state === "processing" ? "Processing…" : state === "error" ? "Mic error" : "🎤";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || state === "processing"}
      data-testid="mic-button"
      data-state={state}
      aria-pressed={state === "recording"}
      title="Ask by voice"
      className={
        "rounded-lg px-3 py-2 text-sm border disabled:opacity-50 " +
        (state === "recording"
          ? "bg-red-600 text-white border-red-600 animate-pulse"
          : "border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5")
      }
    >
      {label}
    </button>
  );
}
