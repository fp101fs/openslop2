// Effect chain rendered with an OfflineAudioContext.
// Pitch is done by changing playback rate; app.js compensates by asking Kokoro
// for a matching speed, so the final speed stays what the user set.

export const DEFAULT_FX = {
  pitch:   { on: false, semis: 0 },
  ghost:   { on: false, mix: 0.35, detune: -5 },          // eerie doubled voice
  bitcrush:{ on: false, bits: 8, down: 3 },
  band:    { on: false, low: 300, high: 3200 },
  drive:   { on: false, amount: 30 },
  ring:    { on: false, freq: 40, mix: 0.3 },
  echo:    { on: false, time: 0.12, feedback: 0.3, mix: 0.25 },
  reverb:  { on: false, size: 1.5, mix: 0.25 },
  static:  { on: false, level: 0.04 },
  clicks:  { on: false },
};

export const RACE_FX = {
  protoss: {
    pitch: { on: true, semis: -4 },
    ring: { on: true, freq: 38, mix: 0.28 },
    echo: { on: true, time: 0.09, feedback: 0.25, mix: 0.2 },
    reverb: { on: true, size: 1.2, mix: 0.18 },
  },
  terran: {
    band: { on: true, low: 320, high: 3200 },
    drive: { on: true, amount: 25 },
    bitcrush: { on: true, bits: 10, down: 2 },
    static: { on: true, level: 0.035 },
    clicks: { on: true },
  },
  zerg: {
    pitch: { on: true, semis: -3 },
    ghost: { on: true, mix: 0.4, detune: -7 },
    drive: { on: true, amount: 12 },
    echo: { on: true, time: 0.28, feedback: 0.35, mix: 0.22 },
    reverb: { on: true, size: 3.2, mix: 0.4 },
  },
  clean: {},
};

export function fxFor(race, overrides = {}) {
  const fx = structuredClone(DEFAULT_FX);
  for (const src of [RACE_FX[race] ?? {}, overrides]) {
    for (const [k, v] of Object.entries(src)) fx[k] = { ...fx[k], ...v };
  }
  return fx;
}

export const pitchRate = (fx) => (fx.pitch.on ? 2 ** (fx.pitch.semis / 12) : 1);

function crush(data, bits, down) {
  const out = new Float32Array(data.length);
  const steps = 2 ** bits / 2;
  let hold = 0;
  for (let i = 0; i < data.length; i++) {
    if (i % down === 0) hold = Math.round(data[i] * steps) / steps;
    out[i] = hold;
  }
  return out;
}

function impulse(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  return buf;
}

function noiseBuffer(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function driveCurve(amount) {
  const k = amount, n = 2048, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

// Mix a wet branch with the dry signal; returns the summed output node.
function wetDry(ctx, input, wetNode, mix) {
  const out = ctx.createGain();
  const dry = ctx.createGain(); dry.gain.value = 1 - mix * 0.5;
  const wet = ctx.createGain(); wet.gain.value = mix;
  input.connect(dry).connect(out);
  input.connect(wetNode); wetNode.connect(wet).connect(out);
  return out;
}

export async function render(samples, sr, fx) {
  const rate = pitchRate(fx);
  const voiceLen = samples.length / sr / rate;
  const tail = (fx.reverb.on ? fx.reverb.size : 0) + (fx.echo.on ? fx.echo.time * 6 : 0) + (fx.clicks.on ? 0.15 : 0) + 0.1;
  const lead = fx.clicks.on ? 0.12 : 0.02;
  const total = lead + voiceLen + tail;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * sr), sr);

  const voiceData = fx.bitcrush.on ? crush(samples, fx.bitcrush.bits, Math.max(1, Math.round(fx.bitcrush.down))) : samples;
  const buf = ctx.createBuffer(1, voiceData.length, sr);
  buf.copyToChannel(voiceData, 0);

  let node = ctx.createGain();
  const src = ctx.createBufferSource();
  src.buffer = buf; src.playbackRate.value = rate;
  src.connect(node); src.start(lead);

  if (fx.ghost.on) {
    const g = ctx.createBufferSource();
    g.buffer = buf; g.playbackRate.value = rate * 2 ** (fx.ghost.detune / 12);
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 900;
    const gg = ctx.createGain(); gg.gain.value = fx.ghost.mix;
    g.connect(hp).connect(gg).connect(node); g.start(lead + 0.015);
  }

  if (fx.band.on) {
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = fx.band.low; hp.Q.value = 0.9;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = fx.band.high; lp.Q.value = 0.9;
    const peak = ctx.createBiquadFilter(); peak.type = "peaking"; peak.frequency.value = 1800; peak.gain.value = 5;
    node.connect(hp); hp.connect(lp); lp.connect(peak); node = peak;
  }

  if (fx.drive.on) {
    const ws = ctx.createWaveShaper(); ws.curve = driveCurve(fx.drive.amount); ws.oversample = "4x";
    node.connect(ws); node = ws;
  }

  if (fx.ring.on) {
    const mod = ctx.createGain(); mod.gain.value = 0;
    const osc = ctx.createOscillator(); osc.frequency.value = fx.ring.freq;
    osc.connect(mod.gain); osc.start();
    node = wetDry(ctx, node, mod, fx.ring.mix);
  }

  if (fx.echo.on) {
    const d = ctx.createDelay(2); d.delayTime.value = fx.echo.time;
    const fb = ctx.createGain(); fb.gain.value = fx.echo.feedback;
    d.connect(fb).connect(d);
    node = wetDry(ctx, node, d, fx.echo.mix);
  }

  if (fx.reverb.on) {
    const conv = ctx.createConvolver(); conv.buffer = impulse(ctx, fx.reverb.size);
    node = wetDry(ctx, node, conv, fx.reverb.mix);
  }

  const master = ctx.createGain();
  node.connect(master);

  if (fx.static.on) {
    const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, total);
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2500; bp.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = fx.static.level;
    n.connect(bp).connect(g).connect(master); n.start(0);
  }

  if (fx.clicks.on) {
    // short squelch bursts as the radio keys on and off
    for (const t of [0.01, lead + voiceLen + 0.03]) {
      const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 0.07);
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 3000; bp.Q.value = 1.5;
      const g = ctx.createGain(); g.gain.value = 0.25;
      n.connect(bp).connect(g).connect(master); n.start(t);
    }
  }

  master.connect(ctx.destination);
  const out = await ctx.startRendering();

  // normalise to -1 dBFS
  let peak = 0;
  for (let c = 0; c < out.numberOfChannels; c++) for (const v of out.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.89 / peak : 1;
  for (let c = 0; c < out.numberOfChannels; c++) {
    const d = out.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= gain;
  }
  return out;
}

export function toWav(buffer) {
  const ch = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length;
  const view = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const str = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); view.setUint32(4, 36 + len * ch * 2, true); str(8, "WAVE"); str(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, ch, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * ch * 2, true); view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true); str(36, "data"); view.setUint32(40, len * ch * 2, true);
  const chans = [...Array(ch)].map((_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, chans[c][i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}
