import * as THREE from 'three';
import { buildRigged, ensureRigged, RigInstance, RigKind } from '../graphics/RiggedModels';

/**
 * Live 3D "hero" render of any in-game unit model for the menu screens (campaign race select, co-op commanders, 1v1 backdrop).
 * One shared WebGL renderer with a transparent background draws the model with its idle animation, slowly swaying, into
 * whichever `.hero3d` element is currently on screen. `portrait()` renders small bust thumbnails for the commander grid.
 */

/** Per-model tweaks: yaw (radians, 0 = facing +X), zoom (>1 = closer), look (0..1 height the camera aims at). */
const TUNE: Partial<Record<RigKind, { yaw?: number; zoom?: number; look?: number }>> = {};

const idleClip = (rig: RigInstance): THREE.AnimationClip | undefined => {
  const c = rig.clips;
  if (c['stand']) return c['stand'];
  const k = Object.keys(c).find(n => /stand|idle/i.test(n));
  return k ? c[k] : Object.values(c)[0];
};

class UnitHeroImpl {
  private canvas = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1, 0.1, 400);
  private host: HTMLElement | null = null;
  private ro: ResizeObserver | null = null;
  private raf = 0;
  private clock = new THREE.Clock();
  private cur: { kind: RigKind; holder: THREE.Group; rig: RigInstance; h: number; w: number; t: number } | null = null;
  private lights = false;
  private want: { kind: RigKind; opts: { yaw?: number; zoom?: number } } | null = null;
  private portraitCache = new Map<string, string>();
  private figureCache = new Map<string, string>();
  private portraitQueue: Promise<void> = Promise.resolve();
  /** Live animated full-body figures (campaign hub): one shared offscreen renderer draws each into its own 2D canvas. */
  private figR: THREE.WebGLRenderer | null = null;
  private figs: { el: HTMLElement; kind: RigKind; yaw: number; cv: HTMLCanvasElement; scene: THREE.Scene; holder: THREE.Group; rig: RigInstance; cam: THREE.PerspectiveCamera; t: number }[] = [];
  private figRaf = 0;
  private figClock = new THREE.Clock();

  private ensureRenderer(): boolean {
    if (this.renderer) return true;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch { return false; }
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.35;
    r.setClearColor(0x000000, 0);
    this.canvas.className = 'unithero';
    this.addLights(this.scene);
    return true;
  }

  private addLights(sc: THREE.Scene) {
    sc.add(new THREE.HemisphereLight(0x8fb0ff, 0x2a2018, 1.5));
    const key = new THREE.DirectionalLight(0xffd8b0, 3.2); key.position.set(-6, 7, 8); sc.add(key);
    const rim = new THREE.DirectionalLight(0x5fa0ff, 3.0); rim.position.set(7, 4, -8); sc.add(rim);
    const fill = new THREE.DirectionalLight(0x9ab8ff, 0.9); fill.position.set(8, 1, 6); sc.add(fill);
    this.lights = true;
  }

  /** Show `kind` in `host` (replaces whatever the hero was showing). Safe to call after every menu re-render. */
  public show(host: HTMLElement, kind: RigKind, opts: { yaw?: number; zoom?: number } = {}) {
    if (!this.ensureRenderer()) return;
    this.host = host;
    host.appendChild(this.canvas);
    this.ro?.disconnect();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.want = { kind, opts };
    this.resize();
    void this.load(kind, opts);
    if (!this.raf) { this.clock.getDelta(); this.loop(); }
  }

  public hide() {
    this.host = null;
    this.ro?.disconnect(); this.ro = null;
    if (this.canvas.parentElement) this.canvas.parentElement.removeChild(this.canvas);
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.stopLiveFigures();
  }

  private async load(kind: RigKind, opts: { yaw?: number; zoom?: number }) {
    if (this.cur?.kind === kind) { this.cur.t = this.cur.t; return; }
    await ensureRigged(kind);
    if (this.want?.kind !== kind) return; // superseded while loading
    const holder = buildRigged(kind);
    if (!holder) return;
    if (this.cur) { this.scene.remove(this.cur.holder); }
    // static (clip-less) models such as the Ultralisk get an empty rig so the viewer treats them like any other
    const rig = (holder.userData.rigged as RigInstance | undefined) ?? { kind, holder, mixer: new THREE.AnimationMixer(holder), clips: {} };
    const clip = idleClip(rig);
    if (clip) { const a = rig.mixer.clipAction(clip); a.play(); a.time = Math.random() * clip.duration; }
    rig.mixer.update(0);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    this.scene.add(holder);
    this.cur = { kind, holder, rig, h: Math.max(0.5, size.y), w: Math.max(size.x, size.z), t: 0 };
    void opts;
    this.resize();
  }

  private resize() {
    if (!this.renderer || !this.host) return;
    const w = Math.max(2, this.host.clientWidth), h = Math.max(2, this.host.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.frame();
  }

  /** Aim / position the camera so the model fills the box. */
  private frame() {
    const c = this.cur; if (!c) return;
    const tune = TUNE[c.kind] ?? {};
    const zoom = (this.want?.opts.zoom ?? 1) * (tune.zoom ?? 1);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const needV = (c.h * 0.66) / Math.tan(fov / 2);
    const needH = (c.w * 0.7) / (Math.tan(fov / 2) * this.camera.aspect);
    const dist = Math.max(needV, needH) / zoom;
    const look = c.h * (tune.look ?? 0.5);
    this.camera.position.set(0, look + c.h * 0.08, dist);
    this.camera.lookAt(0, look, 0);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.renderer || !this.host || !this.host.isConnected) { if (this.host && !this.host.isConnected) this.hide(); return; }
    const dt = Math.min(0.05, this.clock.getDelta());
    const c = this.cur;
    if (c) {
      c.t += dt;
      c.rig.mixer.update(dt);
      const tune = TUNE[c.kind] ?? {};
      const base = (this.want?.opts.yaw ?? 0) + (tune.yaw ?? 0);
      // models face +X; turn them 3/4 towards the camera and let them sway slowly
      c.holder.rotation.y = -0.25 - base + Math.sin(c.t * 0.35) * 0.28;
    }
    this.renderer.render(this.scene, this.camera);
  };

  // ---------------------------------------------------------------------------------------------------------------
  /** Fill every `[data-pk]` element under `root` with its commander portrait (renders on demand, cached). */
  public fillPortraits(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>('[data-pk]').forEach(el => {
      const kind = el.dataset.pk as RigKind;
      const apply = (url: string) => { if (el.isConnected) { el.style.backgroundImage = `url(${url})`; el.classList.add('has'); } };
      const hit = this.portraitCache.get(kind);
      if (hit) apply(hit);
      else void this.portrait(kind).then(u => { if (u) apply(u); });
    });
  }

  /** Small bust render of a unit, as a data URL ('' if WebGL is unavailable). Rendered one at a time on a throw-away renderer. */
  public portrait(kind: RigKind): Promise<string> {
    const hit = this.portraitCache.get(kind);
    if (hit) return Promise.resolve(hit);
    const job = this.portraitQueue.then(async () => {
      if (this.portraitCache.has(kind)) return;
      await ensureRigged(kind);
      const holder = buildRigged(kind);
      if (!holder) return;
      let r: THREE.WebGLRenderer;
      try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch { return; }
      r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.35;
      r.setPixelRatio(1); r.setSize(192, 192, false); r.setClearColor(0, 0);
      const sc = new THREE.Scene(); this.addLights(sc);
      const rig = (holder.userData.rigged as RigInstance | undefined) ?? { kind, holder, mixer: new THREE.AnimationMixer(holder), clips: {} };
      const clip = idleClip(rig);
      if (clip) rig.mixer.clipAction(clip).play();
      rig.mixer.update(0.01);
      holder.rotation.y = -0.25;
      sc.add(holder); holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(holder);
      const size = box.getSize(new THREE.Vector3());
      // aim at the "head": upper part of the model, tight framing
      const span = Math.max(size.y * 0.62, Math.min(size.x, size.z) * 0.7);
      const cy = box.max.y - size.y * 0.3;
      const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 200);
      const dist = (span * 0.5) / Math.tan(THREE.MathUtils.degToRad(12));
      cam.position.set(0, cy + span * 0.05, dist); cam.lookAt(0, cy, 0);
      r.render(sc, cam);
      const url = r.domElement.toDataURL('image/png');
      this.portraitCache.set(kind, url);
      r.dispose(); r.forceContextLoss();
    }).catch(() => {});
    this.portraitQueue = job;
    return job.then(() => this.portraitCache.get(kind) ?? '');
  }

  /** Fill every `[data-fig]` element under `root` with a full-body render of that unit (static image, cached). */
  public fillFigures(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>('[data-fig]').forEach(el => {
      const kind = el.dataset.fig as RigKind;
      const yaw = el.dataset.yaw !== undefined ? Number(el.dataset.yaw) : -0.45;
      const apply = (url: string) => { if (el.isConnected && url) { el.style.backgroundImage = `url(${url})`; el.classList.add('has'); } };
      const hit = this.figureCache.get(`${kind}|${yaw}`);
      if (hit) apply(hit); else void this.figure(kind, yaw).then(apply);
      void this.liveFigure(el, kind, yaw);
    });
  }

  /** Swap a `[data-fig]` element's static image for a live, idle-animated render (the static image stays as the fallback). */
  private async liveFigure(el: HTMLElement, kind: RigKind, yaw: number) {
    if (this.figs.some(f => f.el === el)) return;
    await ensureRigged(kind);
    if (!el.isConnected || this.figs.some(f => f.el === el)) return;
    if (!this.figR) {
      try { this.figR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }); } catch { return; }
      const r = this.figR;
      r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.35;
      r.setPixelRatio(1); r.setClearColor(0, 0);
    }
    const holder = buildRigged(kind);
    if (!holder) return;
    const scene = new THREE.Scene(); this.addLights(scene);
    const rig = (holder.userData.rigged as RigInstance | undefined) ?? { kind, holder, mixer: new THREE.AnimationMixer(holder), clips: {} };
    const clip = idleClip(rig);
    const act = clip ? rig.mixer.clipAction(clip) : null;
    act?.play();
    rig.mixer.update(0.01);
    holder.rotation.y = yaw;
    scene.add(holder); holder.updateMatrixWorld(true);
    // frame on the clip's first frame exactly like figure(): feet just above the bottom edge, centred on the model.
    // (Framing at a random point of the clip made the figure's on-screen size change from load to load.)
    const W = 360, H = 560;
    const box = new THREE.Box3().setFromObject(holder);
    if (act && clip) { act.time = Math.random() * clip.duration; rig.mixer.update(0); }
    const size = box.getSize(new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(24, W / H, 0.1, 400);
    const fov = THREE.MathUtils.degToRad(24);
    const dist = Math.max((size.y * 0.55) / Math.tan(fov / 2), (Math.max(size.x, size.z) * 0.62) / (Math.tan(fov / 2) * cam.aspect));
    const visH = 2 * dist * Math.tan(fov / 2);
    const cy = box.min.y - visH * 0.03 + visH * 0.5;
    const cx = (box.min.x + box.max.x) / 2;
    cam.position.set(cx, cy, dist); cam.lookAt(cx, cy, 0);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.className = 'livefig';
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    el.appendChild(cv);
    this.figs.push({ el, kind, yaw, cv, scene, holder, rig, cam, t: Math.random() * 10 });
    if (!this.figRaf) { this.figClock.getDelta(); this.figLoop(); }
  }

  private figLoop = () => {
    this.figRaf = requestAnimationFrame(this.figLoop);
    this.figs = this.figs.filter(f => { if (f.el.isConnected) return true; f.cv.remove(); return false; });
    const r = this.figR;
    if (!r || !this.figs.length) { this.stopLiveFigures(); return; }
    const dt = Math.min(0.05, this.figClock.getDelta());
    r.setSize(360, 560, false);
    for (const f of this.figs) {
      f.t += dt;
      f.rig.mixer.update(dt);
      f.holder.rotation.y = f.yaw + Math.sin(f.t * 0.35) * 0.12; // gentle sway, like the single hero view
      r.render(f.scene, f.cam);
      const ctx = f.cv.getContext('2d');
      if (!ctx) continue;
      ctx.clearRect(0, 0, f.cv.width, f.cv.height);
      ctx.drawImage(r.domElement, 0, 0);
      if (f.el.style.backgroundImage) { f.el.style.backgroundImage = ''; f.el.classList.add('has'); }
    }
  };

  private stopLiveFigures() {
    cancelAnimationFrame(this.figRaf); this.figRaf = 0;
    this.figs.forEach(f => f.cv.remove());
    this.figs = [];
  }

  /** Full-body standing render (360x560) as a data URL; queued behind the portraits so only one throw-away renderer lives at a time. */
  public figure(kind: RigKind, yaw = -0.45): Promise<string> {
    const ck = `${kind}|${yaw}`;
    const hit = this.figureCache.get(ck);
    if (hit) return Promise.resolve(hit);
    const job = this.portraitQueue.then(async () => {
      if (this.figureCache.has(ck)) return;
      await ensureRigged(kind);
      const holder = buildRigged(kind);
      if (!holder) return;
      let r: THREE.WebGLRenderer;
      try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch { return; }
      r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.35;
      r.setPixelRatio(1); r.setSize(360, 560, false); r.setClearColor(0, 0);
      const sc = new THREE.Scene(); this.addLights(sc);
      const rig = (holder.userData.rigged as RigInstance | undefined) ?? { kind, holder, mixer: new THREE.AnimationMixer(holder), clips: {} };
      const clip = idleClip(rig);
      if (clip) rig.mixer.clipAction(clip).play();
      rig.mixer.update(0.01);
      holder.rotation.y = yaw;
      sc.add(holder); holder.updateMatrixWorld(true);
      // armed figures: keep the body facing the camera and swing the weapon in the hand so the muzzle points straight at the lens
      const gun = holder.getObjectByName('procedural_gun');
      if (gun?.parent) {
        const wq = gun.getWorldQuaternion(new THREE.Quaternion());
        const d = new THREE.Vector3(0, 0, 1).applyQuaternion(wq);
        const delta = new THREE.Quaternion().setFromUnitVectors(d, new THREE.Vector3(0, 0.08, 1).normalize());
        const pq = gun.parent.getWorldQuaternion(new THREE.Quaternion());
        gun.quaternion.copy(pq.invert().multiply(delta).multiply(wq));
        holder.updateMatrixWorld(true);
      }
      const box = new THREE.Box3().setFromObject(holder);
      const size = box.getSize(new THREE.Vector3());
      const cam = new THREE.PerspectiveCamera(24, 360 / 560, 0.1, 400);
      const fov = THREE.MathUtils.degToRad(24);
      const dist = Math.max((size.y * 0.55) / Math.tan(fov / 2), (Math.max(size.x, size.z) * 0.62) / (Math.tan(fov / 2) * cam.aspect));
      const visH = 2 * dist * Math.tan(fov / 2);
      const cy = box.min.y - visH * 0.03 + visH * 0.5; // feet sit just above the bottom edge so they stand on the pedestal
      const cx = (box.min.x + box.max.x) / 2; // centre on the model (a held rifle makes it lopsided)
      cam.position.set(cx, cy, dist); cam.lookAt(cx, cy, 0);
      r.render(sc, cam);
      this.figureCache.set(ck, r.domElement.toDataURL('image/png'));
      r.dispose(); r.forceContextLoss();
    }).catch(() => {});
    this.portraitQueue = job;
    return job.then(() => this.figureCache.get(ck) ?? '');
  }
}

export const UnitHero = new UnitHeroImpl();
