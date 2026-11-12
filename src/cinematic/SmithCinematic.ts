import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadSmithHead } from './SmithHead';
import { makeMarine, graftHead, play, rotateBoneWorld, holdBoneWorldRotation, type Actor } from './SmithMarine';
import { modelFactory } from '../graphics/ModelFactory';

/**
 * Terran mission 1 opening cinematic - "Outpost 42069".
 * Full-screen overlay with its own renderer + scene (independent of the match underneath). The cast is the detailed Marine model:
 * Colonel Smith is a Marine in power armour with his helmet swapped for the head from the supplied GLB, slapping everybody
 * on the outpost; the victims are ordinary helmeted Marines.
 *
 * Audio: drop `public/audio/cinematic/smith_message.mp3` (Smith's transmission) and/or `slap.mp3` (slap sound) and they are used
 * automatically; until then the transmission is a captioned placeholder and slaps are synthesised.
 */

interface Line { t0: number; t1: number; who: string; text: string; voice?: { pitch: number; rate: number } }
const LINES: Line[] = [
  { t0: 9.6, t1: 16.8, who: 'OPS', text: "Commander, we just received a distress beacon from Outpost 42069. It looks like there's a message attached.", voice: { pitch: 0.9, rate: 1.05 } },
  { t0: 17.4, t1: 30.6, who: 'INCOMING TRANSMISSION · COL. SMITH', text: '♪ [ transmission audio ] ♪' },
  { t0: 31.4, t1: 35.6, who: 'OPS', text: "Holy fucksticks! It's Colonel Smith!", voice: { pitch: 0.8, rate: 1.15 } },
  { t0: 35.8, t1: 41.8, who: 'OPS', text: "And it seems he's been infected with the Ahole virus.", voice: { pitch: 0.8, rate: 1.0 } }
];
const BRIEFING: { t: number; cls: string; text: string }[] = [
  { t: 0.5, cls: 'k', text: 'TERRAN · MISSION 1' },
  { t: 1.4, cls: 'h', text: 'OUTPOST 42069' },
  { t: 3.0, cls: 'p', text: 'Colonel Smith has gone haywire and started slapping everyone.' },
  { t: 5.4, cls: 'p', text: 'Your mission is to neutralize the threat.' }
];
const SLAP_TIMES = [18.2, 19.7, 21.1, 22.4, 23.6, 24.7, 25.7, 26.6];
const FINAL_FACE_T = 31.0;   // Smith is back at centre stage, facing the camera
const SCREEN_SLAP_T = 38.7;  // ...and slaps the screen
const ENDS_BLACK_T = 42.6;
const CARD_HOLD = 5.0;       // final objective card stays up this long...
const CARD_FADE = 2.0;       // ...then fades out over this long
const CARD_T = ENDS_BLACK_T + 0.3;
const END_T = CARD_T + CARD_HOLD + CARD_FADE;
const MUSIC_END_T = 44.5;    // the soundtrack clip is ~45 s: it fades out with the picture
const DUCK_GAIN = 0.22;      // soundtrack level while the ops TTS is speaking

const css = `
.cine{position:fixed;inset:0;z-index:100000;background:#000;color:#dfe9f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;overflow:hidden;user-select:none}
.cine canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.cine .bar{position:absolute;left:0;right:0;height:11vh;background:#000;transition:transform .8s ease;z-index:3}
.cine .bar.t{top:0;transform:translateY(-100%)}.cine .bar.b{bottom:0;transform:translateY(100%)}
.cine.lb .bar.t,.cine.lb .bar.b{transform:none}
.cine .fade{position:absolute;inset:0;background:#000;z-index:2;pointer-events:none}
.cine .flash{position:absolute;inset:0;background:#fff;opacity:0;z-index:4;pointer-events:none}
.cine .title{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.1vh;text-align:center;padding:0 8vw;pointer-events:none}
.cine .title div{opacity:0;transform:translateY(8px);transition:opacity .9s ease,transform .9s ease}
.cine .title div.on{opacity:1;transform:none}
.cine .title .k{letter-spacing:.5em;font-size:1.7vh;color:#6fb0ff}
.cine .title .h{font-size:7vh;font-weight:800;letter-spacing:.14em;color:#fff;text-shadow:0 0 24px rgba(80,160,255,.6);margin-bottom:2vh}
.cine .title .p{font-size:2.6vh;max-width:60ch;line-height:1.45;color:#cfe0f5}
.cine .sub{position:absolute;left:50%;bottom:13.5vh;transform:translateX(-50%);z-index:6;width:min(78vw,900px);text-align:center;pointer-events:none;opacity:0;transition:opacity .25s}
.cine .sub.on{opacity:1}
.cine .sub .who{font-size:1.5vh;letter-spacing:.28em;color:#6fd0ff;margin-bottom:.6vh}
.cine .sub .tx{font-size:2.9vh;line-height:1.35;color:#fff;text-shadow:0 2px 6px #000,0 0 14px #000;font-weight:600}
.cine .sub.tr .who{color:#ff7a5a}.cine .sub.tr .tx{color:#ffe9a8;font-style:italic}
.cine .rec{position:absolute;right:3vw;top:12.5vh;z-index:6;font-size:1.5vh;letter-spacing:.3em;color:#ff5a4a;opacity:0;transition:opacity .3s;pointer-events:none}
.cine .rec.on{opacity:1;animation:cineblink 1s steps(2) infinite}
@keyframes cineblink{50%{opacity:.25}}
.cine .slap{position:absolute;z-index:6;font-weight:900;font-size:9vh;color:#ffe14a;-webkit-text-stroke:.45vh #b3141a;text-shadow:0 .6vh 0 #7a0c10;pointer-events:none;opacity:0;font-family:Impact,'Arial Black',sans-serif;letter-spacing:.04em}
.cine .slap.go{animation:cineslap .65s ease-out forwards}
@keyframes cineslap{0%{opacity:0;transform:scale(.3) rotate(var(--r))}15%{opacity:1;transform:scale(1.25) rotate(var(--r))}70%{opacity:1;transform:scale(1) rotate(var(--r))}100%{opacity:0;transform:scale(1.1) rotate(var(--r))}}
.cine .skip{position:absolute;right:3vw;bottom:3vh;z-index:8;background:rgba(10,20,40,.55);border:1px solid rgba(160,200,255,.45);color:#cfe3ff;padding:.9vh 1.6vw;font-size:1.5vh;letter-spacing:.2em;cursor:pointer;border-radius:3px}
.cine .skip:hover{background:rgba(40,80,150,.7)}
.cine .comm{position:absolute;left:2.5vw;top:13vh;width:19vw;min-width:150px;z-index:6;pointer-events:none;opacity:0;transition:opacity .5s;background:#02070d;border:1px solid rgba(120,220,255,.55);box-shadow:0 0 18px rgba(60,180,255,.35),inset 0 0 14px rgba(0,0,0,.8);border-radius:4px;overflow:hidden}
.cine .comm.on{opacity:1}
.cine .comm .nm{position:relative;z-index:2;text-align:center;font-size:1.45vh;letter-spacing:.32em;color:#9fe6ff;padding:.7vh 0 .6vh;background:linear-gradient(#06141f,#04101a);border-bottom:1px solid rgba(120,220,255,.3);text-shadow:0 0 8px rgba(80,200,255,.8)}
.cine .comm .vid{position:relative;display:block;width:100%;aspect-ratio:216/286}
.cine .comm canvas.cv{position:absolute;inset:0;width:100%;height:100%}
.cine .comm .scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.28) 0,rgba(0,0,0,.28) 1px,transparent 1px,transparent 3px);mix-blend-mode:multiply}
.cine .comm .vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,10,20,.65) 100%)}
.cine .comm .tag{position:absolute;z-index:2;right:.6vw;bottom:.5vh;font-size:1.1vh;letter-spacing:.2em;color:#ff6a5a;animation:cineblink 1s steps(2) infinite}
.cine .loading{position:absolute;inset:0;z-index:7;display:flex;align-items:center;justify-content:center;font-size:1.8vh;letter-spacing:.4em;color:#6fb0ff}
`;

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class SmithCinematic {
  public isActive = false;
  private root!: HTMLElement;
  private raf = 0;
  private audio: AudioContext | null = null;
  private onDone: (() => void) | null = null;
  private disposeFns: (() => void)[] = [];

  /** Plays the sequence over the page; `done` is called once when it ends or is skipped. `speak` voices a line through the game's sound system. */
  public async play(done: () => void) {
    if (this.isActive) return;
    this.isActive = true;
    this.onDone = done;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    this.disposeFns.push(() => style.remove());
    const root = this.root = document.createElement('div');
    root.className = 'cine';
    root.innerHTML = `<div class="loading">LOADING TRANSMISSION…</div><div class="bar t"></div><div class="bar b"></div><div class="fade"></div><div class="flash"></div>
      <div class="title"></div><div class="rec">● SIGNAL</div><div class="sub"><div class="who"></div><div class="tx"></div></div><div class="comm"><div class="nm">COLONEL SMITH</div><div class="vid"><canvas class="cv" width="216" height="286"></canvas><div class="scan"></div><div class="vig"></div><div class="tag">● LIVE</div></div></div><div class="slap"></div><button class="skip">SKIP ▸▸</button>`;
    document.body.appendChild(root);
    this.disposeFns.push(() => root.remove());
    const skip = root.querySelector('.skip') as HTMLElement;
    skip.onclick = () => this.finish();
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); this.finish(); } };
    window.addEventListener('keydown', onKey, true);
    this.disposeFns.push(() => window.removeEventListener('keydown', onKey, true));

    try { await this.run(); } catch (err) { console.error('[cinematic]', err); this.finish(); }
  }

  public finish() {
    if (!this.isActive) return;
    this.isActive = false;
    cancelAnimationFrame(this.raf);
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    try { this.audio?.close(); } catch { /* ignore */ }
    for (const f of this.disposeFns.splice(0)) { try { f(); } catch { /* ignore */ } }
    const cb = this.onDone; this.onDone = null;
    cb?.();
  }

  // ---------------------------------------------------------------------------------------------------------------------------
  private async run() {
    const root = this.root;
    const $ = (s: string) => root.querySelector(s) as HTMLElement;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ac = this.audio = new AC();
    const [marineGltf, head, smithMsg, slapBuf, track] = await Promise.all([
      new GLTFLoader().loadAsync('models/marine.glb'),
      loadSmithHead(),
      loadOptionalAudio(ac, 'audio/cinematic/smith_message.mp3'),
      loadOptionalAudio(ac, 'audio/cinematic/slap.mp3'),
      loadOptionalAudio(ac, 'audio/cinematic/soundtrack.mp3')
    ]);
    if (!this.isActive) return;

    // ---- renderer / scene ----
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
    root.insertBefore(renderer.domElement, root.firstChild);
    this.disposeFns.push(() => { renderer.dispose(); renderer.domElement.remove(); });
    const scene = new THREE.Scene();
    const sky = buildSky(); scene.add(sky.mesh);
    scene.fog = new THREE.Fog(0x8a4f6e, 45, 150);
    const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 400);
    const onResize = () => { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); };
    window.addEventListener('resize', onResize); this.disposeFns.push(() => window.removeEventListener('resize', onResize));

    scene.add(new THREE.HemisphereLight(0xffe0c0, 0x5a4a60, 3.2));
    const sun = new THREE.DirectionalLight(0xffc08a, 5);
    sun.position.set(-18, 16, 14); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 70 });
    scene.add(sun);
    const alarm = new THREE.PointLight(0xff2a1a, 0, 40, 1.4); alarm.position.set(0, 6, -4); scene.add(alarm);
    scene.add(buildGround());
    const props = buildOutpost(); scene.add(props.group);
    loadSetPieces(scene).catch(() => { /* set dressing is optional */ });

    // ---- cast ----
    const smith = makeMarine(marineGltf, { helmet: false, rifle: false });
    graftHead(smith, head);
    scene.add(smith.root);
    const victims: Actor[] = [];
    const vBase: THREE.Vector3[] = [], vYaw: number[] = [];
    const rng = mulberry(42);
    for (let i = 0; i < SLAP_TIMES.length; i++) {
      const a = marineGltf && makeMarine(marineGltf, { helmet: true, rifle: i % 3 !== 1 });
      const ang = 0.55 + i * 0.78 + rng() * 0.25, rad = 4.6 + (i % 3) * 1.7 + rng();
      a.root.position.set(Math.cos(ang) * rad * 1.15, 0, Math.sin(ang) * rad - 1.5);
      vBase.push(a.root.position.clone());
      vYaw.push(rng() * Math.PI * 2);
      a.root.rotation.y = vYaw[i]!;
      play(a, 'idle', 0); a.action!.time = rng() * 2.5;
      scene.add(a.root); victims.push(a);
    }
    // Smith's route: one stop beside each victim, in order; ends back at centre stage
    const dirOf = (a: THREE.Vector3, b: THREE.Vector3) => Math.atan2(b.x - a.x, b.z - a.z);
    const stops: { p: THREE.Vector3; yaw: number }[] = [];
    let prev = new THREE.Vector3(-17, 0, 9);
    for (let i = 0; i < victims.length; i++) {
      const v = vBase[i]!, d = new THREE.Vector3().subVectors(v, prev).setY(0).normalize();
      const p = v.clone().addScaledVector(d, -1.75);
      stops.push({ p, yaw: Math.atan2(d.x, d.z) });
      prev = p;
    }
    const smithStart = new THREE.Vector3(-17, 0, 9);
    const smithHome = new THREE.Vector3(0.2, 0, 3.2);

    // ---- sound helpers ----
    const master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    const playBuf = (b: AudioBuffer, vol = 1) => { const s = ac.createBufferSource(); s.buffer = b; const g = ac.createGain(); g.gain.value = vol; s.connect(g).connect(master); s.start(); };
    const slapSound = (power = 1) => {
      if (slapBuf) { playBuf(slapBuf, power); return; }
      const t = ac.currentTime, len = 0.14, nb = ac.createBuffer(1, Math.floor(ac.sampleRate * len), ac.sampleRate), d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
      const n = ac.createBufferSource(); n.buffer = nb;
      const hp = ac.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 2600 + Math.random() * 900; hp.Q.value = 0.7;
      const g = ac.createGain(); g.gain.setValueAtTime(1.1 * power, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
      n.connect(hp).connect(g).connect(master); n.start(t);
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
      const og = ac.createGain(); og.gain.setValueAtTime(0.9 * power, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(og).connect(master); o.start(t); o.stop(t + 0.2);
    };
    let whooshBuf: AudioBuffer | null = null;
    fetch('/audio/sfx/futuristic-whoosh.mp3').then(r => (r.ok ? r.arrayBuffer() : null)).then(b => b && ac.decodeAudioData(b)).then(b => { if (b) whooshBuf = b; }).catch(() => {});
    const whoosh = () => {
      if (whooshBuf) { const n = ac.createBufferSource(); n.buffer = whooshBuf; n.playbackRate.value = 0.95 + Math.random() * 0.1; const g = ac.createGain(); g.gain.value = 0.45; n.connect(g).connect(master); n.start(); return; }
      const t = ac.currentTime, len = 0.22, nb = ac.createBuffer(1, Math.floor(ac.sampleRate * len), ac.sampleRate), d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / d.length);
      const n = ac.createBufferSource(); n.buffer = nb;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(2400, t + len); f.Q.value = 1.2;
      const g = ac.createGain(); g.gain.value = 0.25; n.connect(f).connect(g).connect(master); n.start(t);
    };
    const blip = (freq: number, at = 0) => {
      const t = ac.currentTime + at, o = ac.createOscillator(); o.type = 'square'; o.frequency.value = freq;
      const g = ac.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      o.connect(g).connect(master); o.start(t); o.stop(t + 0.1);
    };
    const speak = (text: string, v: { pitch: number; rate: number }) => {
      try {
        const u = new SpeechSynthesisUtterance(text); u.pitch = v.pitch; u.rate = v.rate; u.volume = 0.9;
        const voice = speechSynthesis.getVoices().find(x => x.lang.startsWith('en') && /Daniel|David|Fred|Alex/.test(x.name)); if (voice) u.voice = voice;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
      } catch { /* no speech */ }
    };

    // soundtrack: one clip spanning the whole cinematic, faded out with the picture; ducked under the ops TTS lines
    const trackDuck = ac.createGain(); trackDuck.gain.value = 1; trackDuck.connect(master);
    if (track) {
      const src = ac.createBufferSource(); src.buffer = track; const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, ac.currentTime); g.gain.linearRampToValueAtTime(0.8, ac.currentTime + 1.5);
      g.gain.setValueAtTime(0.8, ac.currentTime + MUSIC_END_T - 2.5); g.gain.linearRampToValueAtTime(0.0001, ac.currentTime + MUSIC_END_T - 0.2);
      src.connect(g).connect(trackDuck); src.start();
    }
    let ducked = false;
    const setDuck = (on: boolean) => { if (on === ducked) return; ducked = on; trackDuck.gain.cancelScheduledValues(ac.currentTime); trackDuck.gain.setTargetAtTime(on ? DUCK_GAIN : 1, ac.currentTime, on ? 0.12 : 0.45); };

    // ---- DOM refs ----
    const comm = $('.comm'), commCv = $('.comm canvas.cv') as unknown as HTMLCanvasElement, fade = $('.fade'), flash = $('.flash'), title = $('.title'), subEl = $('.sub'), whoEl = $('.sub .who'), txEl = $('.sub .tx'), rec = $('.rec'), slapEl = $('.slap');
    $('.loading').remove();
    const titleEls = BRIEFING.map(b => { const d = document.createElement('div'); d.className = b.cls; d.textContent = b.text; title.appendChild(d); return d; });

    // ---- Smith transmission window: the flipped portrait with a CRT look (scanlines in CSS, noise / jitter / slice glitches / RGB split here) ----
    const commImg = new Image(); let commReady = false; commImg.onload = () => { commReady = true; }; commImg.src = 'cinematic/smith_comm.jpg';
    const cctx = commCv.getContext('2d')!;
    let glitchT = 0, nextGlitch = 1.5;
    const drawComm = (time: number, dt: number) => {
      if (!commReady) return;
      const W = commCv.width, H = commCv.height;
      glitchT -= dt; nextGlitch -= dt;
      if (nextGlitch <= 0) { glitchT = 0.08 + Math.random() * 0.16; nextGlitch = 0.8 + Math.random() * 2.4; }
      const g = glitchT > 0;
      const jx = (Math.random() - 0.5) * (g ? 7 : 1.2), jy = (Math.random() - 0.5) * (g ? 3 : 0.8);
      cctx.globalCompositeOperation = 'source-over'; cctx.fillStyle = '#000'; cctx.fillRect(0, 0, W, H);
      cctx.filter = 'saturate(0.85) contrast(1.08) brightness(' + (0.92 + Math.sin(time * 23) * 0.03 + (g ? 0.1 : 0)) + ')';
      cctx.drawImage(commImg, jx, jy, W, H);
      cctx.filter = 'none';
      // slow rolling band + a few glitch slices shifted sideways
      const band = ((time * 0.18) % 1.2) * H - 0.1 * H;
      cctx.fillStyle = 'rgba(160,230,255,0.07)'; cctx.fillRect(0, band, W, H * 0.07);
      const slices = g ? 3 : (Math.random() < 0.06 ? 1 : 0);
      for (let i = 0; i < slices; i++) {
        const sy = Math.random() * H, sh = 4 + Math.random() * 18, dx = (Math.random() - 0.5) * 22;
        cctx.drawImage(commCv, 0, sy, W, sh, dx, sy, W, sh);
      }
      // RGB split on glitch frames
      if (g) {
        cctx.globalCompositeOperation = 'screen';
        cctx.fillStyle = 'rgba(255,0,60,0.10)'; cctx.fillRect(2, 0, W, H);
        cctx.fillStyle = 'rgba(0,200,255,0.10)'; cctx.fillRect(-2, 0, W, H);
        cctx.globalCompositeOperation = 'source-over';
      }
      // fuzzy static
      const n = g ? 900 : 260;
      for (let i = 0; i < n; i++) { cctx.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.13})`; cctx.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1); }
      commCv.style.transform = g ? `translate(${(Math.random() - 0.5) * 6}px,${(Math.random() - 0.5) * 3}px)` : '';
    };

    // ---- timeline state ----
    let t = 0, last = performance.now();
    let subIdx = -1, spoken = new Set<number>(), shown = new Set<number>(), slapsDone = 0;
    let screenSlapped = false, msgPlayed = false, shakeT = -9, shakeAmp = 0, lbOn = false, beep = false;
    const hitAt: number[] = victims.map(() => -1);
    const hitDir: THREE.Vector3[] = victims.map(() => new THREE.Vector3());
    const hitSide: number[] = victims.map((_, i) => (i % 2 ? 1 : -1));
    const smithPos = new THREE.Vector3().copy(smithStart);
    let smithYaw = 0, smithMode: 'run' | 'idle' | 'slap' = 'idle', smithSlapW = 0, smithSwing = -1;
    const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);

    // run segments: leave 0.35 s after the previous slap, arrive 0.4 s before the next one
    type Seg = { t0: number; t1: number; from: THREE.Vector3; to: THREE.Vector3 };
    const segs: Seg[] = [];
    {
      let from = smithStart, tPrev = 11.5;
      stops.forEach((s, i) => { segs.push({ t0: tPrev, t1: SLAP_TIMES[i]! - 0.42, from, to: s.p }); from = s.p; tPrev = SLAP_TIMES[i]! + 0.35; });
      segs.push({ t0: tPrev, t1: FINAL_FACE_T - 0.6, from, to: smithHome });
    }

    const shot = (a: THREE.Vector3, al: THREE.Vector3, b: THREE.Vector3, bl: THREE.Vector3, k: number) => {
      camPos.lerpVectors(a, b, k); camLook.lerpVectors(al, bl, k);
    };
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    const popSlap = (px: number, py: number, text = 'SLAP!') => {
      slapEl.textContent = text; slapEl.style.left = px + 'vw'; slapEl.style.top = py + 'vh'; slapEl.style.setProperty('--r', (Math.random() * 26 - 13) + 'deg');
      slapEl.classList.remove('go'); void slapEl.offsetWidth; slapEl.classList.add('go');
    };
    const bump = (amp: number) => { shakeT = t; shakeAmp = amp; };

    const frame = (now: number) => {
      if (!this.isActive) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      sky.update(t, camera);

      // ----- title card -----
      BRIEFING.forEach((b, i) => { if (t >= b.t) titleEls[i]!.classList.add('on'); });
      if (t > 7.6) titleEls.forEach(e => e.classList.remove('on'));
      const fadeA = t < 7.8 ? 0.94 : t < 9.6 ? lerp(0.94, 0, (t - 7.8) / 1.8) : t < ENDS_BLACK_T ? 0 : clamp01((t - ENDS_BLACK_T) / 1.2);
      fade.style.opacity = String(fadeA);
      if (!lbOn && t > 7.6) { lbOn = true; root.classList.add('lb'); }
      if (t > CARD_T + CARD_HOLD) { title.style.transition = `opacity ${CARD_FADE}s ease`; title.style.opacity = '0'; }
      if (t > CARD_T && !title.dataset.end) {
        title.dataset.end = '1'; titleEls.forEach(e => e.remove());
        for (const [cls, txt] of [['k', 'OBJECTIVE'], ['h', 'NEUTRALIZE THE THREAT'], ['p', 'Eliminate the target.']] as const) { const d = document.createElement('div'); d.className = cls; d.textContent = txt; title.appendChild(d); requestAnimationFrame(() => d.classList.add('on')); }
        (title.querySelector('.h') as HTMLElement).style.fontSize = '5vh';
      }

      // ----- Smith transmission window + music ducking -----
      comm.classList.toggle('on', t > 9.8 && t < FINAL_FACE_T + 8.5);
      if (t > 9.8) drawComm(t, dt);
      setDuck(LINES.some(l => l.voice && t >= l.t0 - 0.15 && t < l.t1 + 0.3));

      // ----- subtitles & voices -----
      const li = LINES.findIndex(l => t >= l.t0 && t < l.t1);
      if (li !== subIdx) {
        subIdx = li;
        if (li < 0) subEl.classList.remove('on');
        else {
          const l = LINES[li]!;
          whoEl.textContent = l.who; txEl.textContent = l.text; subEl.classList.add('on'); subEl.classList.toggle('tr', l.who.startsWith('INCOMING'));
          if (l.voice && !spoken.has(li)) { spoken.add(li); speak(l.text, l.voice); }
        }
      }
      if (t > 9.2 && !beep) { beep = true; blip(880); blip(1320, 0.12); }
      if (t > 17.0 && !shown.has(-1)) { shown.add(-1); rec.classList.add('on'); blip(660); blip(660, 0.14); blip(990, 0.28); alarm.intensity = 0; }
      if (t > 31.0) rec.classList.remove('on');
      if (t > 17.4 && !msgPlayed) { msgPlayed = true; if (smithMsg) playBuf(smithMsg, 1); }
      alarm.intensity = t > 17 && t < 31 ? 40 * (0.5 + 0.5 * Math.sin(t * 7)) : 0;

      // ----- Smith -----
      let seg: Seg | undefined = segs.find(s => t >= s.t0 && t < s.t1);
      let slapT = -1, slapIdx = -1;
      SLAP_TIMES.forEach((st, i) => { if (t >= st - 0.42 && t < st + 0.55) { slapT = st; slapIdx = i; } });
      if (seg) {
        const k = ease((t - seg.t0) / (seg.t1 - seg.t0)) * 0.35 + ((t - seg.t0) / (seg.t1 - seg.t0)) * 0.65;
        smithPos.lerpVectors(seg.from, seg.to, k);
        const d = tmp.subVectors(seg.to, seg.from).setY(0);
        if (d.lengthSq() > 1e-4) smithYaw = Math.atan2(d.x, d.z);
        const speed = d.length() / (seg.t1 - seg.t0);
        if (smithMode !== 'run') { smithMode = 'run'; play(smith, 'run', 0.15, 1); }
        smith.action!.setEffectiveTimeScale(clamp01(speed / 9) * 0.9 + 0.55);
      } else if (slapIdx >= 0) {
        const s = stops[slapIdx]!;
        smithPos.copy(s.p);
        const toV = dirOf(s.p, vBase[slapIdx]!);
        smithYaw = lerp(smithYaw, toV, 1 - Math.pow(0.0005, dt));
        if (smithMode !== 'slap') { smithMode = 'slap'; play(smith, 'idle', 0.1, 1.4); }
      } else if (t >= FINAL_FACE_T - 0.6) {
        smithPos.copy(smithHome);
        smithYaw = lerp(smithYaw, 0, 1 - Math.pow(0.003, dt));
        if (smithMode !== 'idle') { smithMode = 'idle'; play(smith, 'idle', 0.3, 0.8); }
      }
      // slap pose: wind-up (-0.42..-0.1), swing (-0.1..+0.08), recover
      let wind = 0, swing = -1;
      if (slapT > 0) {
        const e = t - slapT;
        wind = e < -0.1 ? ease((e + 0.42) / 0.32) : e < 0.1 ? 1 : 1 - ease((e - 0.1) / 0.4);
        swing = e < -0.1 ? 0 : e < 0.08 ? (e + 0.1) / 0.18 : 1;
      }
      const screenE = t - SCREEN_SLAP_T;
      if (t > FINAL_FACE_T && screenE > -0.5 && screenE < 0.7) {
        wind = screenE < -0.12 ? ease((screenE + 0.5) / 0.38) : screenE < 0.12 ? 1 : 1 - ease((screenE - 0.12) / 0.5);
        swing = screenE < -0.12 ? 0 : screenE < 0.1 ? (screenE + 0.12) / 0.22 : 1;
      }
      smithSlapW = wind; smithSwing = swing;
      smith.root.position.copy(smithPos); smith.root.rotation.y = smithYaw;
      smith.mixer.update(dt);
      smith.root.updateMatrixWorld(true);
      const headBone = smith.bones['Head'];
      const headQ = headBone ? headBone.getWorldQuaternion(new THREE.Quaternion()) : null; // head orientation before the slap pose is layered on
      if (smithSlapW > 0.001) {
        const fwd = tmp.set(0, 0, 1).applyAxisAngle(Y, smithYaw).clone();
        const sw = clamp01(smithSwing);
        const arm = smith.bones['RightArm']!, fore = smith.bones['RightForeArm']!, spine = smith.bones['Spine1']!;
        rotateBoneWorld(spine, Y, -(0.35 * smithSlapW - 0.7 * sw * smithSlapW));
        smith.root.updateMatrixWorld(true);
        rotateBoneWorld(arm, fwd, -smithSlapW * 1.45);                                 // raise the right arm out to the side
        rotateBoneWorld(arm, Y, lerp(-1.25, 0.85, ease(sw)) * smithSlapW);             // ...and sweep it across the body
        rotateBoneWorld(fore, Y, -0.35 * smithSlapW);
        // the torso swings, the head stays put: restore its pre-slap world orientation
        if (headBone && headQ) { smith.root.updateMatrixWorld(true); holdBoneWorldRotation(headBone, headQ); }
      }
      // hit events
      for (let i = 0; i < SLAP_TIMES.length; i++) {
        if (hitAt[i]! < 0 && t >= SLAP_TIMES[i]!) {
          hitAt[i] = t;
          hitDir[i]!.subVectors(vBase[i]!, stops[i]!.p).setY(0).normalize().applyAxisAngle(Y, hitSide[i]! * 0.7);
          play(victims[i]!, 'death', 0.05, 2.6, true);
          slapSound(0.9 + (i % 3) * 0.1); slapsDone++;
          popSlap(18 + ((i * 17) % 54), 22 + ((i * 11) % 26));
          bump(0.05 + 0.02 * (i % 3));
        }
      }
      if (slapIdx >= 0 && t > slapT - 0.4 && t < slapT - 0.38) whoosh();
      if (!screenSlapped && t >= SCREEN_SLAP_T) {
        screenSlapped = true; slapSound(1.4); popSlap(36, 30, 'SLAP!!'); bump(0.22);
        flash.style.transition = 'none'; flash.style.opacity = '0.85'; requestAnimationFrame(() => { flash.style.transition = 'opacity .5s'; flash.style.opacity = '0'; });
      }
      // victims
      for (let i = 0; i < victims.length; i++) {
        const v = victims[i]!, e = hitAt[i]! < 0 ? -1 : t - hitAt[i]!;
        v.mixer.update(dt);
        v.root.position.copy(vBase[i]!); v.root.rotation.y = vYaw[i]!; v.root.position.y = 0;
        if (e >= 0) {
          const k = ease(e / 0.75);
          v.root.position.addScaledVector(hitDir[i]!, 3.2 * k);
          v.root.position.y = Math.sin(clamp01(e / 0.75) * Math.PI) * 0.7;
          v.root.rotation.y = vYaw[i]! + hitSide[i]! * Math.PI * 2.2 * ease(e / 0.6);
        }
      }

      // ----- camera -----
      const sp = tmp.copy(smithPos);
      if (t < 9.6) shot(V(24, 11, 26), V(0, 9, 0), V(18, 8, 24), V(0, 8, 0), t / 9.6);
      else if (t < 17.4) shot(V(18, 8, 24), V(0, 8, 0), V(10, 3.2, 19), V(-2, 4.2, 0), ease((t - 9.6) / 7.8));
      else if (t < 21.2) shot(V(9, 3.2, 15), V(-3, 1.8, 2), V(5, 2.8, 12), V(-1, 1.9, 0), (t - 17.4) / 3.8);
      else if (t < FINAL_FACE_T - 0.4) {
        // chase-cam from front-left of Smith, pulling closer as the slaps speed up
        const off = V(-3.3, 2.3, 4.6).multiplyScalar(lerp(1.1, 0.8, clamp01((t - 21.2) / 9))).applyAxisAngle(Y, smithYaw); // 3/4 view from ahead of him, so his face shows
        const want = sp.clone().add(off), look = sp.clone().add(V(0, 1.7, 0));
        camPos.lerp(want, 1 - Math.pow(0.04, dt)); camLook.lerp(look, 1 - Math.pow(0.02, dt));
      } else {
        const k = clamp01((t - FINAL_FACE_T) / (SCREEN_SLAP_T - FINAL_FACE_T));
        shot(V(1.5, 2.3, 9), V(0.1, 1.85, 3.2), V(0.2, 2.2, 5.9), V(0.15, 2.0, 3.2), ease(k));
      }
      if (t < 21.2 || t >= FINAL_FACE_T - 0.4) { /* keyframed shots wrote camPos/camLook */ }
      const sh = shakeAmp * Math.exp(-(t - shakeT) * 9);
      camera.position.copy(camPos).add(tmp.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
      camera.lookAt(camLook);
      camera.rotation.z += (screenSlapped ? 1 : 0) * sh * 0.25;
      camera.fov = t > FINAL_FACE_T ? lerp(38, 30, clamp01((t - FINAL_FACE_T) / 8)) : 38; camera.updateProjectionMatrix();

      renderer.render(scene, camera);
      if (t >= END_T) { this.finish(); return; }
      this.raf = requestAnimationFrame(frame);
    };
    camPos.set(24, 13, 26); camLook.set(0, 2, 0);
    this.raf = requestAnimationFrame(frame);
  }
}

// -------------------------------------------------------------------------------------------------------------------------------
async function loadOptionalAudio(ac: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const r = await fetch(url);
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('audio')) return null;
    return await ac.decodeAudioData(await r.arrayBuffer());
  } catch { return null; }
}

function mulberry(a: number) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/** Sci-fi dusk sky: a gradient dome (indigo zenith -> violet -> magenta -> amber horizon) with a nebula, stars, a ringed gas giant and two moons. */
function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      varying vec3 vDir; uniform float uTime;
      float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<6;i++){ v+=a*noise(p); p=p*2.03+vec2(7.1,3.7); a*=.5; } return v; }
      vec3 stars(vec3 d){
        vec2 uv = vec2(atan(d.x,d.z)*6.0, d.y*12.0);
        vec3 c = vec3(0.);
        for(int k=0;k<3;k++){
          float sc = 18. + float(k)*22.; vec2 g = uv*sc*0.5; vec2 id=floor(g), f=fract(g)-.5;
          float r = h21(id+float(k)*31.7); vec2 o = vec2(h21(id+3.1),h21(id+8.7))-.5;
          float s = smoothstep(.09,.0,length(f-o*.6)) * step(.86,r);
          float tw = .65+.35*sin(uTime*(1.5+r*4.)+r*40.);
          c += s*tw*mix(vec3(.7,.8,1.),vec3(1.,.8,.7),h21(id+1.3))*(1.+float(k)*.4);
        }
        return c;
      }
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        // base gradient
        vec3 zen = vec3(.035,.035,.14), mid = vec3(.24,.10,.40), hot = vec3(.85,.25,.45), low = vec3(1.0,.62,.34);
        vec3 col = mix(low, hot, smoothstep(.0,.07,y));
        col = mix(col, mid, smoothstep(.05,.30,y));
        col = mix(col, zen, smoothstep(.25,.85,y));
        // sun glow near the key light direction
        vec3 sunDir = normalize(vec3(-.45,.05,-.89));
        float sd = max(dot(d,sunDir),0.);
        col += vec3(1.,.55,.25)*pow(sd,10.)*.32 + vec3(1.,.8,.5)*pow(sd,200.)*.9;
        float up = smoothstep(-.02,.45,y);
        // nebula clouds + a bright galactic band
        vec2 uv = vec2(atan(d.x,d.z)*1.2, y*2.6);
        float n1 = fbm(uv*1.6+uTime*.004), n2 = fbm(uv*3.4-n1*1.4+uTime*.006);
        float neb = smoothstep(.38,.85,n1*.7+n2*.55);
        vec3 nebCol = mix(vec3(.55,.12,.62), vec3(.12,.35,.85), noise(uv*1.1+4.));
        col += nebCol*neb*up*.75;
        float band = exp(-pow((y - .42 - .18*sin(atan(d.x,d.z)*.9))*3.4, 2.));
        col += vec3(.45,.30,.65)*band*fbm(uv*5.)*.5*up;
        // stars (fade near the bright horizon)
        col += stars(d)*smoothstep(.12,.45,y)*1.6;
        // ringed gas giant
        vec3 pc = normalize(vec3(-.78,.34,-.55)); vec3 q = d - pc*dot(d,pc);
        float pr = length(d-pc);
        // planet disc
        float disc = smoothstep(.215,.205,pr);
        vec3 pn = normalize((d-pc)/.21 - pc*sqrt(max(0.,1.-pow(pr/.21,2.)))); float lit = clamp(dot(pn, normalize(vec3(.65,.5,.55)))*.9+.28,.07,1.1);
        float bands = .5+.5*sin((d.y-pc.y)*90.+fbm(uv*14.)*3.);
        vec3 pcol = mix(vec3(.55,.28,.62), vec3(1.0,.68,.46), bands)*lit*1.15 + vec3(.5,.2,.7)*pow(1.-clamp(pr/.21,0.,1.),.0)*smoothstep(.15,.21,pr)*.25;
        col = mix(col, pcol, disc);
        // ring: ellipse around the planet
        vec2 rp = vec2((d.x-pc.x), (d.y-pc.y)/0.28);
        float rr = length(rp);
        float ring = smoothstep(.34,.33,rr)*smoothstep(.255,.265,rr)*(.55+.45*sin(rr*160.));
        float front = step(d.y, pc.y);
        col = mix(col, vec3(.9,.72,.65)*(.7+.3*lit), ring*.75*(1.-disc*(1.-front)));
        // two small moons
        for(int m=0;m<2;m++){
          vec3 mc = m==0 ? normalize(vec3(-.50,.50,-.72)) : normalize(vec3(-.95,.20,-.25));
          float mr = m==0 ? .045 : .028;
          float md = length(d-mc);
          float disk = smoothstep(mr,mr*.88,md);
          float shade = clamp(.5+ (d.x-mc.x)/mr*-.5, .1, 1.);
          col = mix(col, (m==0?vec3(.85,.8,.78):vec3(.6,.7,.9))*shade, disk);
          col += (m==0?vec3(.5,.35,.5):vec3(.2,.3,.5))*smoothstep(mr*3.,mr,md)*.18;
        }
        // thin aurora curtain
        float au = smoothstep(.0,.5,fbm(vec2(atan(d.x,d.z)*3.+uTime*.05, y*7.))) * smoothstep(.25,.5,y)*smoothstep(.8,.5,y);
        col += vec3(.1,.9,.6)*au*.10;
        // horizon haze
        col = mix(col, vec3(.95,.55,.40), smoothstep(.06,.0,y)*.55);
        col = pow(max(col, 0.), vec3(2.2)); // authored as display colours
        gl_FragColor = vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  return { mesh, update: (t: number, cam: THREE.Camera) => { mat.uniforms.uTime!.value = t; mesh.position.copy(cam.position); } };
}

function buildGround() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d')!; g.fillStyle = '#7b5b45'; g.fillRect(0, 0, 512, 512);
  const r = mulberry(7);
  for (let i = 0; i < 3500; i++) { const v = 70 + r() * 70; g.fillStyle = `rgba(${v + 40},${v + 12},${v - 10},${0.1 + r() * 0.2})`; g.fillRect(r() * 512, r() * 512, 1 + r() * 4, 1 + r() * 3); }
  const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(26, 26); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.CircleGeometry(150, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tx, roughness: 1 }));
  m.receiveShadow = true; return m;
}

/** Cheap procedural dressing so the outpost reads even before the building models stream in: landing pad, crates, rocks, a beacon mast. */
function buildOutpost() {
  const group = new THREE.Group(), r = mulberry(11);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(11, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x555a63, roughness: 0.85 }));
  pad.position.y = 0.02; pad.receiveShadow = true; group.add(pad);
  const ring = new THREE.Mesh(new THREE.RingGeometry(10.2, 10.6, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe9c24a }));
  ring.position.y = 0.04; group.add(ring);
  const crate = new THREE.MeshStandardMaterial({ color: 0x59636e, roughness: 0.7, metalness: 0.3 });
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, d = 13 + r() * 14, s = 0.9 + r() * 1.3;
    const b = new THREE.Mesh(new THREE.BoxGeometry(s * 1.4, s, s), crate); b.position.set(Math.cos(a) * d, s / 2, Math.sin(a) * d - 6); b.rotation.y = r() * 3; b.castShadow = b.receiveShadow = true; group.add(b);
  }
  // a few of the crates are mineral fields instead
  group.children.filter(c => (c as THREE.Mesh).geometry instanceof THREE.BoxGeometry && (c as THREE.Mesh).position.y > 0.4).slice(0, 4).forEach((c, i) => {
    group.remove(c);
    const cl = new THREE.Group();
    for (let k = 0; k < (i % 2 ? 2 : 3); k++) {
      const m = modelFactory.createMineralPatch();
      m.position.set((k - 1) * 1.7 + (k === 1 ? 0.4 : 0), 0, k === 1 ? 1.1 : -0.3); m.rotation.y = r() * 6; m.scale.setScalar(1.15 + r() * 0.35);
      cl.add(m);
    }
    cl.position.set(c.position.x, 0, c.position.z); cl.rotation.y = r() * 3;
    cl.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.add(cl);
  });
  const rock = new THREE.MeshStandardMaterial({ color: 0x6d5444, roughness: 1, flatShading: true });
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2, d = 18 + r() * 60, s = 0.6 + r() * 3.2;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rock); m.position.set(Math.cos(a) * d, s * 0.35, Math.sin(a) * d - 8); m.rotation.set(r() * 3, r() * 3, r() * 3); m.scale.y = 0.6; m.castShadow = m.receiveShadow = true; group.add(m);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 14, 8), new THREE.MeshStandardMaterial({ color: 0x8a929c, metalness: 0.6, roughness: 0.4 }));
  mast.position.set(-8, 7, -14); mast.castShadow = true; group.add(mast);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff3a2a })); lamp.position.set(-8, 14.2, -14); group.add(lamp);
  return { group };
}

/** The game's own Terran buildings as a backdrop (fitted to a target footprint, standing on the ground). */
async function loadSetPieces(scene: THREE.Scene) {
  const loader = new GLTFLoader();
  const items: { url: string; size: number; pos: [number, number, number]; yaw: number }[] = [
    { url: 'models/command_center.glb', size: 15, pos: [-3, 0, -36], yaw: 0 },
    { url: 'models/barracks.glb', size: 9, pos: [-24, 0, -20], yaw: 0.5 },
    { url: 'models/barracks.glb', size: 9, pos: [20, 0, -26], yaw: -0.4 },
    { url: 'models/bunker.glb', size: 7, pos: [14, 0, -10], yaw: -0.6 },
    { url: 'models/supply_depot_normal.glb', size: 5, pos: [-20, 0, 2], yaw: 0.3 },
    { url: 'models/supply_depot_normal.glb', size: 5, pos: [-17, 0, 9], yaw: 0.3 },
    { url: 'models/missile_turret.glb', size: 3.4, pos: [26, 0, -2], yaw: 0 }
  ];
  await Promise.all(items.map(async it => {
    const g = await loader.loadAsync(it.url), o = g.scene;
    const box = new THREE.Box3().setFromObject(o), sz = box.getSize(new THREE.Vector3());
    const k = it.size / Math.max(sz.x, sz.z);
    const wrap = new THREE.Group(); wrap.add(o); o.scale.multiplyScalar(k);
    box.setFromObject(o); o.position.y -= box.min.y; o.position.x -= (box.min.x + box.max.x) / 2; o.position.z -= (box.min.z + box.max.z) / 2;
    wrap.position.set(...it.pos); wrap.rotation.y = it.yaw;
    wrap.traverse(m => { if ((m as THREE.Mesh).isMesh) { m.castShadow = m.receiveShadow = true; m.frustumCulled = false; } });
    scene.add(wrap);
  }));
}
