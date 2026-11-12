#!/usr/bin/env python3
"""Generate in-game unit voice clips with Kokoro TTS (kokoro-onnx).

Usage:
  python tools/tts/generate.py --models DIR [--faction terran] [--out public/audio/voices] [--only marine,scv]

DIR must contain kokoro-v1.0.onnx and voices-v1.0.bin
(https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0).
Requires: pip install kokoro-onnx soundfile numpy, and ffmpeg on PATH.
Clips are skipped when their text/voice/speed/fx hash has not changed.
"""
import argparse, hashlib, json, os, subprocess, sys, tempfile
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

FX = {
    # light radio-comms colouring; all clips are loudness-normalised afterwards
    'radio': 'highpass=f=140,lowpass=f=7200,acompressor=threshold=-20dB:ratio=3:attack=5:release=80',
    'heavy': 'highpass=f=80,lowpass=f=6000,acompressor=threshold=-20dB:ratio=3:attack=5:release=100',
    'adjutant': 'highpass=f=150,lowpass=f=7600,acompressor=threshold=-22dB:ratio=3:attack=4:release=90',
    'pilot': 'highpass=f=200,lowpass=f=6800,acompressor=threshold=-18dB:ratio=4:attack=3:release=60',
}
TRIM = 'silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=1:stop_duration=0.25:stop_threshold=-45dB'
NORM = 'loudnorm=I=-18:TP=-2:LRA=7'

def pitch_filter(p):
    # shift pitch without changing duration: resample (pitch+speed) then tempo-correct
    if abs(p - 1.0) < 0.001:
        return ''
    return f'asetrate=24000*{p},aresample=24000,atempo={1.0 / p:.4f},'

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', required=True)
    ap.add_argument('--faction', default='terran')
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'audio', 'voices'))
    ap.add_argument('--only', default='')
    a = ap.parse_args()

    spec = json.load(open(os.path.join(os.path.dirname(__file__), f'{a.faction}_lines.json')))
    out_dir = os.path.abspath(os.path.join(a.out, a.faction))
    os.makedirs(out_dir, exist_ok=True)
    man_path = os.path.join(out_dir, 'manifest.json')
    old = json.load(open(man_path)).get('clips', {}) if os.path.exists(man_path) else {}  # clips only: units skipped by --only keep their entries
    only = set(filter(None, a.only.split(',')))

    kokoro = Kokoro(os.path.join(a.models, 'kokoro-v1.0.onnx'), os.path.join(a.models, 'voices-v1.0.bin'))
    manifest = {}
    made = skipped = 0
    for unit, u in spec['units'].items():
        if only and unit not in only:
            manifest[unit] = old.get(unit, {})
            continue
        manifest[unit] = {}
        for event, lines in u['events'].items():
            files = []
            for i, text in enumerate(lines):
                rel = f'{unit}/{event}_{i}.mp3'
                pitch = u.get('pitch', 1.0)
                h = hashlib.sha1(f"{text}|{u['voice']}|{u['speed']}|{u['fx']}|{pitch}".encode()).hexdigest()[:10]
                prev = old.get(unit, {}).get(event, [])
                prev_h = next((p['hash'] for p in prev if p['file'] == rel), None)
                path = os.path.join(out_dir, rel)
                if prev_h == h and os.path.exists(path):
                    skipped += 1
                else:
                    os.makedirs(os.path.dirname(path), exist_ok=True)
                    samples, sr = kokoro.create(text, voice=u['voice'], speed=u['speed'], lang='en-us')
                    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
                        sf.write(t.name, samples, sr)
                    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', t.name, '-af',
                                    f'{TRIM},{pitch_filter(pitch)}{FX[u["fx"]]},{NORM}', '-ac', '1', '-ar', '24000',
                                    '-codec:a', 'libmp3lame', '-q:a', '5', path], check=True)
                    os.unlink(t.name)
                    made += 1
                    print(f'  {unit}/{event}[{i}] ({u["voice"]}): {text}')
                files.append({'file': rel, 'hash': h, 'text': text})
            manifest[unit][event] = files
    meta = {unit: {'voice': u['voice'], 'gender': u['gender']} for unit, u in spec['units'].items()}
    json.dump({'faction': spec['faction'], 'voices': meta, 'clips': manifest}, open(man_path, 'w'), indent=1)
    print(f'done: {made} generated, {skipped} unchanged -> {out_dir}')

if __name__ == '__main__':
    sys.exit(main())
