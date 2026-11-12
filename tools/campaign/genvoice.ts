/** Generates narrated mission clips (Kokoro TTS + ffmpeg radio filter, like the unit voices) into public/audio/voices/campaign/<key>.mp3.
 *    bun tools/campaign/genvoice.ts [campaignId] [--force]
 * Lines: every objective reveal/complete announcement + every string literal passed to rt.say(...) in mission files.
 * Keys come from src/campaign/voiceKey.ts, the same hash the game uses at runtime; missing clips fall back to browser TTS. */
import { CAMPAIGNS } from '../../src/campaign/registry';
import { lineKey, revealLine, doneLine } from '../../src/campaign/voiceKey';
import { readdirSync, readFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const only = process.argv[2]?.startsWith('--') ? undefined : process.argv[2];
const force = process.argv.includes('--force');
const out = join(import.meta.dir, '../../public/audio/voices/campaign');
mkdirSync(out, { recursive: true });

// value: a voice kind from kokoro_lines.py ('adjutant' | 'cmd') or 'voice:<kokoro voice id>' (data missions' speakers)
const lines = new Map<string, string>();
for (const c of CAMPAIGNS) {
  if (only && c.id !== only) continue;
  for (const m of c.missions) for (const o of m.objectives) {
    if (o.passive) continue;
    lines.set(revealLine(o.text), 'adjutant'); lines.set(doneLine(o.text, o.kind === 'bonus'), 'adjutant');
  }
  // data missions: every dialogue line, in its speaker's voice
  for (const m of c.missions) if (m.data) for (const l of m.data.dialogue) {
    const v = m.data.speakers[l.speaker]?.voice;
    lines.set(l.text, v ? `voice:${v}` : 'cmd');
  }
  const dir = join(import.meta.dir, '../../src/campaign/campaigns', c.id, 'missions');
  for (const f of readdirSync(dir)) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const mm of src.matchAll(/\bsay\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) lines.set(mm[2]!.replace(/\\(['"])/g, '$1'), 'cmd');
  }
}
// Kokoro (same engine/voices as tools/tts): needs a venv with kokoro-onnx + soundfile and the model files.
//   KOKORO_PY=/path/to/venv/bin/python KOKORO_MODELS=/path/to/dir (holds kokoro-v1.0.onnx + voices-v1.0.bin)
const py = process.env.KOKORO_PY, models = process.env.KOKORO_MODELS;
if (!py || !models) { console.error('Set KOKORO_PY and KOKORO_MODELS (see tools/tts/generate.py for setup).'); process.exit(1); }
const list = [...lines].map(([text, kind]) => ({ key: lineKey(text), text, kind }));
const tmp = join(out, '_lines.json');
await Bun.write(tmp, JSON.stringify(list));
const r = Bun.spawnSync([py, join(import.meta.dir, 'kokoro_lines.py'), '--models', models, '--lines', tmp, '--out', out, ...(force ? ['--force'] : [])], { stdout: 'inherit', stderr: 'inherit' });
unlinkSync(tmp);
console.log(`${lines.size} lines, exit ${r.exitCode}`);
