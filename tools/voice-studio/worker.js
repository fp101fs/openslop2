// Runs Kokoro off the main thread so the UI stays smooth.
import { KokoroTTS } from "./kokoro.web.js";

let ttsPromise;
function load() {
  ttsPromise ??= KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
    dtype: "q8",
    device: "wasm",
    progress_callback: (p) => {
      if (p.status === "progress" && p.total) postMessage({ type: "progress", pct: (p.loaded / p.total) * 100, file: p.file });
    },
  });
  return ttsPromise;
}

onmessage = async (e) => {
  const { id, text, voice, speed } = e.data;
  try {
    const tts = await load();
    if (id === "warmup") return postMessage({ type: "ready" });
    const out = await tts.generate(text, { voice, speed });
    postMessage({ type: "done", id, audio: out.audio, sr: out.sampling_rate }, [out.audio.buffer]);
  } catch (err) {
    ttsPromise = undefined;
    postMessage({ type: "error", id, error: String(err?.message ?? err) });
  }
};
