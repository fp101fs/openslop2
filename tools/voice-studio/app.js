import { PHRASES } from "./phrases.js";
import { DEFAULT_FX, fxFor, pitchRate, render, toWav } from "./fx.js";

const VOICES = [
  "af_heart", "af_alloy", "af_aoede", "af_bella", "af_jessica", "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
  "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx", "am_puck",
  "bf_alice", "bf_emma", "bf_isabella", "bf_lily", "bm_daniel", "bm_fable", "bm_george", "bm_lewis",
];
const RACES = ["terran", "protoss", "zerg"];
const RACE_VOICE = { terran: ["am_adam", 1.05], protoss: ["am_onyx", 0.95], zerg: ["af_nicole", 0.82], clean: ["af_heart", 1] };

// Slider specs per effect parameter: [label, min, max, step]
const FX_UI = {
  pitch: ["Pitch", { semis: ["Semitones", -12, 7, 1] }],
  ghost: ["Ghost layer", { mix: ["Mix", 0, 1, 0.05], detune: ["Detune", -12, 12, 1] }],
  bitcrush: ["Bitcrush", { bits: ["Bits", 3, 16, 1], down: ["Downsample", 1, 12, 1] }],
  band: ["Radio band-pass", { low: ["Low Hz", 60, 1200, 10], high: ["High Hz", 1500, 8000, 50] }],
  drive: ["Distortion", { amount: ["Drive", 0, 150, 1] }],
  ring: ["Robot (ring mod)", { freq: ["Freq Hz", 5, 200, 1], mix: ["Mix", 0, 1, 0.05] }],
  echo: ["Echo", { time: ["Time s", 0.02, 0.8, 0.01], feedback: ["Feedback", 0, 0.85, 0.05], mix: ["Mix", 0, 1, 0.05] }],
  reverb: ["Reverb", { size: ["Size s", 0.2, 5, 0.1], mix: ["Mix", 0, 1, 0.05] }],
  static: ["Static", { level: ["Level", 0, 0.2, 0.005] }],
  clicks: ["Radio clicks", {}],
};

const $ = (id) => document.getElementById(id);
const state = { tab: "terran", race: "terran", fx: fxFor("terran"), phrases: structuredClone(PHRASES), raw: null, rawKey: "", clips: [], selected: null };
let ac;
let playing;

// ---------- TTS worker ----------
const worker = new Worker("./worker.js", { type: "module" });
const pending = new Map();
let reqId = 0;
worker.onmessage = ({ data }) => {
  if (data.type === "progress") return setStatus(`Downloading voice model… ${Math.round(data.pct)}%`);
  if (data.type === "ready") return setStatus("Voice model ready", "ready");
  const p = pending.get(data.id);
  if (!p) return;
  pending.delete(data.id);
  data.type === "done" ? p.resolve(data) : p.reject(new Error(data.error));
};
worker.postMessage({ id: "warmup", text: "", voice: "af_heart", speed: 1 });
const speak = (text, voice, speed) => new Promise((resolve, reject) => {
  const id = ++reqId;
  pending.set(id, { resolve, reject });
  worker.postMessage({ id, text, voice, speed });
});

function setStatus(text, cls = "") {
  $("statusText").textContent = text;
  $("status").className = cls;
}

// ---------- Phrase panel ----------
function renderTabs() {
  $("tabs").innerHTML = "";
  for (const r of Object.keys(state.phrases)) {
    const b = document.createElement("button");
    b.textContent = r;
    b.className = r === state.tab ? "on" : "";
    b.onclick = () => { state.tab = r; renderTabs(); renderPhrases(); };
    $("tabs").append(b);
  }
}

function renderPhrases() {
  const box = $("phrases");
  box.innerHTML = "";
  for (const [unit, def] of Object.entries(state.phrases[state.tab] ?? {})) {
    const u = document.createElement("div");
    u.className = "unit";
    u.innerHTML = `<h3>${unit}<span>${def.voice ?? ""}</span></h3>`;
    for (const line of def.lines) {
      const c = document.createElement("button");
      c.className = "chip" + (state.selected === `${unit}|${line}` ? " on" : "");
      c.textContent = line;
      c.onclick = () => pickPhrase(unit, def, line);
      c.ondblclick = () => generate();
      u.append(c);
    }
    box.append(u);
  }
}

function pickPhrase(unit, def, line) {
  state.selected = `${unit}|${line}`;
  $("text").value = line;
  setRace(RACES.includes(state.tab) ? state.tab : "clean", def.fx);
  if (def.voice) $("voice").value = def.voice;
  if (def.speed) setSpeed(def.speed);
  renderPhrases();
}

// Accepts { faction|race, units: { name: { voice, speed, fx?, lines | events } } }
$("import").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const race = (data.faction || data.race || file.name.split(/[_.]/)[0]).toLowerCase();
    const units = {};
    for (const [name, u] of Object.entries(data.units ?? {})) {
      const lines = u.lines ?? Object.values(u.events ?? {}).flat();
      units[name] = { voice: u.voice, speed: u.speed, lines: [...new Set(lines.filter((l) => typeof l === "string"))] };
    }
    state.phrases[race] = { ...(state.phrases[race] ?? {}), ...units };
    state.tab = race;
    renderTabs(); renderPhrases();
    setStatus(`Imported ${Object.keys(units).length} units into ${race}`, "ready");
  } catch (err) {
    setStatus(`Import failed: ${err.message}`, "err");
  }
  e.target.value = "";
};

// ---------- Controls ----------
function setSpeed(v) { $("speed").value = v; $("speedVal").textContent = (+v).toFixed(2) + "×"; }
$("speed").oninput = (e) => setSpeed(e.target.value);
$("voice").innerHTML = VOICES.map((v) => `<option>${v}</option>`).join("");

function setRace(race, overrides) {
  state.race = race;
  state.fx = fxFor(race, overrides);
  document.documentElement.style.setProperty("--race", `var(--${race})`);
  for (const b of $("races").children) b.classList.toggle("on", b.dataset.r === race);
  renderFx();
}

for (const r of [...RACES, "clean"]) {
  const b = document.createElement("button");
  b.dataset.r = r;
  b.textContent = r === "clean" ? "No FX" : r;
  b.onclick = () => {
    setRace(r);
    $("voice").value = RACE_VOICE[r][0];
    setSpeed(RACE_VOICE[r][1]);
  };
  $("races").append(b);
}

function renderFx() {
  const grid = $("fxgrid");
  grid.innerHTML = "";
  for (const [key, [title, params]] of Object.entries(FX_UI)) {
    const cfg = state.fx[key];
    const card = document.createElement("div");
    card.className = "fx" + (cfg.on ? " on" : "");
    card.innerHTML = `<header>${title}<label class="switch"><input type="checkbox" ${cfg.on ? "checked" : ""}><i></i></label></header>`;
    card.querySelector("input").onchange = (e) => { cfg.on = e.target.checked; card.classList.toggle("on", cfg.on); };
    for (const [p, [label, min, max, step]] of Object.entries(params)) {
      const row = document.createElement("div");
      row.className = "p";
      row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${cfg[p]}"><span class="val">${cfg[p]}</span>`;
      row.querySelector("input").oninput = (e) => { cfg[p] = +e.target.value; row.lastChild.textContent = e.target.value; };
      row.querySelector("input").ondblclick = () => { cfg[p] = DEFAULT_FX[key][p]; renderFx(); };
      card.append(row);
    }
    grid.append(card);
  }
}

// ---------- Generate ----------
async function makeClip(text, voice, speed) {
  const fx = structuredClone(state.fx);
  const rate = pitchRate(fx);
  // Pitch shift speeds up / slows down playback, so pre-compensate Kokoro's speed.
  const ttsSpeed = Math.min(2, Math.max(0.5, speed / rate));
  const key = `${text}|${voice}|${ttsSpeed.toFixed(3)}`;
  let raw = state.rawKey === key ? state.raw : null;
  if (!raw) {
    raw = await speak(text, voice, ttsSpeed);
    state.raw = raw; state.rawKey = key;
  }
  const buffer = await render(raw.audio, raw.sr, fx);
  const unit = state.selected?.split("|")[0];
  return { text, voice, race: state.race, unit, buffer, url: URL.createObjectURL(toWav(buffer)) };
}

async function generate() {
  const text = $("text").value.trim();
  if (!text || $("go").disabled) return;
  ac ??= new AudioContext();
  ac.resume();
  const lines = $("batch").checked ? text.split("\n").map((l) => l.trim()).filter(Boolean) : [text];
  $("go").disabled = true;
  try {
    for (let i = 0; i < lines.length; i++) {
      $("go").textContent = lines.length > 1 ? `Generating ${i + 1}/${lines.length}…` : "Generating…";
      const clip = await makeClip(lines[i], $("voice").value, +$("speed").value);
      state.clips.unshift(clip);
      renderClips();
      await play(clip, lines.length > 1);
    }
    setStatus("Voice model ready", "ready");
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`, "err");
  } finally {
    $("go").disabled = false;
    $("go").textContent = "Generate & Play";
  }
}

function play(clip, wait = false) {
  ac ??= new AudioContext();
  playing?.stop();
  const src = ac.createBufferSource();
  src.buffer = clip.buffer;
  src.connect(ac.destination);
  src.start();
  playing = src;
  drawWave(clip);
  return wait ? new Promise((r) => (src.onended = r)) : Promise.resolve();
}

function drawWave(clip) {
  const cv = $("wave"), g = cv.getContext("2d");
  const d = clip.buffer.getChannelData(0), w = cv.width, h = cv.height;
  g.clearRect(0, 0, w, h);
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(`--${clip.race}`).trim() || "#4cc2ff";
  const step = Math.ceil(d.length / w);
  for (let x = 0; x < w; x++) {
    let max = 0;
    for (let i = x * step; i < (x + 1) * step && i < d.length; i++) max = Math.max(max, Math.abs(d[i]));
    const y = max * h * 0.48;
    g.fillRect(x, h / 2 - y, 1, y * 2 || 1);
  }
  $("clipInfo").textContent = `${clip.buffer.duration.toFixed(2)}s · ${clip.voice}`;
  cv.onclick = () => play(clip);
}

function renderClips() {
  const box = $("clips");
  box.innerHTML = "";
  state.clips.slice(0, 30).forEach((clip, i) => {
    const row = document.createElement("div");
    row.className = "clip";
    const name = `${clip.race}_${(clip.unit ?? "custom").replace(/\s+/g, "-")}_${clip.text.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.wav`.toLowerCase();
    row.innerHTML = `<button>▶</button><span class="t"></span><span class="tag">${clip.race}${clip.unit ? " · " + clip.unit : ""}</span><a download="${name}" href="${clip.url}">WAV</a>`;
    row.querySelector(".t").textContent = clip.text;
    row.querySelector("button").onclick = () => play(clip);
    box.append(row);
  });
}

$("go").onclick = generate;
$("text").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); } });

// ---------- Init ----------
renderTabs();
const firstUnit = Object.entries(PHRASES.terran)[0];
pickPhrase(firstUnit[0], firstUnit[1], firstUnit[1].lines[0]);
