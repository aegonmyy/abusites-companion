/**
 * Mic capture + client-side WAV re-encoding.
 *
 * The brief is explicit: MediaRecorder's native codec (webm/opus in
 * Chromium, the only one verified against Ollama here) is NOT assumed to
 * work — only raw 16-bit PCM WAV was verified end-to-end against
 * gemma4:e2b (see docs/AUDIO_FINDING.md). So regardless of what codec
 * MediaRecorder captures in, this always decodes it via Web Audio and
 * re-encodes to a plain WAV file before it ever reaches /api/llm.
 *
 * Pure Web Audio API — no native modules, no WASM, nothing that needs a
 * prebuilt binary. Runs the same on the target Windows/EliteBook build as
 * it does here.
 */

export type RecordedAudio = { base64: string; format: "wav" };

export type AudioRecorder = {
  stop: () => Promise<RecordedAudio>;
  cancel: () => void;
};

export async function startRecording(): Promise<AudioRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start();

  function teardown() {
    stream.getTracks().forEach((t) => t.stop());
  }

  return {
    async stop(): Promise<RecordedAudio> {
      recorder.stop();
      await stopped;
      teardown();

      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      const arrayBuffer = await blob.arrayBuffer();

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      } finally {
        await audioCtx.close().catch(() => {});
      }

      const wavBuffer = audioBufferToWav(audioBuffer);
      return { base64: arrayBufferToBase64(wavBuffer), format: "wav" };
    },
    cancel() {
      try {
        recorder.stop();
      } catch {
        // already stopped
      }
      teardown();
    },
  };
}

/** Downmixes to mono and writes a standard 16-bit PCM WAV — the exact
 * shape verified working against gemma4:e2b via Ollama's OpenAI-compatible
 * endpoint (see ollamaChatAudioStream in src/lib/ollama.ts). */
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;
  const samples = mixDownToMono(buffer);

  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return out;
}

function mixDownToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const length = buffer.length;
  const out = new Float32Array(length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) out[i] += data[i] / buffer.numberOfChannels;
  }
  return out;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

/** Chunked to avoid call-stack blowups on longer recordings (String.fromCharCode.apply
 * with a huge argument list can exceed engine limits). */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
