import * as THREE from 'three';
import { ProceduralGrassSystem } from './ProceduralGrass';
import type { UnitType, BuildingType } from '../types';
import { UNIT_CONFIGS, BUILDING_CONFIGS } from '../config';
import type { FireSmokeFX } from './FireSmoke';
import { LiquidMelt } from './LiquidMelt';
import { Dismember, HYDRALISK_RIG, type DismemberKind } from './Dismember';

type DeathStyle = 'bio' | 'mech' | 'air' | 'zerg' | 'energy';
type Race = 'terran' | 'zerg' | 'protoss';

const UNIT_STYLE: Record<string, DeathStyle> = {
  marine: 'bio', marauder: 'bio', firebat: 'bio', medic: 'bio',
  scv: 'mech', goliath: 'mech', thor: 'mech', thor_ap: 'mech', viking_assault: 'mech', siege_tank: 'mech', siege_tank_sieged: 'mech',
  medivac: 'air', wraith: 'air', banshee: 'air',
  drone: 'zerg', zergling: 'zerg', roach: 'zerg', hydralisk: 'zerg', mutalisk: 'air',
  probe: 'energy', zealot: 'energy', stalker: 'energy', archon: 'energy', void_ray: 'energy', adept: 'energy', immortal: 'energy', colossus: 'energy', carrier: 'energy', tempest: 'energy',
  cyclone: 'mech', odin: 'mech', overlord: 'zerg', swarm_host: 'zerg',
  hellion: 'mech', hellbat: 'mech', vulture: 'mech', widow_mine: 'mech', mule: 'mech', auto_turret: 'mech',
  ghost: 'bio', nova: 'bio', reaper: 'bio',
  queen: 'zerg', larva: 'zerg', egg: 'zerg', baneling: 'zerg', ravager: 'zerg', ultralisk: 'zerg', lurker: 'zerg', infestor: 'zerg',
  sentry: 'energy', dark_templar: 'energy', high_templar: 'energy', disruptor: 'energy'
};
const ZERG_B = new Set(['hatchery', 'spawning_pool', 'roach_warren', 'hydralisk_den', 'spine_crawler', 'extractor', 'overlord_pod', 'infestation_pit', 'hive', 'baneling_nest', 'evolution_chamber', 'lurker_den', 'spire', 'greater_spire', 'nydus_network', 'ultralisk_cavern', 'spore_crawler', 'creep_tumor', 'nydus_worm']);
const PROTOSS_B = new Set(['nexus', 'pylon', 'assimilator', 'gateway', 'forge', 'photon_cannon', 'stargate']);

interface Debris {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;      // time left while airborne/smoldering
  settled: boolean;
  rest: number;      // time resting on the ground
  restMax: number;
  smoke: number;     // seconds of smoke trail left
}
interface Dying {
  obj: THREE.Object3D;
  t: number;
  dur: number;
  step: (d: Dying, dt: number) => void;
  done: (d: Dying) => void;
  data: Record<string, any>;
}
interface Delayed { t: number; fn: () => void; }
interface Fade { mesh: THREE.Mesh; t: number; dur: number; start: number; shrink: boolean; grow: number; vel?: THREE.Vector3; }

/** Death animations, explosions, debris, wrecks and scorch / ichor marks for units and buildings. */
export class DeathEffects {
  private scene: THREE.Scene;
  private debris: Debris[] = [];
  private dying: Dying[] = [];
  private delayed: Delayed[] = [];
  private fades: Fade[] = [];
  private burnOuts: { pos: THREE.Vector3; t: number; t0: number; interval: number; acc: number; big: boolean; r: number }[] = [];
  private static MAX_DEBRIS = 220;

  private boxGeo = new THREE.BoxGeometry(1, 1, 1);
  private slabGeo = new THREE.BoxGeometry(1, 0.35, 0.7);
  private sphereGeo = new THREE.SphereGeometry(1, 8, 6);
  private ringGeo = new THREE.RingGeometry(0.55, 1.0, 28).rotateX(-Math.PI / 2);
  private decalGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);

  private metalMats = [0x4a4e56, 0x5a5f68, 0x6e727a, 0x3c3f46, 0x7a5a38].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0.5 }));
  private charMat = new THREE.MeshStandardMaterial({ color: 0x3a322c, roughness: 1, metalness: 0.1 });
  private rubbleMats = [0x5a5752, 0x6a6560, 0x4a4845].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
  private chitinMats = [0x5a4478, 0x70448e, 0x453560].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
  private ichorMat = new THREE.MeshStandardMaterial({ color: 0x6fd13a, roughness: 0.5, emissive: 0x2c5c10, emissiveIntensity: 0.6 });
  private crystalMats = [0xff6a3a, 0xffa23a, 0xff3a3a].map(c => new THREE.MeshBasicMaterial({ color: c }));
  private flashMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 1, depthWrite: false });
  private ringMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  private energyMat = new THREE.MeshBasicMaterial({ color: 0xff8a50, transparent: true, opacity: 0.9, depthWrite: false });
  private scorchTex: THREE.Texture;
  private ichorTex: THREE.Texture;

  private fx: FireSmokeFX;
  private melt: LiquidMelt;
  private dismember: Dismember;
  /** Debug: force every Marine death to one kind (null = random). */
  public static marineDeath: DismemberKind | null = null;
  /** Debug: force every Hydralisk death to one kind (null = picked by the killer). */
  public static hydraliskDeath: DismemberKind | null = null;

  /**
   * The bigger the killer, the bigger the death. Size comes from the killer's stats:
   * supply (body size) + hit damage vs a Marine + a big bump for splash weapons.
   * Zergling ~1.3, Marine ~2, Zealot/Hydra ~3-4, Roach ~4.7, Immortal/BC ~7, Ultralisk/Thor ~11, sieged Tank ~15.
   */
  private static killerSize(killer: string): number | null {
    const st = (UNIT_CONFIGS as Record<string, any>)[killer] ?? (BUILDING_CONFIGS as Record<string, any>)[killer];
    if (!st || !st.damage) return null;
    const bonus = st.bonusDamage && ['light', 'biological'].includes(st.bonusDamage.type) ? st.bonusDamage.amount : 0;
    return (st.supplyCost ?? 0) + (st.damage + bonus) / 6 + (st.splashRadius ? 5 : 0);
  }

  /** How a Marine / Hydralisk dies, by what killed it. */
  private static pickDeath(killer?: string | null): DismemberKind {
    const r = Math.random();
    // weapons with their own look: flames drop him, blades cut, snipers take the head
    if (killer === 'hellion' || killer === 'hellbat' || killer === 'firebat') return r < 0.65 ? 'fall' : 'partial';
    if (killer === 'dark_templar') return r < 0.6 ? 'halve' : 'decap';
    if (killer === 'ghost' || killer === 'nova') return r < 0.65 ? 'decap' : 'partial';
    const size = killer ? DeathEffects.killerSize(killer) : null;
    // unknown killer: anything goes
    if (size === null) return r < 0.25 ? 'blast' : r < 0.45 ? 'decap' : r < 0.6 ? 'halve' : r < 0.8 ? 'partial' : 'fall';
    if (size < 2.5) return r < 0.55 ? 'fall' : 'partial';                                       // zergling, SCV, marine
    if (size < 5) return r < 0.2 ? 'fall' : r < 0.6 ? 'partial' : r < 0.9 ? 'decap' : 'halve';  // zealot, hydra, roach, stalker
    if (size < 9) return r < 0.25 ? 'decap' : r < 0.6 ? 'halve' : 'blast';                     // immortal, BC, baneling
    return r < 0.75 ? 'shred' : 'blast';                                                        // tank, ultralisk, thor
  }

  constructor(scene: THREE.Scene, fx: FireSmokeFX) {
    this.scene = scene;
    this.fx = fx;
    this.melt = new LiquidMelt(scene);
    this.dismember = new Dismember(scene, this.melt);
    this.scorchTex = DeathEffects.radialTexture('rgba(0,0,0,0.85)', 'rgba(10,8,6,0.5)');
    this.ichorTex = DeathEffects.radialTexture('rgba(95,190,40,0.85)', 'rgba(60,120,25,0.45)');
  }

  private static radialTexture(inner: string, mid: string): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.55, mid);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    // ragged edge noise
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 30;
      g.fillStyle = inner.replace(/[\d.]+\)$/, '0.35)');
      g.beginPath(); g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 1 + Math.random() * 4, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ---------------------------------------------------------------- public API

  public clear() {
    for (const d of this.debris) this.scene.remove(d.mesh);
    for (const d of this.dying) this.scene.remove(d.obj);
    for (const f of this.fades) this.scene.remove(f.mesh);
    this.debris = []; this.dying = []; this.fades = []; this.delayed = []; this.burnOuts = [];
    this.melt.clear();
    this.dismember.clear();
    this.fx.clear();
  }

  /** Called by GameWorld when a unit dies. Takes ownership of `mesh` (removes it from the scene when finished). */
  public unitDied(type: UnitType, pos: THREE.Vector3, radius: number, mesh: THREE.Group | null, isFlying: boolean, killer?: string | null) {
    const style = UNIT_STYLE[type] ?? (isFlying ? 'air' : 'mech');
    const big = type === 'siege_tank' || type === 'siege_tank_sieged' || type === 'archon' || type === 'thor' || type === 'thor_ap' || type === 'odin';
    const ground = ProceduralGrassSystem.getTerrainHeight(pos.x, pos.z);
    const sc = Math.max(0.6, radius * (big ? 1.6 : 1.1));

    switch (style) {
      case 'bio': {
        this.puff(pos, sc * 0.5, 0.6);
        this.mark(pos.x, pos.z, ground, radius * 1.6, this.scorchTex, 14, 0.35);
        // Marines die a way that fits the killer (big killers blow them apart, small ones just drop them);
        // everyone else keels over
        if (type === 'marine' && mesh) {
          const kind = DeathEffects.marineDeath ?? DeathEffects.pickDeath(killer);
          if (kind !== 'fall' && this.dismember.explode(mesh, pos.clone().setY(ground + 0.55), kind)) break;
        }
        if (mesh) this.keelOver(mesh, type === 'marauder' ? 0.7 : 0.45);
        this.melt.spawnGroup('blood', pos, radius * 0.75, 16, 0.35);
        break;
      }
      case 'mech': {
        this.blast(pos, sc, big);
        this.mechDeath(type, pos, ground, sc, big);
        this.chunks(pos, this.metalMats, big ? 14 : 8, sc, big ? 7 : 5.5);
        this.mark(pos.x, pos.z, ground, radius * (big ? 3.2 : 2.4), this.scorchTex, 35, 0.5);
        this.wreck(pos, ground, radius, big);
        this.melt.spawnGroup('metal', pos, radius * (big ? 0.7 : 0.6), 17, 0.5);
        if (mesh) this.scene.remove(mesh);
        break;
      }
      case 'air': {
        if (mesh) this.crash(mesh, pos, radius, type);
        else this.blast(pos, sc, false);
        break;
      }
      case 'zerg': {
        // Hydralisks die a way that fits the killer, like Marines, spilling ichor
        if (type === 'hydralisk' && mesh) {
          const kind = DeathEffects.hydraliskDeath ?? DeathEffects.pickDeath(killer);
          if (this.dismember.explode(mesh, pos.clone().setY(ground + 0.6), kind, HYDRALISK_RIG)) {
            if (kind === 'shred' || kind === 'blast') this.splat(pos, sc * 0.8, false);
            this.mark(pos.x, pos.z, ground, radius * 2, this.ichorTex, 30, 0.7);
            this.melt.spawnGroup('ichor', pos, radius * 0.7, 7, 0.3);
            break;
          }
        }
        this.splat(pos, sc, big);
        this.chunks(pos, this.chitinMats, 5, sc, 4.5);
        this.chunks(pos, [this.ichorMat], 6, sc * 0.6, 5);
        this.mark(pos.x, pos.z, ground, radius * (type === 'roach' ? 3 : 2.4), this.ichorTex, 30, 0.7);
        if (mesh) this.squash(mesh);
        this.melt.spawnGroup('ichor', pos, radius * 0.85, 7, 0.1);
        break;
      }
      case 'energy': {
        this.energyBurst(pos, sc, big);
        this.chunks(pos, this.crystalMats, big ? 14 : 8, sc * 0.5, 6, true);
        this.mark(pos.x, pos.z, ground, radius * 2.0, this.scorchTex, 20, 0.35);
        if (mesh) this.implode(mesh);
        this.melt.spawnGroup('plasma', pos, radius * 0.75, 15, 0.25);
        break;
      }
    }
  }

  /** Called by GameWorld when a building is destroyed. Takes ownership of `mesh`. */
  public buildingDied(type: BuildingType, pos: THREE.Vector3, radius: number, mesh: THREE.Group | null) {
    const race: Race = ZERG_B.has(type) ? 'zerg' : PROTOSS_B.has(type) ? 'protoss' : 'terran';
    const ground = ProceduralGrassSystem.getTerrainHeight(pos.x, pos.z);
    const r = Math.max(1.4, radius);
    const dur = 1.7 + r * 0.25;

    // Staggered secondary explosions across the footprint while the structure caves in
    const n = 4 + Math.floor(r * 1.6);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * dur * 0.9 + Math.random() * 0.15;
      const ox = (Math.random() - 0.5) * r * 1.5, oz = (Math.random() - 0.5) * r * 1.5;
      this.delayed.push({
        t,
        fn: () => {
          const p = new THREE.Vector3(pos.x + ox, ground + 0.6 + Math.random() * r * 0.8, pos.z + oz);
          if (race === 'zerg') this.splat(p, 0.9 + r * 0.25, true);
          else if (race === 'protoss') this.energyBurst(p, 0.9 + r * 0.25, false);
          else this.blast(p, 0.8 + r * 0.3, i % 2 === 0);
          const mats = race === 'zerg' ? this.chitinMats : race === 'protoss' ? this.crystalMats : this.metalMats;
          this.chunks(p, mats, 3, 0.7 + r * 0.2, 5, race === 'protoss');
        }
      });
    }

    // Structure collapses: sinks, slumps and tilts
    if (mesh) {
      const baseY = mesh.position.y;
      this.dying.push({
        obj: mesh, t: 0, dur,
        data: { baseY, rx: (Math.random() - 0.5) * 0.18, rz: (Math.random() - 0.5) * 0.18, sy: mesh.scale.y, r },
        step: (d, dt) => {
          d.t += dt;
          const k = Math.min(1, d.t / d.dur), e = k * k;
          d.obj.position.y = d.data.baseY - e * (1.1 + d.data.r * 0.35);
          d.obj.rotation.x += d.data.rx * dt;
          d.obj.rotation.z += d.data.rz * dt;
          d.obj.scale.y = d.data.sy * (1 - 0.55 * e);
          d.obj.position.x += (Math.random() - 0.5) * 0.04 * (1 - k);
          if (Math.random() < 0.5) this.smokeAt(new THREE.Vector3(pos.x + (Math.random() - 0.5) * d.data.r * 1.4, ground + 1 + Math.random() * d.data.r, pos.z + (Math.random() - 0.5) * d.data.r * 1.4), 0.5 + d.data.r * 0.2);
          if (race === 'terran' && Math.random() < dt * 14) {
            // fire bursting out of the caving hull
            const fr = d.data.r, top = d.obj.position.y + 0.6 + fr * 0.5 * (1 - k);
            const shape = Math.random() < 0.35 ? 'sheet' : Math.random() < 0.5 ? 'tongue' : 'lean';
            this.fx.flame(shape, pos.x + (Math.random() - 0.5) * fr * 1.2, Math.max(ground + 0.2, top), pos.z + (Math.random() - 0.5) * fr * 1.2, 0.8 + fr * 0.35);
          }
        },
        done: d => {
          this.scene.remove(d.obj);
          this.finalCollapse(race, pos, ground, r);
        }
      });
    } else {
      this.delayed.push({ t: dur, fn: () => this.finalCollapse(race, pos, ground, r) });
    }
  }

  // ---------------------------------------------------------------- per-frame

  public update(dt: number) {
    dt = Math.min(dt, 0.1);
    this.melt.update(dt);
    this.dismember.update(dt);

    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i]!;
      d.t -= dt;
      if (d.t <= 0) { this.delayed.splice(i, 1); d.fn(); }
    }

    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i]!;
      d.step(d, dt);
      if (d.t >= d.dur) { this.dying.splice(i, 1); d.done(d); }
    }

    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]!;
      const m = d.mesh;
      if (!d.settled) {
        d.vel.y -= 16 * dt;
        m.position.addScaledVector(d.vel, dt);
        m.rotation.x += d.spin.x * dt; m.rotation.y += d.spin.y * dt; m.rotation.z += d.spin.z * dt;
        const g = ProceduralGrassSystem.getTerrainHeight(m.position.x, m.position.z) + m.scale.y * 0.3;
        if (m.position.y <= g) {
          m.position.y = g;
          if (Math.abs(d.vel.y) > 2.2) { d.vel.y *= -0.35; d.vel.x *= 0.6; d.vel.z *= 0.6; d.spin.multiplyScalar(0.5); }
          else { d.settled = true; }
        }
        if (d.smoke > 0 && Math.random() < 0.18) { d.smoke -= dt * 3; this.smokeAt(m.position, 0.3); }
      } else {
        d.rest += dt;
        if (d.smoke > 0 && Math.random() < 0.06) { d.smoke -= dt; this.smokeAt(m.position, 0.3); }
        const left = d.restMax - d.rest;
        if (left < 3) { m.scale.multiplyScalar(1 - dt * 0.6); m.position.y -= dt * 0.08; }
        if (left <= 0) { this.scene.remove(m); this.debris.splice(i, 1); }
      }
    }

    // Short-lived flashes / rings / smoke puffs / decals
    for (let i = this.fades.length - 1; i >= 0; i--) {
      const f = this.fades[i]!;
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      const mat = f.mesh.material as THREE.MeshBasicMaterial;
      if (f.grow) f.mesh.scale.setScalar(f.start * (1 + f.grow * k));
      else if (f.shrink) f.mesh.scale.setScalar(Math.max(0.001, f.start * (1 - k)));
      if (f.vel) f.mesh.position.addScaledVector(f.vel, dt);
      if (mat.transparent) mat.opacity = Math.max(0, (f.mesh.userData.o0 ?? 1) * (1 - k));
      if (k >= 1) { this.scene.remove(f.mesh); mat.dispose?.(); this.fades.splice(i, 1); }
    }

    // Smoldering wrecks keep smoking for a while
    for (let i = this.burnOuts.length - 1; i >= 0; i--) {
      const b = this.burnOuts[i]!;
      b.t -= dt; b.acc += dt;
      if (b.acc >= b.interval) {
        b.acc = 0;
        // smoldering wreck: oily black column, thinning out (and its flames shrinking to flickers) as it burns down
        const left = Math.min(1, b.t / 6), young = b.t / b.t0, sp = b.r * 1.3;
        const jx = () => (Math.random() - 0.5) * sp;
        this.fx.column(b.pos.x + jx() * 0.6, b.pos.y + 0.5, b.pos.z + jx() * 0.6, (b.big ? 1.6 : 1.0) * (0.6 + b.r * 0.2), true, 0.35 + 0.4 * left);
        if (Math.random() < 0.85 * left) {
          const size = (b.big ? 0.9 : 0.6) * (0.7 + b.r * 0.15);
          const shape = young > 0.6 ? (b.r > 1.5 && Math.random() < 0.4 ? 'sheet' : Math.random() < 0.5 ? 'tongue' : 'lean') : Math.random() < 0.6 ? 'lick' : 'flicker';
          this.fx.flame(shape, b.pos.x + jx(), b.pos.y, b.pos.z + jx(), size * (0.6 + 0.6 * young));
          if (b.r > 1.5 && Math.random() < 0.6) this.fx.flame('flicker', b.pos.x + jx(), b.pos.y, b.pos.z + jx(), size * 0.5);
        }
      }
      if (b.t <= 0) this.burnOuts.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------- building helpers

  private finalCollapse(race: Race, pos: THREE.Vector3, ground: number, r: number) {
    const c = new THREE.Vector3(pos.x, ground + 0.4, pos.z);
    if (race === 'zerg') { this.splat(c, r * 0.9, true); this.melt.spawnGroup('ichor', pos, r * 0.7, 8); }
    else if (race === 'protoss') this.energyBurst(c, r * 0.9, true);
    else this.blast(c, r * 0.9, true);
    this.shockwave(c, r * 1.8);
    const mats = race === 'zerg' ? this.chitinMats : race === 'protoss' ? this.crystalMats : this.rubbleMats;
    // heavy rubble pile that stays on the map
    this.chunks(c, mats, 10 + Math.floor(r * 3), r * 0.55, 6.5, race === 'protoss', 55);
    if (race === 'terran') this.chunks(c, this.metalMats, 6, r * 0.5, 7, false, 55);
    this.mark(pos.x, pos.z, ground, r * 2.7, race === 'zerg' ? this.ichorTex : this.scorchTex, 70, 0.8);
    const tb = race === 'terran' ? 14 : 7;
    this.burnOuts.push({ pos: c, t: tb, t0: tb, interval: race === 'terran' ? 0.16 : 0.28, acc: 0, big: true, r });
    if (race === 'terran') {
      // the dust of the collapse rolls out over the ground, and the fuel goes up in a last big fireball
      this.fx.dustRing(pos.x, ground + 0.15, pos.z, 0.8 + r * 0.45, 12);
      this.fx.fireColumn(pos.x, ground + 0.5, pos.z, 2 + r, 0.9 + r * 0.25, 0.6);
    }
  }

  // ---------------------------------------------------------------- unit helpers

  private keelOver(mesh: THREE.Object3D, fallSecs: number) {
    const side = Math.random() < 0.5 ? 1 : -1;
    this.dying.push({
      obj: mesh, t: 0, dur: fallSecs + 3.2,
      data: { baseY: mesh.position.y, side, fall: fallSecs },
      step: (d, dt) => {
        d.t += dt;
        const k = Math.min(1, d.t / d.data.fall);
        const e = 1 - (1 - k) * (1 - k);
        d.obj.rotation.z = d.data.side * e * (Math.PI / 2) * 0.95;
        d.obj.position.y = d.data.baseY - e * 0.25;
        if (d.t > d.data.fall + 1.8) {
          const s = Math.max(0, 1 - (d.t - d.data.fall - 1.8) / 1.4);
          d.obj.position.y -= dt * 0.35;
          d.obj.scale.setScalar(Math.max(0.001, s));
        }
      },
      done: d => this.scene.remove(d.obj)
    });
  }

  private squash(mesh: THREE.Object3D) {
    this.dying.push({
      obj: mesh, t: 0, dur: 4.5,
      data: { sx: mesh.scale.x, sy: mesh.scale.y, sz: mesh.scale.z, baseY: mesh.position.y },
      step: (d, dt) => {
        d.t += dt;
        const k = Math.min(1, d.t / 0.28);
        d.obj.scale.set(d.data.sx * (1 + 0.45 * k), d.data.sy * (1 - 0.8 * k), d.data.sz * (1 + 0.45 * k));
        if (d.t > 2.2) {
          const s = Math.max(0.001, 1 - (d.t - 2.2) / 2.3);
          d.obj.position.y = d.data.baseY - (1 - s) * 0.5;
          d.obj.scale.set(d.data.sx * 1.45 * s, d.data.sy * 0.2 * s, d.data.sz * 1.45 * s);
        }
      },
      done: d => this.scene.remove(d.obj)
    });
  }

  private implode(mesh: THREE.Object3D) {
    this.dying.push({
      obj: mesh, t: 0, dur: 0.4,
      data: { s: mesh.scale.clone(), baseY: mesh.position.y },
      step: (d, dt) => {
        d.t += dt;
        const k = Math.min(1, d.t / d.dur);
        const sc = Math.max(0.001, 1 - k);
        d.obj.scale.set(d.data.s.x * sc * (1 + 0.5 * k), d.data.s.y * (1 + 1.6 * k) * sc, d.data.s.z * sc * (1 + 0.5 * k));
        d.obj.position.y = d.data.baseY + k * 0.6;
        d.obj.rotation.y += dt * 14;
      },
      done: d => this.scene.remove(d.obj)
    });
  }

  /** Air units fall out of the sky, spinning and trailing fire, then crash. */
  private crash(mesh: THREE.Object3D, pos: THREE.Vector3, radius: number, type: string) {
    const spin = (Math.random() < 0.5 ? 1 : -1) * (3 + Math.random() * 4);
    const drift = new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3);
    const big = type === 'medivac';
    this.blast(pos.clone(), radius * 0.9, false); // mid-air hit
    this.dying.push({
      obj: mesh, t: 0, dur: 6,
      data: { vy: 0, spin, drift, crashed: false, big },
      step: (d, dt) => {
        d.t += dt;
        d.data.vy -= 14 * dt;
        d.obj.position.y += d.data.vy * dt;
        d.obj.position.addScaledVector(d.data.drift, dt);
        d.obj.rotation.z += d.data.spin * dt;
        d.obj.rotation.x += Math.min(1, d.t * 1.2) * 1.4 * dt;
        const gh = ProceduralGrassSystem.getTerrainHeight(d.obj.position.x, d.obj.position.z);
        if (Math.random() < 0.5) this.smokeAt(d.obj.position, 0.45);
        if (Math.random() < 0.6) this.fx.fireball(d.obj.position.x, d.obj.position.y, d.obj.position.z, 0.5, 0.4);
        if (d.obj.position.y <= gh + 0.3 && !d.data.crashed) {
          d.data.crashed = true;
          d.t = d.dur; // finish
        }
      },
      done: d => {
        const p = d.obj.position.clone();
        const g = ProceduralGrassSystem.getTerrainHeight(p.x, p.z);
        p.y = g + 0.3;
        this.scene.remove(d.obj);
        this.blast(p, radius * 1.6, true);
        this.shockwave(p, radius * 3);
        this.chunks(p, this.metalMats, 10, radius * 1.2, 6.5);
        this.mark(p.x, p.z, g, radius * 3.0, this.scorchTex, 40, 0.55);
        this.wreck(p, g, radius, big);
      }
    });
  }

  private wreck(pos: THREE.Vector3, ground: number, radius: number, big: boolean) {
    // charred hulk that smolders for a while
    const hulk = new THREE.Mesh(this.boxGeo, this.charMat);
    hulk.scale.set(radius * 1.5, radius * 0.45, radius * 1.9);
    hulk.position.set(pos.x, ground + radius * 0.22, pos.z);
    hulk.rotation.y = Math.random() * Math.PI;
    hulk.rotation.z = (Math.random() - 0.5) * 0.3;
    hulk.castShadow = true;
    this.scene.add(hulk);
    this.registerDebris(hulk, new THREE.Vector3(), new THREE.Vector3(), true, big ? 40 : 28, big ? 12 : 8);
    const tw = big ? 14 : 9;
    this.burnOuts.push({ pos: hulk.position.clone(), t: tw, t0: tw, interval: 0.3, acc: 0, big, r: radius });
  }

  // ---------------------------------------------------------------- primitive effects

  private blast(pos: THREE.Vector3, scale: number, large: boolean) {
    // flash, rolling fireballs, sparks and a fire-lit billow (FireSmokeFX.explosion), plus oily black smoke
    this.fx.explosion(pos.x, pos.y, pos.z, scale * (large ? 1.25 : 0.95));
    for (let i = 0; i < (large ? 4 : 2); i++) this.smokeAt(pos, scale * 1.1, 1.6 + Math.random());
    if (large) this.shockwave(pos, scale * 2.2);
  }

  /** Terran vehicle destroyed: the hull blows, then fuel and ammunition keep cooking off; heavy vehicles vent a jet of fire. */
  private mechDeath(type: string, pos: THREE.Vector3, ground: number, sc: number, big: boolean) {
    const heavy = big || type === 'thor' || type === 'thor_ap' || type === 'odin' || type === 'goliath' || type === 'cyclone';
    const r = sc * 0.5;
    // the hull bursts near the ground, throwing fire up and dust out
    this.fx.groundBlast(pos.x, ground, pos.z, sc * (heavy ? 1.15 : 0.9));
    // secondary cook-offs over the next second
    const pops = heavy ? 4 : 2;
    for (let i = 0; i < pops; i++) {
      this.delayed.push({ t: 0.18 + i * (0.22 + Math.random() * 0.2), fn: () => {
        const p = new THREE.Vector3(pos.x + (Math.random() - 0.5) * r * 1.6, ground + 0.4 + Math.random() * 0.5, pos.z + (Math.random() - 0.5) * r * 1.6);
        this.fx.explosion(p.x, p.y, p.z, sc * (0.35 + Math.random() * 0.25));
        this.fx.embers(p.x, p.y, p.z, 4, 3);
      } });
    }
    // ammunition going up through the hatch: a roaring column of fire
    if (heavy) this.delayed.push({ t: 0.35 + Math.random() * 0.3, fn: () => this.fx.fireColumn(pos.x, ground + 0.6 * sc, pos.z, 1.6 + sc, 0.9 * sc, 0.75) });
  }

  private puff(pos: THREE.Vector3, scale: number, life: number) {
    for (let i = 0; i < 3; i++) this.smokeAt(pos, scale, life + Math.random() * 0.4);
  }

  private splat(pos: THREE.Vector3, scale: number, big: boolean) {
    const n = big ? 10 : 6;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.sphereGeo, new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0x7fe040 : 0x4aa820, transparent: true, opacity: 0.95, depthWrite: false }));
      const s = scale * (0.18 + Math.random() * 0.25);
      m.scale.setScalar(s);
      m.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0));
      m.userData.o0 = 0.95;
      this.scene.add(m);
      const a = Math.random() * Math.PI * 2, sp = (2 + Math.random() * 3.5) * Math.sqrt(scale);
      this.fades.push({ mesh: m, t: 0, dur: 0.7 + Math.random() * 0.4, start: s, shrink: true, grow: 0, vel: new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp) });
    }
    this.flash(pos, scale * 0.8, 0xc8ff90);
  }

  private energyBurst(pos: THREE.Vector3, scale: number, big: boolean) {
    this.flash(pos, scale * (big ? 2.2 : 1.4), 0xffc7a0);
    this.shockwave(pos, scale * (big ? 3.4 : 2.2), 0xff8a50);
    for (let i = 0; i < (big ? 12 : 7); i++) {
      const m = new THREE.Mesh(this.sphereGeo, this.energyMat.clone());
      const s = scale * (0.12 + Math.random() * 0.18);
      m.scale.setScalar(s);
      m.position.copy(pos);
      m.userData.o0 = 0.9;
      this.scene.add(m);
      const a = Math.random() * Math.PI * 2, sp = (3 + Math.random() * 4) * Math.sqrt(scale);
      this.fades.push({ mesh: m, t: 0, dur: 0.6 + Math.random() * 0.5, start: s, shrink: true, grow: 0, vel: new THREE.Vector3(Math.cos(a) * sp, 1 + Math.random() * 4, Math.sin(a) * sp) });
    }
  }

  private flash(pos: THREE.Vector3, scale: number, color = 0xfff2c0) {
    if (color === 0xfff2c0) { this.fx.flash(pos.x, pos.y, pos.z, scale * 1.6); return; }
    const m = new THREE.Mesh(this.sphereGeo, this.flashMat.clone());
    (m.material as THREE.MeshBasicMaterial).color.set(color);
    m.position.copy(pos);
    m.scale.setScalar(scale * 0.6);
    m.userData.o0 = 1;
    this.scene.add(m);
    this.fades.push({ mesh: m, t: 0, dur: 0.28, start: scale * 0.6, shrink: false, grow: 1.4 });
  }

  private fireball(pos: THREE.Vector3, size: number, speed: number) {
    this.fx.fireball(pos.x, pos.y, pos.z, size * 0.9, speed);
  }

  /** Smoke rising from a crippled structure: the very same soft translucent puffs as the smoke after a unit dies. */
  public burnSmoke(pos: THREE.Vector3, radius: number, severity: number) {
    const ox = (Math.random() - 0.5) * radius * 1.3, oz = (Math.random() - 0.5) * radius * 1.3;
    // grey smoke when lightly damaged, thick black oily smoke once the fire takes hold
    this.fx.column(pos.x + ox * 0.7, pos.y + 0.2 + Math.random() * 0.4, pos.z + oz * 0.7, 1.3 + severity * 1.3, severity > 0.45, 0.5 + severity * 0.35);
  }

  /** Dark smoke puff (debris trails, falling aircraft, collapsing structures). */
  private smokeAt(pos: THREE.Vector3, size: number, dur = 1.4) {
    this.fx.smokeAt('black', {
      x: pos.x + (Math.random() - 0.5) * 0.3, y: pos.y, z: pos.z + (Math.random() - 0.5) * 0.3,
      vx: (Math.random() - 0.5) * 0.5, vy: 1.0 + Math.random() * 0.7, vz: (Math.random() - 0.5) * 0.5,
      life: dur * 1.4, s0: size * 0.5, s1: size * 1.9, rise: 0.15, drag: 0.6, i: 0.6
    });
  }

  private shockwave(pos: THREE.Vector3, radius: number, color = 0xffd9a0) {
    const m = new THREE.Mesh(this.ringGeo, this.ringMat.clone());
    (m.material as THREE.MeshBasicMaterial).color.set(color);
    m.position.set(pos.x, ProceduralGrassSystem.getTerrainHeight(pos.x, pos.z) + 0.15, pos.z);
    m.scale.setScalar(radius * 0.2);
    m.userData.o0 = 0.8;
    this.scene.add(m);
    this.fades.push({ mesh: m, t: 0, dur: 0.55, start: radius * 0.2, shrink: false, grow: 4.0 });
  }

  /** Ground stain (scorch / ichor) that slowly fades out. */
  private mark(x: number, z: number, ground: number, radius: number, tex: THREE.Texture, life: number, opacity: number) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    const m = new THREE.Mesh(this.decalGeo, mat);
    m.position.set(x, ground + 0.06, z);
    m.rotation.y = Math.random() * Math.PI * 2;
    m.scale.set(radius * (0.9 + Math.random() * 0.3), 1, radius * (0.9 + Math.random() * 0.3));
    m.renderOrder = 1;
    m.userData.o0 = opacity;
    this.scene.add(m);
    // long fade: shrink = false, grow = 0, so only opacity changes
    this.fades.push({ mesh: m, t: 0, dur: life, start: 1, shrink: false, grow: 0 });
  }

  /** Flying chunks of wreckage that bounce and settle on the ground. */
  private chunks(pos: THREE.Vector3, mats: THREE.Material[], count: number, size: number, power: number, glow = false, restMax = 22) {
    for (let i = 0; i < count; i++) {
      if (this.debris.length >= DeathEffects.MAX_DEBRIS) {
        const old = this.debris.shift()!;
        this.scene.remove(old.mesh);
      }
      const geo = Math.random() < 0.5 ? this.boxGeo : this.slabGeo;
      const m = new THREE.Mesh(geo, mats[Math.floor(Math.random() * mats.length)]!);
      const s = size * (0.14 + Math.random() * 0.3);
      m.scale.set(s * (0.7 + Math.random()), s * (0.5 + Math.random() * 0.7), s * (0.7 + Math.random()));
      m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * size * 0.5, 0.2, (Math.random() - 0.5) * size * 0.5));
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      m.castShadow = !glow;
      this.scene.add(m);
      const a = Math.random() * Math.PI * 2, sp = power * (0.35 + Math.random() * 0.8);
      this.registerDebris(
        m,
        new THREE.Vector3(Math.cos(a) * sp, power * (0.7 + Math.random() * 0.9), Math.sin(a) * sp),
        new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
        false, restMax * (0.6 + Math.random() * 0.6), glow ? 0 : 1.2 + Math.random() * 1.5
      );
    }
  }

  private registerDebris(mesh: THREE.Mesh, vel: THREE.Vector3, spin: THREE.Vector3, settled: boolean, restMax: number, smoke: number) {
    this.debris.push({ mesh, vel, spin, life: 0, settled, rest: 0, restMax, smoke });
  }
}
