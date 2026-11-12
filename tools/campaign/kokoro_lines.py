#!/usr/bin/env python3
"""Renders mission lines with Kokoro (same voices/filters as tools/tts/generate.py). Called by genvoice.ts.
  python kokoro_lines.py --models DIR --lines lines.json --out public/audio/voices/campaign [--force]
lines.json: [{key, text, kind: 'adjutant'|'cmd'}]"""
import argparse, json, os, subprocess, tempfile
import soundfile as sf
from kokoro_onnx import Kokoro

VOICES = {  # kind -> (voice, speed, fx)
    'adjutant': ('af_nicole', 0.97, 'highpass=f=150,lowpass=f=7600,acompressor=threshold=-22dB:ratio=3:attack=4:release=90'),
    'cmd': ('am_adam', 1.05, 'highpass=f=140,lowpass=f=7200,acompressor=threshold=-20dB:ratio=3:attack=5:release=80'),
}
# trim leading and trailing silence only (a mid-line pause between sentences must not cut the clip short)
TRIM = 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse'
NORM = 'loudnorm=I=-18:TP=-2:LRA=7'

ap = argparse.ArgumentParser()
ap.add_argument('--models', required=True); ap.add_argument('--lines', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--force', action='store_true')
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
k = Kokoro(os.path.join(a.models, 'kokoro-v1.0.onnx'), os.path.join(a.models, 'voices-v1.0.bin'))
made = 0
for l in json.load(open(a.lines)):
    path = os.path.join(a.out, l['key'] + '.mp3')
    if os.path.exists(path) and not a.force: continue
    # 'voice:<id>' = a data-mission speaker's Kokoro voice with the radio filter of the commander line
    voice, speed, fx = (l['kind'][6:], 1.0, VOICES['cmd'][2]) if l['kind'].startswith('voice:') else VOICES[l['kind']]
    samples, sr = k.create(l['text'], voice=voice, speed=speed, lang='en-us')
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t: sf.write(t.name, samples, sr)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', t.name, '-af', f'{TRIM},{fx},{NORM}', '-ac', '1', '-ar', '24000',
                    '-codec:a', 'libmp3lame', '-q:a', '5', path], check=True)
    os.unlink(t.name); made += 1; print(f"  {l['key']} ({voice}): {l['text']}", flush=True)
print(f'done: {made} generated')
