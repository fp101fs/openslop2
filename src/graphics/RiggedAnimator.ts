import * as THREE from 'three';
import { BUILDING_CONFIGS } from '../config';
import type { RigInstance, RigKind } from './RiggedModels';

/**
 * Plays the clips baked into the Siege Tank / Thor / Goliath models. A small state machine picks the clip from what the unit
 * is really doing (measured from its motion and combat events), cross-fades between them, and keeps every clip in use:
 *
 *   base layer  idle (stand / stand 01-02 / frozen walk pose) <-> walk (timeScale follows ground speed)
 *   one-shots   fidgets and turret looks while idle, rare dance clips after a long idle, spell on Hold Position,
 *               spawn intro (Thor morph / Goliath unload), victory pose when the player wins
 *   combat      Thor: looping attack (ground / air variants) while it keeps firing
 *               Tank + Goliath: one attack clip per shot, layered over the walk / idle base
 */
interface Cfg {
  walk: string;
  /** Idle clips played as the base layer (alternated each cycle). `frozen` = hold the first frame of a clip instead. */
  idle: string[]; idleFrozen?: string;
  fidgets: string[]; looks: string[]; dances: string[];
  attack: { ground: string; air?: string; air2?: string; alt?: string; mode: 'loop' | 'shot' };
  intro?: string; spell?: string; victory?: string;
  walkScale: number;
  /** Sieged variant (Siege Tank): idle loop + fidgets while deployed. */
  siegeIdle?: string[]; siegeFidgets?: string[];
  /** Worker clips: working in place (build / repair / mine), and the carrying variants of walk and idle. */
  work?: string; walkCarry?: string; idleCarry?: string;
}

/** How far the lowered Supply Depot sinks (world units; the raised model is ~0.8 tall). */
const DEPOT_SINK = 0.62;

const CFG: Partial<Record<RigKind, Cfg>> = {
  marine: { walk: 'run_baked', idle: ['idle2_bake'], fidgets: [], looks: [], dances: [], attack: { ground: '', mode: 'shot' }, walkScale: 1 },
  scv: {
    walk: 'walk', idle: ['stand', 'stand_01'], fidgets: ['fidget', 'fidget_01', 'fidget_02'], looks: ['stand_left', 'stand_right'], dances: [],
    attack: { ground: 'attack', mode: 'shot' }, intro: 'stand_start', work: 'work', walkCarry: 'walk_gather', idleCarry: 'stand_gather', walkScale: 1
  },
  marauder: { walk: 'walk', idle: ['stand'], fidgets: ['fidget'], looks: [], dances: [], attack: { ground: 'attack_left', alt: 'attack_right', mode: 'shot' }, walkScale: 1 },
  medivac: { walk: 'walk', idle: ['stand'], fidgets: [], looks: [], dances: [], attack: { ground: '', mode: 'shot' }, walkScale: 1 },
  hellion: { walk: 'walk', idle: [], idleFrozen: 'walk', fidgets: [], looks: [], dances: [], attack: { ground: 'attack', mode: 'shot' }, walkScale: 1 },
  probe: { walk: 'action_stash.001', idle: ['action_stash'], fidgets: [], looks: [], dances: [], attack: { ground: 'action_stash.002', mode: 'shot' }, walkScale: 1 },
  banshee: { walk: 'walk', idle: ['stand'], fidgets: [], looks: [], dances: [], attack: { ground: 'attack', mode: 'shot' }, walkScale: 1 },
  reaper: { walk: 'walk', idle: ['stand'], fidgets: ['fidget'], looks: [], dances: [], attack: { ground: 'attack', mode: 'shot' }, walkScale: 1 },
  ghost: { walk: 'soldier_reference_skeleton|a_walkn', idle: ['soldier_reference_skeleton|combatidle1'], fidgets: ['soldier_reference_skeleton|idle1'], looks: [], dances: [], attack: { ground: 'soldier_reference_skeleton|shootar2s', mode: 'shot' }, walkScale: 1 },
  nova: { walk: 'walk', idle: ['stand'], fidgets: [], looks: [], dances: [], attack: { ground: '', mode: 'shot' }, walkScale: 1 },
  raven: { walk: 'walk', idle: ['stand_01'], fidgets: ['fidget'], looks: [], dances: [], attack: { ground: '', mode: 'shot' }, spell: 'spell', walkScale: 1 },
  battlecruiser: { walk: 'walk', idle: [], idleFrozen: 'walk', fidgets: [], looks: [], dances: [], attack: { ground: '', mode: 'shot' }, walkScale: 1 },
  liberator: { walk: 'stand', idle: ['stand'], fidgets: [], looks: [], dances: [], attack: { ground: '', mode: 'shot' }, walkScale: 1 },
  roach: { walk: 'walk_forward', idle: ['stand'], fidgets: [], looks: [], dances: [], attack: { ground: 'spell_a', mode: 'shot' }, walkScale: 2.2 },
  mutalisk: { walk: 'walk', idle: ['stand', 'stand_01', 'stand_02'], fidgets: [], looks: [], dances: [], attack: { ground: 'attack', mode: 'shot' }, intro: 'birth', walkScale: 1 },
  queen: {
    walk: 'walk', idle: ['stand', 'stand_01', 'stand_02'], fidgets: [], looks: ['stand_left_ready', 'stand_right_ready'], dances: [],
    attack: { ground: 'attack', mode: 'shot' }, spell: 'spell_c', walkScale: 1
  },
  zealot: { walk: 'walk', idle: ['stand'], fidgets: [], looks: [], dances: [], attack: { ground: '', mode: 'shot' }, walkScale: 1 },
  hydralisk: { walk: 'action_stash', idle: ['action_stash.002'], fidgets: ['action_stash.003'], looks: [], dances: [], attack: { ground: 'action_stash.001', mode: 'shot' }, walkScale: 1 },
  baneling: { walk: 'walk_forward_fast', idle: ['stand'], fidgets: [], looks: [], dances: [], attack: { ground: 'spell_a', mode: 'shot' }, walkScale: 3 },
  ravager: { walk: 'walk', idle: [], idleFrozen: 'walk', fidgets: [], looks: [], dances: [], attack: { ground: '', mode: 'shot' }, walkScale: 1 },
  ultralisk: { walk: 'stand_01', idle: ['stand_03', 'stand_01'], fidgets: [], looks: [], dances: [], attack: { ground: '', mode: 'shot' }, walkScale: 2 },
  broodlord: { walk: 'walk', idle: ['stand', 'stand_01', 'stand_02'], fidgets: [], looks: [], dances: [], attack: { ground: 'stand_work_end', mode: 'shot' }, walkScale: 1 },
  viper: { walk: 'walk', idle: ['stand_02'], fidgets: [], looks: [], dances: [], attack: { ground: '', mode: 'shot' }, spell: 'spell', walkScale: 1 },
  stalker: {
    walk: 'action_stash.007', idle: ['action_stash.002', 'action_stash.006', 'action_stash.008'], fidgets: ['action_stash.003', 'action_stash.005'], looks: [], dances: [],
    attack: { ground: 'action_stash', alt: 'action_stash.001', mode: 'shot' }, walkScale: 1
  },
  void_ray: { walk: 'action_stash.001', idle: ['action_stash'], fidgets: [], looks: ['action_stash.002'], dances: [], attack: { ground: '', mode: 'shot' }, walkScale: 1 },
  // Sketchfab SC2 rips: clip names go through clipKey (Armature_Stand 01_full -> stand_01)
  cyclone: { walk: 'walk', idle: ['stand'], fidgets: ['fidget'], looks: [], dances: [], attack: { ground: 'attack', mode: 'shot' }, walkScale: 1 },
  odin: { walk: 'stand_work', idle: ['stand'], fidgets: [], looks: [], dances: [], attack: { ground: 'stand_work_end', mode: 'shot' }, walkScale: 0.5 },
  overlord: { walk: '', idle: [], fidgets: [], looks: [], dances: [], attack: { ground: '', mode: 'shot' }, walkScale: 1 },
  swarm_host: { walk: '', idle: [], fidgets: [], looks: [], dances: [], attack: { ground: '', mode: 'shot' }, walkScale: 1 },
  immortal: { walk: 'walk', idle: ['stand', 'stand_01', 'stand_02'], fidgets: [], looks: [], dances: [], attack: { ground: '', mode: 'shot' }, walkScale: 1 },
  colossus: { walk: 'walk', idle: ['stand'], fidgets: [], looks: [], dances: [], attack: { ground: 'stand_work_b', mode: 'shot' }, walkScale: 1 },
  carrier: { walk: 'action_stash.001', idle: ['action_stash'], fidgets: [], looks: ['action_stash.002'], dances: [], attack: { ground: '', mode: 'shot' }, walkScale: 1 },
  tempest: { walk: '', idle: [], fidgets: [], looks: [], dances: [], attack: { ground: '', mode: 'shot' }, walkScale: 1 },
  adept: { walk: 'walk', idle: ['stand', 'stand_01'], fidgets: [], looks: [], dances: [], attack: { ground: '', mode: 'shot' }, spell: 'spell', walkScale: 1 },
  archon: { walk: 'walk_01', idle: ['stand_02'], fidgets: [], looks: [], dances: [], attack: { ground: 'attack', alt: 'attack_01', mode: 'shot' }, walkScale: 1 },
  // the "Story" tank model only ships Stand clips (no walk / attack). Its 'stand' clip is a 9.3 s loop that lowers and raises the
  // stabilizer feet (Object95_11 / objObject21_15...), which only belong to Siege Mode, so Tank Mode uses 'stand_01' (stabilizers stowed).
  siege_tank: {
    walk: 'stand_01', idle: ['stand_01'], fidgets: [], looks: [], dances: [], attack: { ground: '', mode: 'shot' }, walkScale: 0.5,
    siegeIdle: ['stand_work'], siegeFidgets: ['stand_work_01']
  },
  thor: {
    walk: 'walk', idle: ['stand_01', 'stand_02'], fidgets: ['fidget_01'], looks: [],
    dances: ['stand_dance', 'stand_dance_01', 'stand_dance_02', 'stand_dance_03', 'stand_dance_04'],
    attack: { ground: 'attack', air: 'attack_superior', air2: 'attack_inferior', mode: 'loop' }, intro: 'morph', spell: 'spell', victory: 'stand_victory', walkScale: 1
  },
  goliath: {
    walk: 'walk', idle: ['stand'], fidgets: ['fidget', 'fidget_01', 'fidget_02'], looks: ['stand_left', 'stand_right'], dances: [],
    attack: { ground: 'attack_turret', mode: 'shot' }, intro: 'unload_end', spell: 'spell', victory: 'fidget_02', walkScale: 1
  }
};

const FADE = 0.22;

interface RS {
  rig: RigInstance; cfg: Cfg; act: Map<string, THREE.AnimationAction>;
  base: string | null; oneShot: string | null; oneShotEnd: number; t: number;
  lastX: number; lastY: number; speed: number; moving: number;
  attackUntil: number; airAttack: boolean; airAlt: boolean; shotAct: THREE.AnimationAction | null;
  idleFor: number; nextFidget: number; nextLook: number; nextDance: number; idleIx: number; introEnd: number; victory: boolean;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(l: T[]) => l[Math.floor(Math.random() * l.length)]!;

/** Buildings: clips per state. `build` is scrubbed with construction progress, `work` plays while the production queue is busy. */
const BCFG: Record<string, { idle?: string; work?: string; build?: string; extra?: string; shot?: string }> = {
  factory: { idle: 'stand', work: 'stand_work' },
  starport: { idle: 'stand', work: 'stand_work' },
  missile_turret: { build: 'build_c_start', shot: 'attack' },
  bunker: {},
  refinery: {}, mineral_patch: {}, vespene_geyser: {}, techlab_barracks: {}, techlab_starport: {}, mule: {},
  barracks: { idle: 'stand', work: 'stand_work', build: 'build_c_start', extra: 'glstand_redlight' },
  command_center: { idle: 'stand_b', work: 'stand_work', build: 'build_c_start' },
  orbital_command: { idle: 'stand_work_b' },
  planetary_fortress: { idle: 'stand_b', work: 'stand_work' },
  techlab: {},
  reactor: {},
  spawning_pool: { idle: 'stand', build: 'build_a_start' },
  nexus: { idle: 'stand' },
  gateway: { idle: 'action_stash' },
  hatchery: { idle: 'action_stash' },
  supply_depot: {},
  supply_depot_lowered: {}
};

export class RiggedAnimator {
  /** A defensive structure fired (Missile Turret attack clip). */
  public static buildingShot(b: any) {
    const s = b.mesh?.userData.bRig; if (s) s.shot = true;
  }

  /** Animated building (Barracks / Command Center). */
  public static updateBuilding(b: any, dt: number) {
    const mesh = b.mesh as THREE.Object3D | undefined;
    const rig = mesh?.userData.rigged as RigInstance | undefined;
    const cfg = BCFG[b.type];
    if (!mesh || !cfg || dt <= 0 || !mesh.visible) return;
    // clip-less construction: the model rises out of the ground as it is built
    if (!cfg.build && BUILDING_CONFIGS[b.type as keyof typeof BUILDING_CONFIGS]?.race === 'terran') { const k = b.isConstructed ? 1 : 0.25 + 0.75 * Math.min(1, b.buildProgress ?? 0); if (mesh.scale.y !== k) mesh.scale.y = k; }
    const depot = mesh.userData.depotRig as THREE.Object3D | undefined;
    if (depot && (b.type === 'supply_depot' || b.type === 'supply_depot_lowered')) {
      // static depot model: lowering sinks it into the ground (0 = raised, 1 = lowered), eased like the old clip
      const target = b.type === 'supply_depot_lowered' ? 1 : 0;
      const cur: number = b.depotSink ?? target;
      b.depotSink = cur + Math.sign(target - cur) * Math.min(Math.abs(target - cur), dt * 1.4);
      depot.position.y = -b.depotSink * DEPOT_SINK;
      return;
    }
    if (!rig || !(rig as any).mixer) return;
    if (b.type === 'supply_depot' || b.type === 'supply_depot_lowered') {
      // Raise_Lower: t=2.5 is raised, t=0 / 5 lowered. Ease towards the pose for the depot's current state (persists across model swaps).
      const clip = rig.clips['raise_lower'];
      if (clip) {
        const target = b.type === 'supply_depot_lowered' ? 5 : 2.5;
        const cur: number = b.depotT ?? target;
        b.depotT = cur + Math.sign(target - cur) * Math.min(Math.abs(target - cur), dt * 1.7);
        const a = rig.mixer.clipAction(clip);
        a.paused = false; a.timeScale = 0; a.play(); a.time = b.depotT;
        rig.mixer.update(0);
      }
      return;
    }
    let s = mesh.userData.bRig as { act: Map<string, THREE.AnimationAction>; cur: string | null; shot: boolean } | undefined;
    if (!s) s = mesh.userData.bRig = { act: new Map(), cur: null, shot: false };
    const get = (n: string) => {
      let a = s!.act.get(n);
      if (!a) { const c = rig.clips[n]; if (!c) return null; a = rig.mixer.clipAction(c); s!.act.set(n, a); }
      return a;
    };
    // Lift-off / flight / landing: the Command Center model ships fly clips (legs fold, thrusters light); rise and descent are scrubbed with liftT
    if (b.liftState && b.liftState !== 'grounded' && rig.clips['fly_start']) {
      const st = b.liftState as string;
      const name = st === 'rising' ? 'fly_start' : st === 'landing' ? 'fly_end_a' : (b.flyDest ? 'fly_walk' : 'fly_stand');
      if (s.cur !== name) {
        const next = get(name);
        if (next) {
          const prev = s.cur ? s.act.get(s.cur) : null;
          next.reset().setEffectiveWeight(1).fadeIn(0.2).play();
          next.setLoop(st === 'flying' ? THREE.LoopRepeat : THREE.LoopOnce, st === 'flying' ? Infinity : 1);
          next.clampWhenFinished = true;
          prev?.fadeOut(0.2);
          s.cur = name;
        }
      }
      const a = get(name);
      if (a) {
        if (st === 'flying') { a.timeScale = 1; a.paused = false; }
        else { a.paused = false; a.timeScale = 0; a.time = Math.min(0.999, b.liftT ?? 0) * a.getClip().duration; }
      }
      rig.mixer.update(dt);
      return;
    } else if (s.cur && /^fly_/.test(s.cur)) {
      // back on the ground: drop the fly pose and let the idle clip take over
      const a = s.act.get(s.cur); a?.fadeOut(0.2); s.cur = null;
    }
    const want = !b.isConstructed ? cfg.build : (b.queue && b.queue.length > 0 ? cfg.work ?? cfg.idle : cfg.idle);
    if (want && s.cur !== want) {
      const next = get(want);
      if (next) {
        const prev = s.cur ? s.act.get(s.cur) : null;
        next.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).fadeIn(0.3).play();
        prev?.fadeOut(0.3);
        s.cur = want;
        if (cfg.extra) { const e = get(cfg.extra); if (e && !e.isRunning()) e.play(); }
      }
    }
    if (b.isConstructed && s.shot) { const a = get(cfg.shot!); if (a) { a.reset().setLoop(THREE.LoopOnce, 1).play(); a.clampWhenFinished = false; } s.shot = false; }
    if (want && want === cfg.build) {
      const a = get(want);
      if (a) { a.paused = false; a.timeScale = 0; a.time = Math.min(0.999, b.buildProgress ?? 0) * a.getClip().duration; }
    }
    rig.mixer.update(dt);
  }

  private static state(mesh: THREE.Object3D, unit: any): RS | null {
    let s = mesh.userData.rigState as RS | undefined;
    if (s) return s;
    const rig = mesh.userData.rigged as RigInstance | undefined;
    if (!rig) return null;
    const cfg = CFG[rig.kind];
    if (!cfg) return null;
    s = {
      rig, cfg, act: new Map(), base: null, oneShot: null, oneShotEnd: 0, t: 0, lastX: unit.pos.x, lastY: unit.pos.y, speed: 0, moving: 0,
      attackUntil: 0, airAttack: false, airAlt: false, shotAct: null, idleFor: 0, nextFidget: rnd(4, 9), nextLook: rnd(3, 7), nextDance: rnd(25, 45), idleIx: 0, introEnd: 0, victory: false
    };
    mesh.userData.rigState = s;
    if (cfg.intro && rig.clips[cfg.intro] && unit.type !== 'siege_tank_sieged' && !mesh.userData.noIntro) this.startOneShot(s, cfg.intro, true);
    return s;
  }

  private static action(s: RS, name: string): THREE.AnimationAction | null {
    let a = s.act.get(name);
    if (!a) {
      const clip = s.rig.clips[name];
      if (!clip) return null;
      a = s.rig.mixer.clipAction(clip);
      s.act.set(name, a);
    }
    return a;
  }

  /** Cross-fade the base layer to `name`. */
  private static setBase(s: RS, name: string, opts: { loop?: boolean; timeScale?: number; frozen?: boolean } = {}) {
    const next = this.action(s, name);
    if (!next) return;
    const cur = s.base && s.base !== name ? s.act.get(s.base) : null;
    if (s.base !== name) {
      next.reset().setLoop(opts.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = opts.loop === false;
      next.enabled = true;
      next.setEffectiveWeight(1).fadeIn(FADE).play();
      cur?.fadeOut(FADE);
      s.base = name;
    }
    next.timeScale = opts.frozen ? 0 : (opts.timeScale ?? 1);
    if (opts.frozen) next.time = 0;
  }

  /** Play a clip once on top of everything (fidget, intro, spell...). */
  private static startOneShot(s: RS, name: string, intro = false, loop = false) {
    const a = this.action(s, name);
    if (!a) return;
    if (s.oneShot && s.oneShot !== name) s.act.get(s.oneShot)?.fadeOut(FADE);
    a.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = true;
    a.enabled = true; a.timeScale = 1;
    a.setEffectiveWeight(1).fadeIn(FADE).play();
    s.base && s.act.get(s.base)?.fadeOut(FADE);
    s.base = null; // base re-fades in once the one-shot ends
    s.oneShot = name;
    s.oneShotEnd = loop ? Infinity : s.t + a.getClip().duration - FADE;
    if (intro) s.introEnd = s.oneShotEnd;
  }

  /** The unit just fired. */
  public static triggerAttack(unit: any, target?: any) {
    const mesh = unit.mesh as THREE.Object3D | undefined;
    if (!mesh) return;
    const s = this.state(mesh, unit);
    if (!s) return;
    const cd = 1 / Math.max(0.2, unit.attackSpeed || 1);
    const newBurst = s.t >= s.attackUntil;
    s.airAttack = !!(target && target.isFlying);
    if (s.airAttack && newBurst) s.airAlt = Math.random() < 0.5; // each new air-attack burst uses one of the two air variants
    s.attackUntil = s.t + cd + 0.45;
    if (s.cfg.attack.mode === 'shot') {
      s.airAlt = !s.airAlt;
      const clipName = s.cfg.attack.alt && s.airAlt ? s.cfg.attack.alt : s.cfg.attack.ground;
      const a = this.action(s, clipName);
      if (!a) return;
      // squeeze one full recoil cycle into the weapon cooldown (never slower than the clip's natural speed)
      const dur = a.getClip().duration;
      a.reset().setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = false;
      a.timeScale = Math.max(1, dur / Math.max(0.3, cd * 0.95));
      a.setEffectiveWeight(1).fadeIn(0.05).play();
      s.shotAct = a;
    }
  }

  /** Siege Tank deploy / undeploy: play the model's own transform clip, squeezed into the transform time, ending on the final pose. */
  public static transformSiege(unit: any, toSieged: boolean, seconds: number) {
    const mesh = unit.mesh as THREE.Object3D | undefined;
    const s = mesh && this.state(mesh, unit);
    if (!s) return;
    const name = toSieged ? 'stand_work_start' : 'stand_work_end';
    this.startOneShot(s, name);
    const a = this.action(s, name);
    if (!a) return;
    a.timeScale = a.getClip().duration / Math.max(0.5, seconds);
    s.oneShotEnd = Infinity; // holds the last pose until the Unit morphs into its new type (fresh mesh)
  }

  /** Thor payload switch (Explosive <-> High Impact): the model's Spell clip (shoulder cannons cycle), squeezed into the transform and held. */
  public static transformThor(unit: any, seconds: number) {
    const mesh = unit.mesh as THREE.Object3D | undefined;
    const s = mesh && this.state(mesh, unit);
    if (!s || !s.cfg.spell) return;
    s.attackUntil = 0; // a firing loop would otherwise override the transform clip
    this.startOneShot(s, s.cfg.spell);
    const a = this.action(s, s.cfg.spell);
    if (!a) return;
    a.timeScale = a.getClip().duration / Math.max(0.3, seconds);
    s.oneShotEnd = Infinity; // released when the Unit morphs (fresh mesh)
  }

  /** Hold Position / ability: play the spell clip. */
  public static cast(unit: any) {
    const mesh = unit.mesh as THREE.Object3D | undefined;
    const s = mesh && this.state(mesh, unit);
    if (s && s.cfg.spell && s.moving < 0.1 && !s.victory) this.startOneShot(s, s.cfg.spell);
  }

  /** Match won: strike the victory pose. */
  public static victory(unit: any) {
    const mesh = unit.mesh as THREE.Object3D | undefined;
    const s = mesh && this.state(mesh, unit);
    if (s && s.cfg.victory && !s.victory) { s.victory = true; this.startOneShot(s, s.cfg.victory, false, true); }
  }

  public static update(unit: any, dt: number, _world: any) {
    const mesh = unit.mesh as THREE.Object3D | undefined;
    if (!mesh || dt <= 0 || !mesh.userData.rigged) return;
    const s = this.state(mesh, unit);
    if (!s) return;
    const cfg = s.cfg;

    s.t += dt;
    const dist = Math.min(2, Math.hypot(unit.pos.x - s.lastX, unit.pos.y - s.lastY));
    s.lastX = unit.pos.x; s.lastY = unit.pos.y;
    s.speed += (dist / dt - s.speed) * Math.min(1, dt * 8);
    const ref = Math.max(0.5, unit.baseSpeed || 2.5);
    s.moving += (Math.min(1.6, s.speed / ref) - s.moving) * Math.min(1, dt * 9);

    if (!mesh.visible) return; // hidden by fog: keep the timers, skip the (relatively costly) skinning update
    const sieged = unit.type === 'siege_tank_sieged';
    const attacking = s.t < s.attackUntil;
    const walking = s.moving > 0.14 && !sieged;
    const carrying = (unit.carriedAmount ?? 0) > 0;
    const cmd = unit.currentCommand?.type;
    const working = !!cfg.work && s.moving < 0.1 && !carrying && (cmd === 'repair' || cmd === 'build' || cmd === 'gather');
    const busy = s.oneShot !== null && s.t < s.oneShotEnd && !s.victory;
    if (s.oneShot && !busy && !s.victory) { s.act.get(s.oneShot)?.fadeOut(FADE); s.oneShot = null; }

    if (s.victory) {
      // holds the victory pose
    } else if (walking) {
      if (s.oneShot) { s.act.get(s.oneShot)?.fadeOut(FADE); s.oneShot = null; }
      this.setBase(s, carrying && cfg.walkCarry && s.rig.clips[cfg.walkCarry] ? cfg.walkCarry : cfg.walk, { timeScale: Math.max(0.3, Math.min(1.8, s.moving)) * cfg.walkScale });
      s.idleFor = 0;
    } else if (attacking && cfg.attack.mode === 'loop') {
      if (s.oneShot) { s.act.get(s.oneShot)?.fadeOut(FADE); s.oneShot = null; }
      const air = unit.type === 'thor_ap' ? cfg.attack.air : unit.type === 'thor' && cfg.attack.air2 && s.rig.clips[cfg.attack.air2] ? cfg.attack.air2
        : s.airAlt && cfg.attack.air2 && s.rig.clips[cfg.attack.air2] ? cfg.attack.air2 : cfg.attack.air;
      const name = s.airAttack && air && s.rig.clips[air] ? air : cfg.attack.ground;
      this.setBase(s, name, { timeScale: 1 });
      s.idleFor = 0;
    } else if (working && s.rig.clips[cfg.work!]) {
      if (s.oneShot) { s.act.get(s.oneShot)?.fadeOut(FADE); s.oneShot = null; }
      this.setBase(s, cfg.work!, { timeScale: 1 });
      s.idleFor = 0;
    } else if (busy) {
      // a fidget / intro / spell is playing; it hands back to the base layer when it ends
    } else {
      // idle
      const idleList = sieged && cfg.siegeIdle ? cfg.siegeIdle : cfg.idle;
      if (cfg.idleFrozen) this.setBase(s, cfg.idleFrozen, { frozen: true });
      else if (carrying && cfg.idleCarry && s.rig.clips[cfg.idleCarry]) this.setBase(s, cfg.idleCarry);
      else if (idleList.length) {
        const name = idleList[s.idleIx % idleList.length]!;
        const a = this.action(s, name);
        if (s.base !== name) this.setBase(s, name);
        else if (a && idleList.length > 1 && a.time >= a.getClip().duration - 0.3) { s.idleIx++; this.setBase(s, idleList[s.idleIx % idleList.length]!); }
      }
      if (!attacking) {
        s.idleFor += dt;
        const fidgets = sieged && cfg.siegeFidgets ? cfg.siegeFidgets : cfg.fidgets;
        if (s.idleFor > s.nextFidget && fidgets.length) { s.nextFidget = s.idleFor + rnd(6, 14); this.startOneShot(s, pick(fidgets)); }
        else if (s.idleFor > s.nextLook && cfg.looks.length) { s.nextLook = s.idleFor + rnd(4, 9); this.startOneShot(s, pick(cfg.looks)); }
        else if (s.idleFor > s.nextDance && cfg.dances.length) { s.nextDance = s.idleFor + rnd(20, 40); if (Math.random() < 0.4) this.startOneShot(s, pick(cfg.dances)); }
      }
    }
    s.rig.mixer.update(dt);
    if (s.rig.kind === 'banshee') this.spinBansheeRotors(mesh, s, unit, dt);
  }

  /** Banshee rotor blades: spin very slowly at rest, faster the faster the Banshee moves (smoothed, so they spool up and down). */
  private static spinBansheeRotors(mesh: THREE.Object3D, s: RS, unit: any, dt: number) {
    let r = mesh.userData.rotors as { blades: THREE.Object3D[]; w: number } | undefined;
    if (!r) {
      const blades: THREE.Object3D[] = [];
      mesh.traverse(o => { if (/Banshee_Blade0[12]_/.test(o.name)) blades.push(o); });
      r = mesh.userData.rotors = { blades, w: 1.2 };
    }
    const target = 1.2 + Math.min(1, (s.speed ?? 0) / 4.5) * 22; // rad/s: ~0.2 rev/s idle, ~3.5 rev/s at speed
    r.w += (target - r.w) * Math.min(1, dt * 2.5);
    for (const b of r.blades) b.rotateZ(r.w * dt * (b.name.includes('Blade01') ? -1 : 1)); // spin about the blade's local Z (the disc normal, i.e. the cowl's axis); the two rotors turn in opposite directions
  }
}
