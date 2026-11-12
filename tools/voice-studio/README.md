# OpenSlop II Voice Studio

A standalone browser tool that turns text into SC2-style unit voice lines. It uses [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) text-to-speech (via `kokoro-js`) and adds Terran, Protoss or Zerg voice effects with the Web Audio API.

It sits in the sc2-clone repo, but the game doesn't import or depend on it.

## Start

```bash
cd tools/voice-studio
bun install          # first time only
bun server.ts        # → http://localhost:5177  (use PORT=xxxx to change the port)
```

On first launch the browser downloads the Kokoro model (~90 MB) and caches it. Later launches start fast. The status dot (top right) turns green when the model is ready.

## Use

1. **Pick a phrase** on the left (Terran / Protoss / Zerg tabs). That loads its text, voice, speed and race effects.
2. **Generate & Play**: speech is generated, effects are applied and the clip plays. You can also double-click a phrase or press ⌘/Ctrl + Enter.
3. **Download**: each clip in the Output list has a **WAV** link. Click the waveform to replay.

Or type your own text, choose any Kokoro voice and speed, and click a race button to apply its effects.

- **Tweak effects:** every effect has an on/off switch and sliders. Double-click a slider to reset it. If you change only effects, the next Generate re-renders instantly without making new speech.
- **Batch:** tick **One clip per line** to make a separate clip from each line in the text box.
- **Import phrases:** load a JSON phrase bank. Accepted formats are `{ "race": "terran", "units": { "Marine": { "voice": "am_adam", "speed": 1.1, "lines": [...] } } }` and the event format in `tools/tts/terran_lines.json`.

## Race presets

| Race | Default voice | Effects |
|---|---|---|
| Terran | deep male, normal speed | radio band-pass, light distortion, bitcrush, static, key-up clicks |
| Protoss | deep male, pitched down | robotic ring modulation, light echo, short reverb |
| Zerg | female, slow, pitched down | ghost voice layer, light distortion, long echo, big reverb |

Effects available: pitch, ghost layer, bitcrush, band-pass, distortion, ring mod, echo, reverb, static and radio clicks. Every clip is normalised to −1 dBFS.

## Files

| File | Purpose |
|---|---|
| `server.ts` | Tiny Bun static server |
| `index.html` | UI layout and styles |
| `app.js` | UI logic, phrase loading, playback, clip list |
| `worker.js` | Runs Kokoro in a Web Worker so the UI doesn't freeze |
| `fx.js` | Effect chain, race presets, WAV export |
| `phrases.js` | Preset phrase banks (original lines written in each unit's style) |

Add units or lines by editing `phrases.js`. Each unit takes `voice`, `speed`, optional `fx` overrides and `lines`.

## Notes

- Pitch shift changes playback rate, so the tool asks Kokoro for a compensating speed. The speed you set is the speed you hear.
- Kokoro-82M and kokoro-js are Apache-2.0 licensed.
