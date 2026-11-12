import * as THREE from 'three';
import { buildRigged, ensureRigged, RigInstance, type RigKind } from '../graphics/RiggedModels';
import { menu3dPaused } from './menu3d';

/**
 * Title-screen hero: one animated unit, picked at random per page load, lazy-loaded once the page is idle.
 * Nothing waits on it: menus stay clickable while it loads, and until it arrives (or if it fails / Save-Data is on)
 * the hero area just shows its CSS backdrop. Phones never mount it (MainMenu leaves the .hero element out).
 * The fade-in is a CSS opacity transition on the canvas, started after shaders are pre-compiled and the first frames
 * are drawn, so the model appears smoothly without a first-frame hitch.
 */
const HEROES: { kind: RigKind; race: string; name: string }[] = [
  { kind: 'roach', race: 'Zerg', name: 'Roach' },
  { kind: 'adept', race: 'Protoss', name: 'Adept' },
  { kind: 'thor', race: 'Terran', name: 'Thor' },
];
/** This page load's pick (MainMenu shows its race / name and model credit next to it). */
export const TITLE_HERO = HEROES[Math.floor(Math.random() * HEROES.length)]!;
const HERO_KIND = TITLE_HERO.kind;
const HERO_HEIGHT = 4.1; // world units; the camera sees ~6.3 units of height at the origin
const HERO_WIDTH = 3.6; // wide models are capped to this so they don't fill the whole frame
const HERO_ZOOM = 1.5; // extra enlargement, scaled from the feet so the model stays planted in the same spot
const HERO_MAX_H = 4.95; // tallest a zoomed model may get before its head leaves the top of the frame

class TitleHeroImpl {
  private host: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private raf = 0; private ro: ResizeObserver | null = null; private clock = new THREE.Clock();
  private unit: { group: THREE.Group; rig: RigInstance; t: number } | null = null;
  private loadState: 'idle' | 'scheduled' | 'loading' | 'done' = 'idle';
  private fadedIn = false;

  constructor() {
    this.scene.add(new THREE.HemisphereLight(0x8fb0ff, 0x2a2018, 1.5));
    const key = new THREE.DirectionalLight(0xffd8b0, 3.2); key.position.set(-6, 7, 8); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x5fa0ff, 3.0); rim.position.set(7, 4, -8); this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0x9ab8ff, 0.9); fill.position.set(8, 1, 6); this.scene.add(fill);
    this.camera.position.set(0, 1.2, 11); this.camera.lookAt(0, 0, 0);
  }

  mount(host: HTMLElement) {
    this.unmount();
    this.host = host;
    this.scheduleUnitLoad();
    if (this.unit) this.attach();
  }

  unmount() {
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.ro?.disconnect(); this.ro = null;
    this.renderer?.domElement.parentElement?.removeChild(this.renderer.domElement);
    this.host = null;
  }

  private ensureRenderer(): THREE.WebGLRenderer | null {
    if (this.renderer) return this.renderer;
    try { this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); } catch { return null; }
    const r = this.renderer;
    r.setClearColor(0, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.35;
    r.domElement.className = 'titlehero';
    r.domElement.style.opacity = '0';
    r.domElement.style.transition = 'opacity 1s ease-out';
    return r;
  }

  /** Put the canvas into the current host and start drawing (only once the model is ready). */
  private attach() {
    const host = this.host, r = this.renderer;
    if (!host || !host.isConnected || !r || this.raf) return;
    host.appendChild(r.domElement);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host); this.resize();
    this.clock.getDelta();
    let frames = 0;
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (!this.host?.isConnected) { this.unmount(); return; }
      if (menu3dPaused()) { this.clock.getDelta(); return; } // start modal up: no drawing
      this.tickUnit(Math.min(0.05, this.clock.getDelta()));
      r.render(this.scene, this.camera);
      // start the fade once a couple of frames are drawn (textures uploaded), so the transition itself runs smoothly
      if (!this.fadedIn && ++frames === 2) { this.fadedIn = true; r.domElement.style.opacity = '1'; }
      if (this.fadedIn) host.classList.add('ready'); // fades in the name / credit labels (CSS)
    };
    loop();
  }

  /** Start the download once the browser is idle, so it never competes with the first paint or menu clicks. */
  private scheduleUnitLoad() {
    if (this.loadState !== 'idle') return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return; // users who asked to save data get the plain backdrop
    this.loadState = 'scheduled';
    const start = () => { void this.loadUnit(); };
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    // short delay first so the menu's own first paint and any quick click-through go first
    setTimeout(() => { if (ric) ric(start, { timeout: 3000 }); else setTimeout(start, 200); }, 600);
  }

  private async loadUnit() {
    this.loadState = 'loading';
    await ensureRigged(HERO_KIND);
    const holder = buildRigged(HERO_KIND);
    const r = holder && this.ensureRenderer();
    if (!holder || !r) { this.loadState = 'done'; return; } // load failed / no WebGL: keep the plain backdrop
    const rig = (holder.userData.rigged as RigInstance | undefined) ?? { kind: HERO_KIND, holder, mixer: new THREE.AnimationMixer(holder), clips: {} };
    const clip = rig.clips['stand'] ?? Object.entries(rig.clips).find(([n]) => /stand|idle/i.test(n))?.[1];
    if (clip) rig.mixer.clipAction(clip).play();
    rig.mixer.update(0);
    // scale to fit and centre it in the frame
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
    holder.position.set(-centre.x, -box.min.y, -centre.z);
    const inner = new THREE.Group(); inner.add(holder);
    inner.scale.setScalar(Math.min(HERO_ZOOM * Math.min(HERO_HEIGHT / Math.max(0.01, size.y), HERO_WIDTH / Math.max(0.01, size.x, size.z)), HERO_MAX_H / Math.max(0.01, size.y)));
    const group = new THREE.Group(); group.add(inner); group.position.y = -HERO_HEIGHT * 0.5;
    this.scene.add(group);
    // compile shaders ahead of time (in parallel where supported) so the first visible frame doesn't stall
    try { await r.compileAsync(this.scene, this.camera); } catch { /* falls back to compiling on first render */ }
    this.unit = { group, rig, t: 0 };
    this.loadState = 'done';
    this.attach(); // no-op if the user already left the title screen; mount() attaches next time
  }

  private tickUnit(dt: number) {
    const u = this.unit;
    if (!u) return;
    u.t += dt;
    u.rig.mixer.update(dt);
    // models face +X: turn 3/4 towards the camera (left of screen) with a slow sway, like the other menu heroes
    u.group.rotation.y = -0.25 + Math.sin(u.t * 0.35) * 0.28;
  }

  private resize() {
    if (!this.renderer || !this.host) return;
    const w = Math.max(2, this.host.clientWidth), h = Math.max(2, this.host.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
}
export const TitleHero = new TitleHeroImpl();
