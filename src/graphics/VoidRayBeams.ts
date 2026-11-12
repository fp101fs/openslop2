import * as THREE from 'three';

/**
 * SC2 Void Ray Prismatic Beam: one continuous beam per firing Void Ray, redrawn every frame from the ship to its target.
 *  - thin white-hot core, wrapped in a cyan glow and a faint blue haze (the "vapour fuzz")
 *  - electric arcs curl from the ship's three forward prong tips and converge on a bright focus just ahead of the nose,
 *    which is where the straight beam starts
 *  - crackling lightning hugs the beam (strongest near both ends) and a glowing splash sits on the target
 * The beam (and its looping sound) lives exactly as long as the Void Ray keeps attacking that target.
 */

const N_BEAM = 16;   // points along the main beam ribbons
const N_ARC = 10;    // points along each prong arc

/** Camera-facing ribbon through a list of points (a flat strip turned toward the camera at every point). */
class Ribbon {
  readonly mesh: THREE.Mesh;
  readonly pts: THREE.Vector3[];
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  width: number;
  /** Width multiplier per point (tapers). */
  taper: (f: number) => number = () => 1;

  constructor(n: number, mat: THREE.Material, width: number) {
    this.pts = Array.from({ length: n }, () => new THREE.Vector3());
    this.width = width;
    this.pos = new Float32Array(n * 2 * 3);
    const uv = new Float32Array(n * 2 * 2);
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      uv.set([u, 0, u, 1], i * 4);
      if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
  }

  private static t = new THREE.Vector3();
  private static side = new THREE.Vector3();
  private static view = new THREE.Vector3();

  /** Rebuild the strip from `pts`, turned to face `camPos`. */
  commit(camPos: THREE.Vector3 | null) {
    const n = this.pts.length, { t, side, view } = Ribbon;
    for (let i = 0; i < n; i++) {
      const p = this.pts[i]!;
      const a = this.pts[Math.max(0, i - 1)]!, b = this.pts[Math.min(n - 1, i + 1)]!;
      t.subVectors(b, a);
      if (camPos) view.subVectors(camPos, p); else view.set(0, 1, 0);
      side.crossVectors(t, view);
      if (side.lengthSq() < 1e-10) side.set(1, 0, 0);
      side.normalize().multiplyScalar(this.width * 0.5 * this.taper(i / (n - 1)));
      this.pos[i * 6] = p.x - side.x; this.pos[i * 6 + 1] = p.y - side.y; this.pos[i * 6 + 2] = p.z - side.z;
      this.pos[i * 6 + 3] = p.x + side.x; this.pos[i * 6 + 4] = p.y + side.y; this.pos[i * 6 + 5] = p.z + side.z;
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() { this.geo.dispose(); }
}

/** Soft cross-section texture: transparent edges, bright centre. `sharp` > 1 narrows the bright part. */
function bandTex(sharp: number): THREE.Texture {
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const g = c.getContext('2d')!;
  const img = g.createImageData(4, 64);
  for (let y = 0; y < 64; y++) {
    const d = Math.abs(y - 31.5) / 31.5;          // 0 centre .. 1 edge
    const a = Math.pow(Math.max(0, 1 - d), sharp);
    for (let x = 0; x < 4; x++) { const o = (y * 4 + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = Math.round(a * 255); }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}

/** Radial glow: white core fading through pale cyan to a blue rim. */
function glowTex(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.22, 'rgba(235,250,255,0.95)');
  grad.addColorStop(0.5, 'rgba(120,205,255,0.45)');
  grad.addColorStop(0.78, 'rgba(50,130,255,0.14)');
  grad.addColorStop(1, 'rgba(30,90,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const addMat = (map: THREE.Texture, color: number, opacity: number) => new THREE.MeshBasicMaterial({
  map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});

interface BeamFx {
  group: THREE.Group;
  haze: Ribbon; glow: Ribbon; core: Ribbon;
  bolts: Ribbon[];       // lightning hugging the beam
  arcs: Ribbon[];        // prong tips -> focus
  arcCores: Ribbon[];
  splash: Ribbon[];      // short crackles at the target
  focus: THREE.Sprite; focusHalo: THREE.Sprite; hit: THREE.Sprite; hitHalo: THREE.Sprite;
  seeds: number[];       // random offsets for the crackle, rerolled a few times a second
  reroll: number;
  phase: number;
}

export class VoidRayBeams {
  camera: THREE.Camera | null = null;
  private scene: THREE.Scene;
  private beams = new Map<string, BeamFx>();
  private lastUpdate = 0;
  private sound: any = null;

  private sharpTex = bandTex(2.2);
  private softTex = bandTex(1.2);
  private glowSprite = glowTex();
  private coreMat = addMat(this.sharpTex, 0xffffff, 1);
  private glowMat = addMat(this.softTex, 0x4cb8ff, 0.95);
  private hazeMat = new THREE.MeshBasicMaterial({ map: this.softTex, color: 0x3a86ff, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide });   // normal blend: stays blue on bright ground
  private boltMat = addMat(this.softTex, 0x7fd4ff, 0.6);
  private arcMat = addMat(this.softTex, 0x4fbcff, 1);
  private arcCoreMat = addMat(this.sharpTex, 0xe8fbff, 0.9);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    // Watchdog: if the world stops updating (pause, leaving the match) cut every beam and its loop at once
    if (typeof window !== 'undefined') window.setInterval(() => {
      if (this.beams.size && performance.now() - this.lastUpdate > 250) this.clear();
    }, 120);
  }

  /** Remove every beam and stop every beam loop. */
  clear() {
    for (const id of [...this.beams.keys()]) this.remove(id);
  }

  private remove(id: string) {
    const b = this.beams.get(id);
    if (!b) return;
    this.scene.remove(b.group);
    for (const r of [b.haze, b.glow, b.core, ...b.bolts, ...b.arcs, ...b.arcCores, ...b.splash]) r.dispose();
    for (const s of [b.focus, b.focusHalo, b.hit, b.hitHalo]) s.material.dispose();
    this.beams.delete(id);
    this.sound?.stopLoop('vr:' + id);
  }

  private create(): BeamFx {
    const group = new THREE.Group();
    const haze = new Ribbon(N_BEAM, this.hazeMat, 0.75);
    const glow = new Ribbon(N_BEAM, this.glowMat, 0.34);
    const core = new Ribbon(N_BEAM, this.coreMat, 0.085);
    const bolts = [0, 1].map(() => new Ribbon(N_BEAM, this.boltMat, 0.06));
    const arcs = [0, 1, 2].map(() => new Ribbon(N_ARC, this.arcMat, 0.14));
    const arcCores = [0, 1, 2].map(() => new Ribbon(N_ARC, this.arcCoreMat, 0.035));
    const splash = [0, 1, 2, 3].map(() => new Ribbon(6, this.boltMat, 0.05));
    // the beam swells slightly into the focus and the target splash
    const swell = (f: number) => 1 + 0.35 * Math.max(0, 1 - f * 8) + 0.25 * Math.max(0, (f - 0.9) * 10);
    haze.taper = glow.taper = swell;
    for (const r of [...arcs, ...arcCores]) r.taper = f => 0.35 + 0.65 * f;   // thin at the prong, fat at the focus
    for (const r of splash) r.taper = f => 1 - f;
    const sprite = (scale: number, color: number, opacity: number) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowSprite, color, transparent: true, opacity, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
      s.scale.setScalar(scale); s.renderOrder = 10; return s;
    };
    const focus = sprite(0.55, 0xffffff, 1), focusHalo = sprite(1.2, 0x58b8ff, 0.55);
    const hit = sprite(0.7, 0xffffff, 1), hitHalo = sprite(1.5, 0x58b8ff, 0.6);
    for (const r of [haze, glow, ...bolts, core, ...arcs, ...arcCores, ...splash]) group.add(r.mesh);
    group.add(focusHalo, focus, hitHalo, hit);
    this.scene.add(group);
    return { group, haze, glow, core, bolts, arcs, arcCores, splash, focus, focusHalo, hit, hitHalo, seeds: Array.from({ length: 64 }, () => Math.random() * 2 - 1), reroll: 0, phase: Math.random() * 10 };
  }

  /** Focus point (Ref_Weapon 01, just ahead of the nose) and the three forward prong tips, in world space. */
  private nodes(u: any) {
    const mesh: THREE.Object3D | null = u.mesh;
    let n = mesh?.userData.voidRayNodes as { focus: THREE.Object3D | null; prongs: THREE.Object3D[] } | undefined;
    if (mesh && !n) {
      let focus: THREE.Object3D | null = null; const prongs: THREE.Object3D[] = [];
      mesh.traverse(o => {
        if (!focus && /^Ref_Weapon[ _]?01/.test(o.name)) focus = o;
        if (/^Vol_Target[ _]?0[345]/.test(o.name)) prongs.push(o);
      });
      n = { focus, prongs };
      // a model that hasn't finished loading yet: look again next frame
      if (focus || mesh.userData.rigged) mesh.userData.voidRayNodes = n;
    }
    return n;
  }

  private static v = new THREE.Vector3();
  private static fwd = new THREE.Vector3();
  private static outw = new THREE.Vector3();
  private static ctl = new THREE.Vector3();

  /**
   * Redraw every firing Void Ray's beam and keep its loop sound in step.
   * A Void Ray is firing when it attacked this sim step (beamBeat), has dealt its first hit to that target (beamFired),
   * and the target is alive and still in range.
   */
  update(dt: number, units: any[], buildings: any[], gameTime: number, sound: any) {
    this.lastUpdate = performance.now();
    this.sound = sound;
    const live = new Set<string>();
    let byId: Map<string, any> | null = null;
    for (const u of units) {
      if (u.type !== 'void_ray' || u.isDead || !u.beamTargetId || !u.beamFired || gameTime - u.beamBeat > 0.03) continue;
      byId ??= new Map([...units, ...buildings].map(e => [e.id, e]));
      const t = byId.get(u.beamTargetId);
      if (!t || t.isDead) continue;
      const tr = t.radius ?? (t.size ? t.size * 0.5 : 0.4);
      if (Math.hypot(t.pos.x - u.pos.x, t.pos.y - u.pos.y) - tr > (u.attackRange ?? 6) + (u.rangeBonus ?? 0) + 0.8) continue;
      const visible = !!(u.mesh?.visible || t.mesh?.visible);
      if (!visible) continue;
      live.add(u.id);
      let b = this.beams.get(u.id);
      if (!b) { b = this.create(); this.beams.set(u.id, b); }
      this.draw(b, u, t, dt);
      sound?.setLoop('vr:' + u.id, 'void-ray-beam', u.pos.x, u.pos.y, 0.55);
    }
    for (const id of [...this.beams.keys()]) if (!live.has(id)) this.remove(id);
    // a loop whose beam vanished without remove() (e.g. a world reset) never outlives it
    if (sound?.loopIds) for (const id of sound.loopIds() as string[]) if (id.startsWith('vr:') && !this.beams.has(id.slice(3))) sound.stopLoop(id);
  }

  private draw(b: BeamFx, u: any, t: any, dt: number) {
    const { v, fwd, outw, ctl } = VoidRayBeams;
    b.phase += dt;
    b.reroll -= dt;
    if (b.reroll <= 0) { b.reroll = 0.045 + Math.random() * 0.035; for (let i = 0; i < b.seeds.length; i++) b.seeds[i] = Math.random() * 2 - 1; }
    const cam = this.camera ? (this.camera as any).position as THREE.Vector3 : null;

    // ship frame
    const rot = u.rotation ?? 0;
    fwd.set(Math.sin(rot), 0, Math.cos(rot));
    const shipY = (u.height ?? 0) + 0.95;
    const n = this.nodes(u);
    const F = new THREE.Vector3();
    if (n?.focus) { n.focus.getWorldPosition(F); F.addScaledVector(fwd, 0.18); }
    else F.set(u.pos.x, shipY, u.pos.y).addScaledVector(fwd, 1.35);

    // target point: chest height on units, pulled to the near face of a structure
    const tY = (t.height ?? 0) + (t.isFlying !== undefined ? (t.isFlying ? 0.95 : 0.75) : 1.2);
    const T = new THREE.Vector3(t.pos.x, tY, t.pos.y);
    if (t.isFlying === undefined) {
      const pull = Math.min((t.radius ?? (t.size ? t.size * 0.5 : 1)) * 0.55, Math.max(0, F.distanceTo(T) - 1));
      v.subVectors(F, T).setY(0).normalize(); T.addScaledVector(v, pull);
    }
    const dir = new THREE.Vector3().subVectors(T, F);
    const len = Math.max(0.01, dir.length());
    dir.divideScalar(len);
    // perpendiculars for the crackle offsets
    const p1 = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
    if (p1.lengthSq() < 1e-6) p1.set(1, 0, 0);
    p1.normalize();
    const p2 = new THREE.Vector3().crossVectors(dir, p1).normalize();

    // flicker: the beam breathes a little in width and brightness
    const fl = 0.9 + 0.1 * Math.sin(b.phase * 37) + 0.06 * Math.sin(b.phase * 91 + 1.3);
    b.core.width = 0.075 * (0.92 + 0.12 * Math.random());
    b.glow.width = 0.34 * fl;
    b.haze.width = 0.75 * (0.95 + 0.1 * Math.sin(b.phase * 13));

    // main straight beam
    for (let i = 0; i < N_BEAM; i++) {
      const f = i / (N_BEAM - 1);
      v.copy(F).addScaledVector(dir, len * f);
      b.core.pts[i]!.copy(v); b.glow.pts[i]!.copy(v);
      // the haze wobbles gently so the edge reads as vapour, not a tube
      b.haze.pts[i]!.copy(v).addScaledVector(p1, Math.sin(f * 9 + b.phase * 7) * 0.03);
    }
    b.core.commit(cam); b.glow.commit(cam); b.haze.commit(cam);

    // lightning hugging the beam: big kinks near both ends, almost straight in the middle
    b.bolts.forEach((r, k) => {
      for (let i = 0; i < N_BEAM; i++) {
        const f = i / (N_BEAM - 1);
        const env = (i === 0 || i === N_BEAM - 1) ? 0 : 0.025 + 0.11 * Math.pow(1 - f, 3) + 0.07 * Math.pow(f, 4);
        const s1 = b.seeds[(k * 32 + i * 2) % 64]!, s2 = b.seeds[(k * 32 + i * 2 + 1) % 64]!;
        r.pts[i]!.copy(F).addScaledVector(dir, len * f).addScaledVector(p1, s1 * env).addScaledVector(p2, s2 * env);
      }
      r.width = 0.035 + 0.025 * Math.random();
      r.commit(cam);
    });

    // prong arcs: from each prong tip, bow outward and forward, then curl into the focus
    const prongs = n?.prongs ?? [];
    b.arcs.forEach((r, k) => {
      const c = b.arcCores[k]!;
      const node = prongs[k];
      r.mesh.visible = c.mesh.visible = !!node;
      if (!node) return;
      const P = node.getWorldPosition(new THREE.Vector3());
      outw.subVectors(P, F); outw.addScaledVector(fwd, -outw.dot(fwd));   // sideways part of prong -> focus
      if (outw.lengthSq() < 1e-6) outw.set(0, 1, 0);
      outw.normalize();
      ctl.copy(P).lerp(F, 0.45).addScaledVector(outw, 0.45).addScaledVector(fwd, 0.3);
      for (let i = 0; i < N_ARC; i++) {
        const f = i / (N_ARC - 1), q = 1 - f;
        // quadratic Bezier P -> ctl -> F, plus a light electric jitter (none at the ends)
        v.set(q * q * P.x + 2 * q * f * ctl.x + f * f * F.x, q * q * P.y + 2 * q * f * ctl.y + f * f * F.y, q * q * P.z + 2 * q * f * ctl.z + f * f * F.z);
        const j = Math.sin(Math.PI * f) * 0.045;
        v.x += b.seeds[(k * 20 + i) % 64]! * j; v.y += b.seeds[(k * 20 + i + 7) % 64]! * j; v.z += b.seeds[(k * 20 + i + 13) % 64]! * j;
        r.pts[i]!.copy(v); c.pts[i]!.copy(v);
      }
      r.commit(cam); c.commit(cam);
    });

    // crackles fizzing off the impact point
    b.splash.forEach((r, k) => {
      const a = b.seeds[k * 5]! * Math.PI, e = b.seeds[k * 5 + 1]! * 0.8;
      const reach = 0.18 + 0.22 * Math.abs(b.seeds[k * 5 + 2]!);
      const d = new THREE.Vector3().copy(p1).multiplyScalar(Math.cos(a)).addScaledVector(p2, Math.sin(a)).addScaledVector(dir, -0.5 + e * 0.3).normalize();
      for (let i = 0; i < 6; i++) {
        const f = i / 5;
        r.pts[i]!.copy(T).addScaledVector(d, reach * f)
          .addScaledVector(p1, b.seeds[(k * 7 + i + 30) % 64]! * 0.06 * f).addScaledVector(p2, b.seeds[(k * 7 + i + 40) % 64]! * 0.06 * f);
      }
      r.commit(cam);
    });

    // glows
    b.focus.position.copy(F); b.focusHalo.position.copy(F);
    b.hit.position.copy(T); b.hitHalo.position.copy(T);
    b.focus.scale.setScalar(0.45 * (0.9 + 0.2 * Math.random()));
    b.focusHalo.scale.setScalar(1.0 * fl);
    b.hit.scale.setScalar(0.45 * (0.88 + 0.24 * Math.random()));
    b.hitHalo.scale.setScalar(1.05 * (0.92 + 0.12 * Math.sin(b.phase * 23)));
  }
}
