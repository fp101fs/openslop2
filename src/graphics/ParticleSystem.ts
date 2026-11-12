import * as THREE from 'three';
import { Vector3D } from '../types';
import { VoidRayBeams } from './VoidRayBeams';
import { FireSmokeFX } from './FireSmoke';
import { ProceduralGrassSystem } from './ProceduralGrass';

interface Projectile {
  mesh: THREE.Object3D;
  start: THREE.Vector3;
  target: THREE.Vector3;
  targetEntityId?: string;
  targetEntityRef?: any;
  isHoming?: boolean;
  speed: number;
  progress: number;
  isArc: boolean;
  damage: number;
  bonusArmored?: number;
  splashRadius?: number;
  attackerId: string;
  /** Visual style: leaves a trail of mist / droplets / worm segments behind the projectile. */
  trail?: 'roach' | 'muta';
  segs?: THREE.Mesh[];
  /** Rocket flight: parabolic arc (fraction of range) plus a decaying sideways / vertical weave, steered toward the live target. */
  rocket?: { arc: number; weave: number; freq: number; phase: number; side: THREE.Vector3; spin: number; straight?: boolean; smokeAcc?: number };
  /** Seconds before it launches (hidden until then): staggers the tracers of a burst. */
  delay?: number;
  /** Skip the muzzle flash when a delayed shot launches. */
  noFlash?: boolean;
  /** Glow sprite that follows the projectile (Punisher shell). */
  glow?: THREE.Sprite;
  onHit: (pos: THREE.Vector3, targetEntityId?: string) => void;
}

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  fade: boolean;
  shrink: boolean;
  ping?: boolean;
  buoyant?: boolean;
  baseScale?: number;
  grow?: boolean;
  /** Soft billboard smoke puff: grows from s0 to s1 and fades from o0 to 0 over its life (owns its material). */
  smoke?: { s0: number; s1: number; o0: number; spin: number; instant?: boolean };
}

interface Beam {
  line: THREE.Line;
  sourcePos: THREE.Vector3;
  targetPos: THREE.Vector3;
  life: number;
}

const ratio0 = (pt: Particle) => Math.max(0, pt.life / pt.maxLife);

export class ParticleSystem {
  private scene: THREE.Scene;
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private beams: Beam[] = [];
  private sound?: any;

  // Shared reusable geometries and materials (Zero runtime WebGL VBO / shader allocations)
  private sparkGeo = new THREE.SphereGeometry(0.08, 4, 4);
  private smokeGeo = new THREE.SphereGeometry(0.2, 6, 6);
  private flashGeo = new THREE.SphereGeometry(1.0, 6, 6);
  private marineTracerGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6).rotateX(Math.PI / 2);
  private heavyTracerGeo = new THREE.CylinderGeometry(0.14, 0.14, 2.0, 6).rotateX(Math.PI / 2);
  private marauderShellGeo = new THREE.SphereGeometry(0.28, 8, 8);
  private siegeShellGeo = new THREE.SphereGeometry(0.44, 10, 10);
  /**
   * Hydralisk needle spine (~0.5 long next to the 1.8-tall Hydralisk): a slender needle pointing along +Z, dark chitin at
   * the back shading to a hot yellow point at the front (vertex colours), plus an additive glow sheath and a faint streak.
   */
  private hydraSpineGeo = (() => {
    const L = 0.5, pts: THREE.Vector2[] = [];
    const prof: [number, number][] = [[0, 0], [0.012, 0.06], [0.022, 0.22], [0.026, 0.42], [0.022, 0.6], [0.014, 0.8], [0.006, 0.93], [0, 1]];
    for (const [r, t] of prof) pts.push(new THREE.Vector2(r, (t - 0.5) * L));
    const g = new THREE.LatheGeometry(pts, 6).rotateX(Math.PI / 2);
    const pos = g.attributes.position!, col = new Float32Array(pos.count * 3);
    const back = new THREE.Color(0x2b2117), mid = new THREE.Color(0x7a5a24), hot = new THREE.Color(0xffc93a), tip = new THREE.Color(0xfff4c0), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getZ(i) / L + 0.5;
      if (t < 0.45) c.lerpColors(back, mid, t / 0.45);
      else if (t < 0.75) c.lerpColors(mid, hot, (t - 0.45) / 0.3);
      else c.lerpColors(hot, tip, (t - 0.75) / 0.25);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  })();
  /** Glow sheath over the front half of the spine. */
  private hydraSpineGlowGeo = new THREE.ConeGeometry(0.034, 0.3, 6).rotateX(Math.PI / 2).translate(0, 0, 0.12);
  /** Faint motion streak trailing back from the point. */
  private hydraSpineStreakGeo = new THREE.ConeGeometry(0.02, 0.85, 5).rotateX(-Math.PI / 2).translate(0, 0, -0.2);
  private wraithLaserGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.8, 6).rotateX(Math.PI / 2);
  private missileBodyGeo = new THREE.CylinderGeometry(0.09, 0.12, 0.9, 6).rotateX(Math.PI / 2);
  private missilePlumeGeo = new THREE.SphereGeometry(0.16, 6, 6);
  private rocketNoseGeo = new THREE.ConeGeometry(0.1, 0.28, 6).rotateX(Math.PI / 2);
  private rocketNoseMat = new THREE.MeshBasicMaterial({ color: 0xd8dde4 });
  private rocketFlameGeo = new THREE.ConeGeometry(0.11, 0.55, 6).rotateX(-Math.PI / 2);
  private rocketFlameMat = new THREE.MeshBasicMaterial({ color: 0xffb040 });
  private rocketFinGeo = new THREE.BoxGeometry(0.02, 0.3, 0.22);
  private bansheeRocketGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.8, 6).rotateX(Math.PI / 2);
  private mutaliskGlaiveGeo = new THREE.TorusGeometry(0.2, 0.06, 6, 10);
  private pingGeo = new THREE.RingGeometry(0.42, 0.52, 28).rotateX(-Math.PI / 2);
  private shockwaveGeo = new THREE.RingGeometry(0.3, 0.7, 24).rotateX(-Math.PI / 2);

  private sparkMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
  private stimMat = new THREE.MeshBasicMaterial({ color: 0xff1144, transparent: true, opacity: 0.7 });
  private healMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
  private marineTracerMat = new THREE.MeshBasicMaterial({ color: 0xfff066 });
  private heavyTracerMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  private marauderShellMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
  private siegeShellMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
  private hydraSpineMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  private hydraSpineGlowMat = new THREE.MeshBasicMaterial({ color: 0xffb21e, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  private hydraSpineStreakMat = new THREE.MeshBasicMaterial({ color: 0xd8a040, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
  private hydraSparkMat = new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  private wraithLaserMat = new THREE.MeshBasicMaterial({ color: 0xff3355 });
  private smokeTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 31);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.4)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  private impactTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 31);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.45, 'rgba(255,252,240,0.95)'); grad.addColorStop(0.75, 'rgba(255,190,100,0.6)'); grad.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  /** Small white circular impact burst that pops open and fades. */
  private spawnImpactFlash(pos: THREE.Vector3) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.impactTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    sp.position.copy(pos); sp.scale.setScalar(0.25); sp.renderOrder = 10;
    this.scene.add(sp);
    this.particles.push({ mesh: sp as unknown as THREE.Mesh, velocity: new THREE.Vector3(), life: 0.28, maxLife: 0.28, fade: false, shrink: false, buoyant: true, smoke: { s0: 0.25, s1: 0.9, o0: 1, spin: 0 } });
  }
  private flareTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 31);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.3, 'rgba(255,250,215,0.95)'); grad.addColorStop(0.65, 'rgba(255,225,120,0.4)'); grad.addColorStop(1, 'rgba(255,200,80,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  private missileBodyMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
  private missilePlumeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  private bansheeRocketMat = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
  private mutaliskGlaiveMat = new THREE.MeshBasicMaterial({ color: 0xd946ef });
  // Zerg projectile looks (SC2): roach = stream of green vapour, hydra = spurt of pale green liquid, mutalisk = glaive wurm
  private mistGeo = new THREE.SphereGeometry(0.2, 7, 6);
  private dropGeo = new THREE.SphereGeometry(0.1, 6, 5);
  private globGeo = new THREE.SphereGeometry(0.16, 8, 6);
  private wormHeadGeo = new THREE.SphereGeometry(0.2, 8, 6);
  private wormSegGeo = new THREE.SphereGeometry(0.15, 7, 6);
  // Roach acid saliva: saturated toxic yellow-green (core glob brighter than the vapour it sheds)
  private roachMistMat = new THREE.MeshBasicMaterial({ color: 0x5fc21a, transparent: true, opacity: 0.45, depthWrite: false });
  private roachMistCoreMat = new THREE.MeshBasicMaterial({ color: 0xc4f53a, transparent: true, opacity: 0.8, depthWrite: false });
  private roachAcidDropMat = new THREE.MeshBasicMaterial({ color: 0xa8ec22, transparent: true, opacity: 0.9, depthWrite: false });
  private wormHeadMat = new THREE.MeshBasicMaterial({ color: 0xc8e84a });
  private wormSegMat = new THREE.MeshBasicMaterial({ color: 0x86b830 });
  private shockwaveMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide
  });
  private beamMat = new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 2 });
  private colorMatCache: Map<number, THREE.MeshBasicMaterial> = new Map();
  private readonly _prevPos = new THREE.Vector3();

  private getColorMat(color: number): THREE.MeshBasicMaterial {
    let mat = this.colorMatCache.get(color);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color });
      this.colorMatCache.set(color, mat);
    }
    return mat;
  }

  /** Continuous Void Ray beams (updated by GameWorld after the units). */
  public readonly voidBeams: VoidRayBeams;
  /** GPU fire and smoke (flames, fireballs, embers, smoke columns, wisps). */
  public readonly fx: FireSmokeFX;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.voidBeams = new VoidRayBeams(scene);
    this.fx = new FireSmokeFX(scene);
  }

  public setSound(sound: any) {
    this.sound = sound;
  }

  // Brilliant Muzzle Flash at weapon barrel (uses shared geometry & cached material)
  public spawnMuzzleFlash(pos: Vector3D, color: number = 0xffffaa, scale: number = 0.35) {
    const flashMesh = new THREE.Mesh(this.flashGeo, this.getColorMat(color));
    flashMesh.position.set(pos.x, pos.y, pos.z);
    flashMesh.scale.setScalar(scale);
    this.scene.add(flashMesh);

    this.particles.push({
      mesh: flashMesh,
      velocity: new THREE.Vector3(0, 0, 0),
      life: 0.08,
      maxLife: 0.08,
      fade: false,
      shrink: true
    });
  }

  /** Soft puffy teardrop muzzle flash (hot white core, orange body, smoke-like tail), drawn once; the blob is at u=0 (the muzzle), the plume trails to u=1. */
  private flashTex: THREE.CanvasTexture | null = null;
  private getFlashTex(): THREE.CanvasTexture {
    if (this.flashTex) return this.flashTex;
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d')!;
    const blob = (x: number, y: number, r: number, a: number) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,250,215,${a})`); gr.addColorStop(0.35, `rgba(255,205,120,${a * 0.85})`);
      gr.addColorStop(0.7, `rgba(225,130,50,${a * 0.45})`); gr.addColorStop(1, 'rgba(190,90,30,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    // plume first (behind), then the bright head on top
    for (let i = 0; i < 16; i++) { const t = i / 15; blob(70 + t * 160 + (Math.random() - 0.5) * 8, 64 + (Math.random() - 0.5) * 16 * (1 - t * 0.4), 34 - t * 18, 0.5 - t * 0.3); }
    blob(66, 64, 58, 0.95); blob(60, 64, 30, 1);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; this.flashTex = tex; return tex;
  }
  private flashMat: THREE.MeshBasicMaterial | null = null;
  private flashGeoDir: THREE.PlaneGeometry | null = null;
  private flashes: { obj: THREE.Group; life: number; maxLife: number }[] = [];

  /** Directional muzzle flash at `from`, pointing at `to`: two crossed planes along the fire axis so it reads from any camera angle. Total length ~ `len` world units. */
  public spawnMuzzleFlashDir(from: Vector3D, to: Vector3D, len = 0.78) {
    if (!this.flashMat) this.flashMat = new THREE.MeshBasicMaterial({ map: this.getFlashTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    if (!this.flashGeoDir) { const g = new THREE.PlaneGeometry(1, 0.6); g.rotateY(-Math.PI / 2); g.translate(0, 0, 0.5); this.flashGeoDir = g; }
    const grp = new THREE.Group();
    const a = new THREE.Mesh(this.flashGeoDir, this.flashMat); const b = new THREE.Mesh(this.flashGeoDir, this.flashMat); b.rotation.z = Math.PI / 2;
    grp.add(a, b);
    grp.position.set(from.x, from.y, from.z);
    grp.lookAt(to.x, to.y, to.z);
    grp.rotateZ(Math.random() * Math.PI);
    const k = len * (0.88 + Math.random() * 0.24);
    grp.scale.set(k, k, k);
    this.scene.add(grp);
    this.flashes.push({ obj: grp, life: 0.07, maxLife: 0.07 });
  }

  /** Bullet weapons (Marine, Ghost, Goliath guns): just a muzzle flash at the gun tip and no projectile; the hit lands at once. */
  public spawnBulletFlash(from: Vector3D, to: Vector3D, onHit: () => void) {
    this.spawnMuzzleFlashDir(from, to);
    const t = new THREE.Vector3(to.x, to.y, to.z);
    this.sound?.at(t.x, t.z).playProjectileImpact('bullet');
    onHit();
  }

  // Spawn heavy high-caliber tracer (Solaris Immortal)
  public spawnHeavyTracer(from: Vector3D, to: Vector3D, onHit: () => void) {
    this.spawnMuzzleFlash(from, 0x38bdf8, 0.48);
    this.sound?.at(from.x, from.z).playBulletWhiz();

    const mesh = new THREE.Mesh(this.heavyTracerGeo, this.heavyTracerMat);
    mesh.position.set(from.x, from.y, from.z);
    mesh.lookAt(to.x, to.y, to.z);
    this.scene.add(mesh);

    const start = new THREE.Vector3(from.x, from.y, from.z);
    const target = new THREE.Vector3(to.x, to.y, to.z);

    this.projectiles.push({
      mesh,
      start,
      target,
      speed: 48,
      progress: 0,
      isArc: false,
      damage: 0,
      attackerId: '',
      onHit: () => {
        this.spawnImpactSparks(target, 0x38bdf8);
        this.sound?.at(target.x, target.z).playProjectileImpact('shell');
        onHit();
      }
    });
  }

  // Spawn Marauder High-Explosive Punisher Grenade (an arcing lobbed shell, not a rocket)
  public spawnMarauderShell(from: Vector3D, to: Vector3D, targetId: string | undefined, onHit: (pos: THREE.Vector3) => void, boom = 0.85) {
    this.fx.launchPuff(from.x, from.y, from.z, { x: to.x - from.x, y: 0, z: to.z - from.z }, 0.6);
    this.sound?.at(from.x, from.z).playRocketWhoosh();

    const mesh = new THREE.Mesh(this.marauderShellGeo, this.marauderShellMat);
    mesh.position.set(from.x, from.y, from.z);
    this.scene.add(mesh);

    const start = new THREE.Vector3(from.x, from.y, from.z);
    const target = new THREE.Vector3(to.x, to.y, to.z);

    this.projectiles.push({
      mesh,
      start,
      target,
      targetEntityId: targetId,
      speed: 24,
      progress: 0,
      isArc: true,
      damage: 0,
      attackerId: '',
      onHit: (pos) => {
        this.impactBlast(pos, boom);
        this.sound?.at(pos.x, pos.z).playProjectileImpact('shell');
        onHit(pos);
      }
    });
  }

  /** Siege Tank (both modes): in SC2 the cannon is an instant hit, so just a muzzle flash and an impact burst, no flying shell. */
  public spawnTankShot(from: Vector3D, to: Vector3D, sieged: boolean, onHit: (pos: THREE.Vector3) => void) {
    this.cannonBlast(from, to, sieged ? 1.0 : 0.6);
    const pos = new THREE.Vector3(to.x, to.y, to.z);
    if (sieged) this.spawnShockwave(pos);
    this.impactBlast(pos, sieged ? 1.9 : 0.95);
    this.sound?.at(pos.x, pos.z).playProjectileImpact('shell');
    onHit(pos);
  }

  // Spawn Siege Tank Devastating 120mm Shock Cannon Shell
  public spawnSiegeShell(from: Vector3D, to: Vector3D, onHit: (pos: THREE.Vector3) => void) {
    this.cannonBlast(from, to, 0.9);
    this.sound?.at(from.x, from.z).playArtilleryWhistle();

    const mesh = new THREE.Mesh(this.siegeShellGeo, this.siegeShellMat);
    mesh.position.set(from.x, from.y, from.z);
    this.scene.add(mesh);

    const start = new THREE.Vector3(from.x, from.y, from.z);
    const target = new THREE.Vector3(to.x, to.y, to.z);

    this.projectiles.push({
      mesh,
      start,
      target,
      speed: 28,
      progress: 0,
      isArc: true,
      damage: 0,
      attackerId: '',
      onHit: (pos) => {
        this.spawnShockwave(pos);
        this.impactBlast(pos, 1.9);
        this.sound?.at(pos.x, pos.z).playProjectileImpact('shell');
        onHit(pos);
      }
    });
  }

  // Roach acid: a fast, nearly flat spit that leaves a stream of green vapour; splashes into a green mist cloud on impact
  public spawnRoachAcid(from: Vector3D, to: Vector3D, onHit: () => void) {
    this.spawnMuzzleFlash(from, 0x9fe830, 0.3);
    const mesh = new THREE.Mesh(this.globGeo, this.roachMistCoreMat);
    mesh.position.set(from.x, from.y, from.z);
    mesh.scale.set(1, 1, 1.9);
    mesh.lookAt(to.x, to.y, to.z);
    this.scene.add(mesh);
    const start = new THREE.Vector3(from.x, from.y, from.z);
    const target = new THREE.Vector3(to.x, to.y, to.z);
    this.projectiles.push({
      mesh, start, target, speed: 26, progress: 0, isArc: false, damage: 0, attackerId: '', trail: 'roach',
      onHit: () => {
        for (let k = 0; k < 7; k++) this.puff(target, this.mistGeo, k % 2 ? this.roachMistMat : this.roachMistCoreMat, 0.5, 0.2 + Math.random() * 0.25, 0.9);
        for (let k = 0; k < 5; k++) this.puff(target, this.dropGeo, this.roachAcidDropMat, 0.4, 0.9 + Math.random() * 0.5, 1.4);
        this.sound?.at(target.x, target.z).playProjectileImpact('acid');
        onHit();
      }
    });
  }

  /**
   * Hydralisk Needle Spines (SC2): a quick pair of slender needles, dark at the back with a glowing yellow point, flying
   * nearly flat on slightly offset lines. The first spine to land deals the hit; each lands with a tiny spark burst.
   */
  public spawnHydraliskSpine(from: Vector3D, to: Vector3D, onHit: () => void) {
    const dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz) || 1;
    const sx = -dz / len, sz = dx / len;
    for (let k = 0; k < 2; k++) {
      const side = (k ? 0.07 : -0.05) + (Math.random() - 0.5) * 0.04;
      const start = new THREE.Vector3(from.x + sx * side, from.y + (Math.random() - 0.5) * 0.05, from.z + sz * side);
      const j = k ? 0.18 : 0.06;
      const target = new THREE.Vector3(to.x + sx * side + (Math.random() - 0.5) * j, to.y + (Math.random() - 0.5) * j, to.z + sz * side + (Math.random() - 0.5) * j);
      const mesh = new THREE.Mesh(this.hydraSpineGeo, this.hydraSpineMat);
      mesh.add(new THREE.Mesh(this.hydraSpineGlowGeo, this.hydraSpineGlowMat), new THREE.Mesh(this.hydraSpineStreakGeo, this.hydraSpineStreakMat));
      mesh.position.copy(start); mesh.lookAt(target);
      this.scene.add(mesh);
      this.projectiles.push({
        mesh, start, target, speed: 26, progress: 0, isArc: false, damage: 0, attackerId: '',
        delay: k ? 0.07 : undefined, noFlash: true,
        onHit: () => {
          for (let n = 0; n < 3; n++) this.puff(target, this.dropGeo, this.hydraSparkMat, 0.16, 0.22 + Math.random() * 0.12, 1.1);
          if (k === 0) { this.sound?.at(target.x, target.z).playProjectileImpact('spine'); onHit(); }
        }
      });
    }
  }

  /** Photon Cannon orb: white-hot core with a pale-blue rim and a soft blue vapour fringe. */
  private photonTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 31);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.3, 'rgba(245,252,255,1)'); grad.addColorStop(0.48, 'rgba(170,220,255,0.85)');
    grad.addColorStop(0.68, 'rgba(70,150,255,0.35)'); grad.addColorStop(1, 'rgba(40,100,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  /**
   * Photon Cannon shot (SC2): a small ball of white energy with a blue fuzzy edge flies to the target (following it),
   * then on impact swells ~18% and fades out quickly.
   */
  public spawnPhotonBall(from: Vector3D, to: Vector3D, targetEntity: any | null, onHit: () => void) {
    const size = 0.44, haloSize = 0.62;
    // white-hot additive core + a normally blended blue fringe (stays blue over bright ground, where additive washes out)
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.photonTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, color: 0x3f8cff, transparent: true, opacity: 0.6, depthWrite: false }));
    core.scale.setScalar(size); core.renderOrder = 11;
    halo.scale.setScalar(haloSize); halo.renderOrder = 10;
    core.position.set(from.x, from.y, from.z); halo.position.copy(core.position);
    this.scene.add(halo, core);
    const start = new THREE.Vector3(from.x, from.y, from.z);
    const target = new THREE.Vector3(to.x, to.y, to.z);
    this.projectiles.push({
      mesh: core, glow: halo, start, target, speed: 18, progress: 0, isArc: false, damage: 0, attackerId: '',
      isHoming: !!targetEntity, targetEntityRef: targetEntity ?? undefined,
      onHit: () => {
        // the ball stops, swells ~18% and fades away quickly
        const pop = (mat: THREE.SpriteMaterial, s0: number, o0: number, order: number) => {
          const sp = new THREE.Sprite(mat);
          sp.position.copy(core.position); sp.scale.setScalar(s0); sp.renderOrder = order;
          this.scene.add(sp);
          this.particles.push({ mesh: sp as unknown as THREE.Mesh, velocity: new THREE.Vector3(), life: 0.16, maxLife: 0.16, fade: false, shrink: false, buoyant: true, smoke: { s0, s1: s0 * 1.18, o0, spin: 0, instant: true } });
        };
        pop(new THREE.SpriteMaterial({ map: this.smokeTex, color: 0x3f8cff, transparent: true, opacity: 0.6, depthWrite: false }), haloSize, 0.6, 10);
        pop(new THREE.SpriteMaterial({ map: this.photonTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), size, 1, 11);
        (core.material as THREE.SpriteMaterial).dispose();
        onHit();
      }
    });
  }

  // Spawn Wraith Fighter Rapid-Fire Burst Laser
  public spawnWraithLaser(from: Vector3D, to: Vector3D, onHit: () => void) {
    this.spawnMuzzleFlash(from, 0xff3366, 0.36);
    this.sound?.at(from.x, from.z).playBulletWhiz();

    const mesh = new THREE.Mesh(this.wraithLaserGeo, this.wraithLaserMat);
    mesh.position.set(from.x, from.y, from.z);
    mesh.lookAt(to.x, to.y, to.z);
    this.scene.add(mesh);

    const start = new THREE.Vector3(from.x, from.y, from.z);
    const target = new THREE.Vector3(to.x, to.y, to.z);

    this.projectiles.push({
      mesh,
      start,
      target,
      speed: 55,
      progress: 0,
      isArc: false,
      damage: 0,
      attackerId: '',
      onHit: () => {
        this.spawnImpactSparks(target, 0xff3355);
        this.sound?.at(target.x, target.z).playProjectileImpact('energy');
        onHit();
      }
    });
  }

  /**
   * A real rocket: finned body with a nose cone and a flickering exhaust flame, launched with a whoosh, flying a winding,
   * slightly parabolic path (the weave dies out toward the target) that bends toward a moving target, trailing smoke.
   * The hit callback (damage + impact sound) fires on the exact frame it lands.
   */
  private spawnRocket(from: Vector3D, to: Vector3D, targetEntity: any | null, onHit: (pos: THREE.Vector3) => void,
    o: { speed: number; arc: number; weave: number; freq: number; flash: number; boom: number; shock: boolean; scale?: number; straight?: boolean; quiet?: boolean }) {
    if (!o.straight) this.spawnMuzzleFlash(from, o.flash === 0 ? 0xff8800 : o.flash, 0.5);
    if (!o.quiet) this.fx.launchPuff(from.x, from.y, from.z, { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }, o.straight ? 0.45 : 0.7);
    if (!o.quiet) this.sound?.at(from.x, from.z).playRocketWhoosh();
    const sc = o.scale ?? (o.straight ? 0.3 : 1);
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.missileBodyGeo, this.missileBodyMat);
    const nose = new THREE.Mesh(this.rocketNoseGeo, this.rocketNoseMat);
    nose.position.set(0, 0, 0.55);
    const flame: THREE.Object3D = o.straight
      // Backlash rocket: just a small glowing white-yellow flare at the tail
      ? new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flareTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
      : new THREE.Mesh(this.rocketFlameGeo, this.rocketFlameMat);
    flame.position.set(0, 0, -0.62); flame.name = 'flame';
    if (o.straight) flame.scale.setScalar(1.1);
    group.add(body, nose, flame);
    for (let k = 0; k < 3; k++) {
      const fin = new THREE.Mesh(this.rocketFinGeo, this.missileBodyMat);
      fin.position.set(0, 0, -0.32); fin.rotation.z = (k / 3) * Math.PI * 2;
      group.add(fin);
    }
    group.scale.setScalar(sc);
    group.position.set(from.x, from.y, from.z);
    group.lookAt(to.x, to.y, to.z);
    this.scene.add(group);
    const start = new THREE.Vector3(from.x, from.y, from.z);
    const target = new THREE.Vector3(to.x, to.y, to.z);
    const dir = target.clone().sub(start).normalize();
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    this.projectiles.push({
      mesh: group, start, target,
      targetEntityId: targetEntity?.id, targetEntityRef: targetEntity,
      speed: o.speed, progress: 0, isArc: false, damage: 0, attackerId: '',
      rocket: { arc: o.arc, weave: o.weave, freq: o.freq, phase: Math.random() * Math.PI * 2, side, spin: 0, straight: o.straight, smokeAcc: 0 },
      onHit: (pos) => {
        if (o.shock) this.spawnShockwave(pos);
        if (o.straight) { this.spawnImpactFlash(pos); this.impactBlast(pos, 0.5); } else this.impactBlast(pos, o.boom);
        this.sound?.at(pos.x, pos.z).playProjectileImpact('shell');
        onHit(pos);
      }
    });
  }

  // Spawn Ace Combat Homing Missile (Goliath / Missile Turret / FPS): steers onto the locked target, winding path, smoke contrail
  public spawnHomingMissile(
    from: Vector3D,
    to: Vector3D,
    targetEntity: any | null,
    onHit: (pos: THREE.Vector3) => void,
    count = 1
  ) {
    const o = { speed: 30, arc: 0.1, weave: 0.35, freq: 2.5, flash: 0x38bdf8, boom: 1.35, shock: false, straight: true };
    if (count <= 1) { this.spawnRocket(from, to, targetEntity, onHit, o); return; }
    // Salvo (e.g. Viking pair, Thor's 4 Javelin missiles): rockets leave side by side; the first one's hit applies the damage
    const dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz) || 1;
    const sx = -dz / len, sz = dx / len;
    for (let k = 0; k < count; k++) {
      const col = count === 4 ? (k % 2) - 0.5 : k - (count - 1) / 2;
      const row = count === 4 ? Math.floor(k / 2) - 0.5 : 0;
      const f = { x: from.x + sx * col * 0.3, y: from.y + row * 0.3, z: from.z + sz * col * 0.3 };
      this.spawnRocket(f, to, targetEntity, k === 0 ? onHit : () => {}, { ...o, quiet: k > 0 });
    }
  }

  /**
   * Viking Assault Mode Twin Gatling Cannon: a quick burst of short yellow tracers alternating between the two barrel
   * clusters, staggered ~60 ms apart. The first tracer's hit applies the damage.
   */
  public spawnGatlingBurst(from: Vector3D, to: Vector3D, onHit: () => void) {
    this.spawnMuzzleFlashDir(from, to, 0.55);
    const dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz) || 1;
    const sx = -dz / len, sz = dx / len;
    for (let k = 0; k < 4; k++) {
      const side = k % 2 ? 0.09 : -0.09;
      const start = new THREE.Vector3(from.x + sx * side, from.y, from.z + sz * side);
      const target = new THREE.Vector3(to.x + (Math.random() - 0.5) * 0.25, to.y + (Math.random() - 0.5) * 0.2, to.z + (Math.random() - 0.5) * 0.25);
      const mesh = new THREE.Mesh(this.marineTracerGeo, this.marineTracerMat);
      mesh.scale.set(0.7, 0.7, 0.55);
      mesh.position.copy(start); mesh.lookAt(target);
      this.scene.add(mesh);
      this.projectiles.push({
        mesh, start, target, speed: 60, progress: 0, isArc: false, damage: 0, attackerId: '', delay: k === 0 ? undefined : k * 0.06,
        onHit: () => {
          this.spawnImpactSparks(target, 0xffdd55);
          if (k === 0) { this.sound?.at(target.x, target.z).playProjectileImpact('bullet'); onHit(); }
        }
      });
    }
  }

  /**
   * Thor High Impact Payload, 250mm Punisher Cannons: two heavy glowing orange slugs (one per shoulder cannon), tracking
   * the air target, with a large muzzle flash and a fiery flak burst on impact. Single-target: the first slug deals the hit.
   */
  public spawnPunisherCannon(from: Vector3D, to: Vector3D, targetEntity: any | null, onHit: () => void) {
    this.spawnMuzzleFlashDir(from, to, 1.3);
    this.fx.muzzleBlast(from.x, from.y, from.z, { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }, 0.7);
    const dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz) || 1;
    const sx = -dz / len, sz = dx / len;
    for (let k = 0; k < 2; k++) {
      const side = k ? 0.35 : -0.35;
      const start = new THREE.Vector3(from.x + sx * side, from.y + 0.15, from.z + sz * side);
      const target = new THREE.Vector3(to.x, to.y, to.z);
      const mesh = new THREE.Mesh(this.heavyTracerGeo, this.getColorMat(0xffb347));
      mesh.scale.set(1.5, 1.5, 0.75);
      mesh.position.copy(start); mesh.lookAt(target);
      this.scene.add(mesh);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flareTex, color: 0xff8a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.setScalar(0.9); glow.position.copy(start);
      this.scene.add(glow);
      this.projectiles.push({
        mesh, glow, start, target, targetEntityId: targetEntity?.id, targetEntityRef: targetEntity, isHoming: !!targetEntity,
        speed: 34, progress: 0, isArc: false, damage: 0, attackerId: '', delay: k ? 0.08 : undefined,
        onHit: (pos) => {
          this.spawnImpactFlash(pos);
          this.spawnExplosionPuff(pos, 1.15);
          this.spawnImpactSparks(pos, 0xff9a2a);
          this.sound?.at(pos.x, pos.z).playProjectileImpact('shell');
          if (k === 0) onHit();
        }
      });
    }
  }

  /** Cannon firing: the GPU muzzle blast along the barrel (from -> to), kicking up dust when the gun is near the ground. */
  public cannonBlast(from: Vector3D, to: Vector3D, scale: number) {
    const dx = to.x - from.x, dz = to.z - from.z, h = Math.hypot(dx, dz) || 1;
    // the barrel is close to level: keep a little of the true elevation so shots up a cliff tilt up
    const dy = Math.max(-0.25, Math.min(0.35, (to.y - from.y) / h));
    this.fx.muzzleBlast(from.x, from.y, from.z, { x: dx / h, y: dy, z: dz / h }, scale, ProceduralGrassSystem.getTerrainHeight(from.x, from.z));
  }

  /** Explosive round landing: on (or near) the ground it is a ground blast with a dust ring, in the air a plain fireball burst. */
  public impactBlast(pos: Vector3D, scale: number) {
    const g = ProceduralGrassSystem.getTerrainHeight(pos.x, pos.z);
    if (pos.y - g < 1.6) this.fx.groundBlast(pos.x, g, pos.z, scale);
    else this.fx.explosion(pos.x, pos.y, pos.z, scale);
  }

  /** Flamethrower (Firebat, Hellbat, Hellion): a burst of burning fuel from the nozzle to (and past) the target. */
  public spawnFlamethrower(from: Vector3D, to: Vector3D, scale = 1, reach = 1.1) {
    this.fx.flamethrower(from, to, scale, 0.38, reach);
  }

  /** Mechanical transform (Thor payload swap): vents of white steam around the hull. */
  public spawnTransformSteam(pos: Vector3D, scale = 1) {
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * Math.PI * 2, r = 0.5 * scale;
      this.fx.steam(pos.x + Math.cos(a) * r, pos.y + 1.2 * scale + Math.random() * 0.6, pos.z + Math.sin(a) * r,
        Math.cos(a) * 1.4, 0.7 + Math.random() * 0.5, Math.sin(a) * 1.4, 1.3 * scale, 0.9 + Math.random() * 0.6);
    }
  }

  // Spawn Banshee Air-to-Ground Backlash Rocket
  public spawnBansheeRocket(from: Vector3D, to: Vector3D, onHit: (pos: THREE.Vector3) => void, targetEntity: any | null = null) {
    this.spawnRocket(from, to, targetEntity, onHit, { speed: 27, arc: 0, weave: 0, freq: 0, flash: 0xff8800, boom: 1.1, shock: false, straight: true });
  }

  // Mutalisk Glaive Wurm: a bright green-yellow wurm (head plus a trail of wriggling segments) that is flung at the target
  public spawnMutaliskGlaive(from: Vector3D, to: Vector3D, onHit: () => void) {
    const mesh = new THREE.Mesh(this.wormHeadGeo, this.wormHeadMat);
    mesh.position.set(from.x, from.y, from.z);
    mesh.scale.set(1, 1, 1.5);
    mesh.lookAt(to.x, to.y, to.z);
    this.scene.add(mesh);
    const segs: THREE.Mesh[] = [];
    for (let k = 0; k < 4; k++) {
      const sg = new THREE.Mesh(this.wormSegGeo, this.wormSegMat);
      sg.position.copy(mesh.position); sg.scale.setScalar(1 - k * 0.17);
      this.scene.add(sg); segs.push(sg);
    }
    const start = new THREE.Vector3(from.x, from.y, from.z);
    const target = new THREE.Vector3(to.x, to.y, to.z);
    this.projectiles.push({
      mesh, start, target, speed: 24, progress: 0, isArc: false, damage: 0, attackerId: '', trail: 'muta', segs,
      onHit: () => {
        for (let k = 0; k < 4; k++) this.puff(target, this.dropGeo, this.wormHeadMat, 0.5, 0.9, 0.55);
        this.sound?.at(target.x, target.z).playProjectileImpact('spine');
        onHit();
      }
    });
  }

  /** Damaged component: thin grey smoke; critical damage adds a small flame and darker smoke. Also used for chimney exhaust. */
  public spawnDamageSmoke(pos: Vector3D, isCriticalFire: boolean = false) {
    const x = pos.x + (Math.random() - 0.5) * 0.4, y = pos.y + 0.5 + Math.random() * 0.3, z = pos.z + (Math.random() - 0.5) * 0.4;
    if (isCriticalFire) {
      this.fx.flame(Math.random() < 0.5 ? 'lick' : 'flicker', x, y - 0.2, z, 0.5 + Math.random() * 0.25);
      this.fx.column(x, y + 0.4, z, 0.9, true, 0.55);
    } else this.fx.wisp(x, y, z, 1.1, 1.6, 0.5);
  }

  // Medivac Continuous Healing Beam
  public spawnHealBeam(from: Vector3D, to: Vector3D) {
    const p1 = new THREE.Vector3(from.x, from.y, from.z);
    const p2 = new THREE.Vector3(to.x, to.y, to.z);
    const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const line = new THREE.Line(geo, this.beamMat);
    this.scene.add(line);

    this.beams.push({
      line,
      sourcePos: p1,
      targetPos: p2,
      life: 0.16
    });

    // Small healing sparks around target
    for (let i = 0; i < 2; i++) {
      const spark = new THREE.Mesh(this.sparkGeo, this.healMat);
      spark.position.set(
        to.x + (Math.random() - 0.5) * 0.6,
        to.y + Math.random() * 0.8,
        to.z + (Math.random() - 0.5) * 0.6
      );
      this.scene.add(spark);
      this.particles.push({
        mesh: spark,
        velocity: new THREE.Vector3(0, 1.2, 0),
        life: 0.25,
        maxLife: 0.25,
        fade: false,
        shrink: true
      });
    }
  }

  // SCV Welding Sparks
  public spawnWeldingSparks(pos: Vector3D) {
    for (let i = 0; i < 4; i++) {
      const spark = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      spark.position.set(pos.x, pos.y + 0.5, pos.z);
      this.scene.add(spark);

      this.particles.push({
        mesh: spark,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 2.5,
          1.5 + Math.random() * 2.0,
          (Math.random() - 0.5) * 2.5
        ),
        life: 0.25,
        maxLife: 0.25,
        fade: false,
        shrink: true
      });
    }
  }

  // Stimpack Red Adrenaline Steam
  public spawnStimAura(pos: Vector3D) {
    for (let i = 0; i < 6; i++) {
      const puff = new THREE.Mesh(this.smokeGeo, this.stimMat);
      puff.position.set(
        pos.x + (Math.random() - 0.5) * 0.5,
        pos.y + 0.3 + Math.random() * 0.6,
        pos.z + (Math.random() - 0.5) * 0.5
      );
      this.scene.add(puff);

      this.particles.push({
        mesh: puff,
        velocity: new THREE.Vector3(0, 1.5 + Math.random(), 0),
        life: 0.4,
        maxLife: 0.4,
        fade: false,
        shrink: true
      });
    }
  }

  // Shockwave Ring (Siege blast)
  private spawnShockwave(pos: THREE.Vector3) {
    const ring = new THREE.Mesh(this.shockwaveGeo, this.shockwaveMat);
    ring.position.set(pos.x, 0.05, pos.z);
    this.scene.add(ring);

    this.particles.push({
      mesh: ring,
      velocity: new THREE.Vector3(0, 0, 0),
      life: 0.4,
      maxLife: 0.4,
      fade: false,
      shrink: false
    });
  }

  /** Explosion: flash, rolling fireballs, embers and a fire-lit dust billow (all GPU particles). */
  public spawnExplosionPuff(pos: THREE.Vector3, scale: number = 1.0) {
    this.fx.explosion(pos.x, pos.y, pos.z, scale);
  }

  /** SC2-style command confirmation: a ring that contracts onto the clicked point. */
  public spawnCommandPing(x: number, z: number, color: number) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(this.pingGeo, mat);
    ring.position.set(x, 0.12, z);
    ring.scale.set(1.8, 1, 1.8);
    ring.renderOrder = 5;
    this.scene.add(ring);
    this.particles.push({ mesh: ring, velocity: new THREE.Vector3(), life: 0.45, maxLife: 0.45, fade: false, shrink: false, ping: true });
  }

  /** Persistent damage effect for crippled structures: flame tongues licking up from the roof, plus the odd ember. */
  public spawnBuildingBurn(pos: Vector3D, radius: number, severity: number) {
    if (severity <= 0.35) return;
    // pos.y is the roof: flames stand a little below it so they lick up over the top
    const ox = (Math.random() - 0.5) * radius * 0.9, oz = (Math.random() - 0.5) * radius * 0.9;
    const x = pos.x + ox, y = pos.y - 0.5 - Math.random() * 0.4, z = pos.z + oz;
    const sz = 0.8 + severity * 1.1;
    this.fx.tongue(x, y, z, sz);
    if (Math.random() < 0.6) this.fx.tongue(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5, sz * 0.65);
    if (Math.random() < 0.25) this.fx.embers(x, y + sz * 0.6, z, 2, 1.2);
  }

  private spawnImpactSparks(pos: THREE.Vector3, color: number) {
    const mat = this.getColorMat(color);
    for (let i = 0; i < 3; i++) {
      const spark = new THREE.Mesh(this.sparkGeo, mat);
      spark.position.copy(pos);
      this.scene.add(spark);

      this.particles.push({
        mesh: spark,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 3,
          Math.random() * 2 + 0.5,
          (Math.random() - 0.5) * 3
        ),
        life: 0.2,
        maxLife: 0.2,
        fade: false,
        shrink: true
      });
    }
  }

  private emitTrail(p: Projectile, totalDist: number) {
    const pos = p.mesh.position;
    if (p.trail === 'roach') {
      // dense stream of vapour: several puffs per frame, billowing out and drifting up
      this.puff(pos, this.mistGeo, this.roachMistMat, 0.55, 0.55 + Math.random() * 0.4, 0.5);
      if (Math.random() < 0.7) this.puff(pos, this.mistGeo, this.roachMistCoreMat, 0.35, 0.3, 0.25);
    } else if (p.trail === 'muta' && p.segs) {
      // wriggle: head sways sideways, each segment chases the one in front
      const t = p.progress * totalDist;
      const dx = p.target.x - p.start.x, dz = p.target.z - p.start.z, L = Math.hypot(dx, dz) || 1;
      const nx = -dz / L, nz = dx / L;
      const sway = Math.sin(t * 7) * 0.09;
      pos.x += nx * sway; pos.z += nz * sway;
      let prev = pos;
      for (let k = 0; k < p.segs.length; k++) {
        const sg = p.segs[k]!;
        sg.position.lerp(prev, 0.35);
        sg.position.y += Math.sin(t * 9 - k * 1.3) * 0.012;
        prev = sg.position;
      }
    }
  }

  /** A soft translucent puff that swells and fades (shared materials, no per-puff allocation). */
  private puff(pos: THREE.Vector3, geo: THREE.BufferGeometry, mat: THREE.Material, life: number, scale: number, spread: number) {
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    m.scale.setScalar(scale);
    this.scene.add(m);
    this.particles.push({
      mesh: m, life, maxLife: life, fade: false, shrink: false, grow: true, baseScale: scale, buoyant: true,
      velocity: new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * spread * 0.6, (Math.random() - 0.5) * spread)
    });
  }

  // Update loop
  public update(dt: number) {
    this.fx.update(dt);
    // 1. Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      if (p.delay !== undefined && p.delay > 0) {
        p.delay -= dt; p.mesh.visible = false;
        if (p.delay > 0) continue;
        p.mesh.visible = true;
        if (!p.noFlash) this.spawnMuzzleFlashDir(p.start, p.target, 0.45);
      }
      if (p.isHoming && p.targetEntityRef && !p.targetEntityRef.isDead) {
        const livePos = p.targetEntityRef.getPosition3D();
        p.target.set(livePos.x, livePos.y + 0.8, livePos.z);
      }
      if (p.rocket && p.targetEntityRef && !p.targetEntityRef.isDead && p.targetEntityRef.getPosition3D) {
        const lp = p.targetEntityRef.getPosition3D();
        p.target.set(lp.x, lp.y + (p.isHoming ? 0.8 : 0.5), lp.z);
      }
      const totalDist = p.start.distanceTo(p.target);
      p.progress += (p.speed * dt) / Math.max(0.1, totalDist);

      if (p.rocket?.straight && p.progress < 1 && p.targetEntityRef) {
        // detonate on the target's surface (its footprint edge) instead of flying into its centre
        const ref = p.targetEntityRef, hitR = ref.radius ?? (ref.size ? ref.size * 0.5 : 0.45);
        if (p.mesh.position.distanceTo(p.target) <= hitR * 0.9) { p.target.copy(p.mesh.position); p.progress = 1; }
      }
      if (p.progress >= 1.0) {
        p.mesh.position.copy(p.target);
        p.onHit(p.target, p.targetEntityId);
        this.scene.remove(p.mesh);
        if (p.glow) { this.scene.remove(p.glow); p.glow.material.dispose(); }
        p.segs?.forEach(sg => this.scene.remove(sg));
        this.projectiles.splice(i, 1);
      } else {
        this._prevPos.copy(p.mesh.position);
        p.mesh.position.lerpVectors(p.start, p.target, p.progress);
        if (p.glow) { p.glow.position.copy(p.mesh.position); if (p.isHoming) p.mesh.lookAt(p.target); }
        if (p.rocket?.straight) {
          // Backlash rocket: dead-straight flight toward the target, modest thruster flare, linear smoke trail
          const r = p.rocket;
          const v = p.mesh.position.clone().sub(this._prevPos);
          const step = v.length();
          if (step > 1e-6) p.mesh.lookAt(p.mesh.position.x + v.x, p.mesh.position.y + v.y, p.mesh.position.z + v.z);
          const fl = p.mesh.getObjectByName('flame'); if (fl) fl.scale.setScalar(0.95 + Math.random() * 0.3);
          const spacing = 0.09;
          r.smokeAcc = (r.smokeAcc ?? 0) + step;
          while (r.smokeAcc >= spacing && step > 1e-6) {
            r.smokeAcc -= spacing;
            const f = 1 - r.smokeAcc / step; // position along this frame's segment
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, color: 0xd8d8d8, transparent: true, opacity: 0, depthWrite: false }));
            sp.position.lerpVectors(this._prevPos, p.mesh.position, f).addScaledVector(v, -0.6 / step);
            const rnd = () => Math.random() - 0.5;
            sp.position.x += rnd() * 0.029; sp.position.y += rnd() * 0.022; sp.position.z += rnd() * 0.029;
            const s0 = 0.0684 + Math.random() * 0.0324, life = 1.0 + Math.random() * 0.7;
            sp.scale.setScalar(s0);
            (sp.material as THREE.SpriteMaterial).rotation = Math.random() * Math.PI * 2;
            this.scene.add(sp);
            // gentle shared breeze (slowly shifting) plus a little per-puff turbulence and slight rise
            const t = performance.now() / 1000;
            const wx = 0.22 + Math.sin(t * 0.3) * 0.08, wz = 0.1 + Math.cos(t * 0.23) * 0.08;
            this.particles.push({ mesh: sp as unknown as THREE.Mesh, velocity: new THREE.Vector3(wx + rnd() * 0.12, 0.05 + Math.random() * 0.08, wz + rnd() * 0.12), life, maxLife: life, fade: false, shrink: false, buoyant: true,
              smoke: { s0, s1: 0.216 + Math.random() * 0.1656, o0: 0.38 + Math.random() * 0.2, spin: rnd() * 0.8 } });
          }
          continue;
        }
        if (p.rocket) {
          const r = p.rocket, t = p.progress, env = Math.sin(Math.PI * t) ** 0.8;
          // parabolic lob plus a weave that decays toward impact so the rocket lands exactly on the target
          p.mesh.position.y += Math.sin(Math.PI * t) * Math.min(3.2, totalDist * r.arc);
          const w = Math.sin(t * r.freq * Math.PI * 2 + r.phase) * r.weave * env * Math.min(1, totalDist / 6) * (1 - t * 0.6);
          p.mesh.position.addScaledVector(r.side, w);
          p.mesh.position.y += Math.cos(t * r.freq * Math.PI * 2 * 0.8 + r.phase) * r.weave * 0.35 * env;
          const v = p.mesh.position.clone().sub(this._prevPos);
          if (v.lengthSq() > 1e-8) p.mesh.lookAt(p.mesh.position.x + v.x, p.mesh.position.y + v.y, p.mesh.position.z + v.z);
          const fl = p.mesh.getObjectByName('flame'); if (fl) fl.scale.set(1, 1, 0.7 + Math.random() * 0.7);
          if (Math.random() < 0.9) { const q = p.mesh.position; this.fx.wisp(q.x, q.y, q.z, 0.5, 0.7, 0.5, 0.3); }
          continue;
        }
        if (p.trail) this.emitTrail(p, totalDist);
        if (p.isArc) {
          // Parabolic height arc (gentler for homing missiles)
          const maxArc = p.isHoming ? 2.4 : 6.0;
          const arcHeight = Math.sin(p.progress * Math.PI) * Math.min(maxArc, totalDist * (p.isHoming ? 0.12 : 0.25));
          p.mesh.position.y += arcHeight;
          if (p.isHoming) {
            p.mesh.lookAt(
              p.mesh.position.x + (p.mesh.position.x - this._prevPos.x),
              p.mesh.position.y + (p.mesh.position.y - this._prevPos.y),
              p.mesh.position.z + (p.mesh.position.z - this._prevPos.z)
            );
          }

          // Smoke / fire trail contrail for clearly visible projectile arcs
          if (Math.random() < (p.isHoming ? 0.85 : 0.5)) { const q = p.mesh.position; this.fx.wisp(q.x, q.y, q.z, 0.4, p.isHoming ? 0.6 : 0.4, 0.45, 0.3); }
        }
      }
    }

    // 1b. Muzzle flashes: pop open fast, then shrink out
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]!; f.life -= dt;
      if (f.life <= 0) { this.scene.remove(f.obj); this.flashes.splice(i, 1); }
      else { const r = f.life / f.maxLife; f.obj.children.forEach(c => c.scale.setScalar(0.55 + 0.45 * r)); }
    }

    // 2. Update Beams
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i]!;
      b.life -= dt;
      if (b.life <= 0) {
        this.scene.remove(b.line);
        b.line.geometry.dispose();
        this.beams.splice(i, 1);
      }
    }

    // 3. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i]!;
      pt.life -= dt;
      if (pt.life <= 0) {
        this.scene.remove(pt.mesh);
        if (pt.smoke) ((pt.mesh as unknown as THREE.Sprite).material as THREE.Material).dispose();
        if (pt.ping) ((pt.mesh as THREE.Mesh).material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      } else {
        pt.mesh.position.addScaledVector(pt.velocity, dt);
        if (pt.smoke) {
          const a = 1 - pt.life / pt.maxLife;
          pt.mesh.scale.setScalar(pt.smoke.s0 + (pt.smoke.s1 - pt.smoke.s0) * Math.sqrt(a));
          const sm = (pt.mesh as unknown as THREE.Sprite).material as THREE.SpriteMaterial;
          sm.opacity = pt.smoke.instant ? pt.smoke.o0 * (1 - a) * (1 - a) : pt.smoke.o0 * Math.min(1, a * 8) * (1 - a);
          sm.rotation += pt.smoke.spin * dt;
          continue;
        }
        if (pt.ping) {
          const k = 0.45 + 1.35 * ratio0(pt);
          pt.mesh.scale.set(k, 1, k);
          ((pt.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.9 * ratio0(pt);
          continue;
        }
        if (!pt.buoyant) pt.velocity.y -= 4.0 * dt; // Gravity (burn smoke / flames rise instead)

        const ratio = pt.life / pt.maxLife;
        if (pt.grow) {
          const k = (pt.baseScale ?? 1) * (0.6 + 1.1 * (1 - ratio)) * Math.min(1, ratio * 2.2);
          pt.mesh.scale.setScalar(Math.max(0.01, k));
        } else if (pt.shrink) {
          pt.mesh.scale.setScalar(Math.max(0.01, ratio * (pt.baseScale ?? 1)));
        }

        // Expand shockwave rings
        if (pt.mesh.geometry === this.shockwaveGeo) {
          const expansion = (1.0 - ratio) * 4.0;
          pt.mesh.scale.set(1 + expansion, 1, 1 + expansion);
        }
      }
    }
  }
}
