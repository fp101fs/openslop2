/**
 * Headless GameWorld for tests and AI audits: the real simulation (pathfinding, creep, larva, production, tech gating, the AI)
 * with the renderer, fog, particles, decals and sound replaced by inert stubs. Import this BEFORE anything that pulls in
 * GameWorld, because the graphics modules touch `document` at import time.
 */
import * as THREE from 'three';
import type { MatchConfig } from '../types';

// An object that absorbs any property access, call or construction (stands in for canvases, WebGL, audio, DOM...)
const inert: any = new Proxy(function () {}, {
  get: (_t, k) => k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? function* () {} : k === 'length' ? 0 : k === 'then' ? undefined : inert,
  apply: () => inert, construct: () => inert, set: () => true,
});
const g = globalThis as any;
g.document ??= { createElement: () => inert, createElementNS: () => inert, body: inert, addEventListener() {}, getElementById: () => null, querySelector: () => null };
g.window ??= g;
g.Image ??= class {};
g.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

export type Race = 'terran' | 'zerg' | 'protoss';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'insane' | 'elite' | 'cheater';

export interface AuditResult {
  /** Every unit type the AI fielded (including morph results like Baneling / Lurker / Archon). */
  units: Set<string>;
  /** Every structure type the AI completed (Lair / Hive / Orbital / Warp Gate count as their own entries). */
  buildings: Set<string>;
  /** Game second each unit / structure first appeared. */
  firstSeen: Record<string, number>;
  world: any;
}

export async function makeWorld(cfg: Partial<MatchConfig>) {
  const { GameWorld } = await import('../simulation/GameWorld');
  const w: any = new GameWorld(new THREE.Scene(), inert, inert, inert, inert);
  w.configureMatch({ mode: 'skirmish', playerFaction: 'terran', mapId: 'sector_vanguard', ...cfg });
  return w;
}

/**
 * Run a skirmish for `minutes` of game time with the AI on the enemy slot and an idle player, recording what the AI builds.
 * The AI never launches attacks (so its army survives and the match can't end early); everything else is the normal AI.
 */
export async function runAudit(race: Race, difficulty: Difficulty, minutes: number, opts: { dt?: number; playerFaction?: Race } = {}): Promise<AuditResult> {
  const w = await makeWorld({ enemyFaction: race, difficulty, playerFaction: opts.playerFaction ?? 'terran' });
  const ai = w.ai as any;
  const dt = opts.dt ?? 1 / 20;
  const units = new Set<string>(), buildings = new Set<string>(), firstSeen: Record<string, number> = {};
  const mark = (set: Set<string>, t: string) => { if (!set.has(t)) { set.add(t); firstSeen[t] = Math.round(w.gameTime); } };
  // the free starting units / ramp defense from map setup don't count as built by the AI
  const starting = new Set<string>([...w.units, ...w.buildings].filter((e: any) => e.playerId === 'enemy' && !['scv', 'drone', 'probe', 'command_center', 'hatchery', 'nexus'].includes(e.type)).map((e: any) => e.id));
  let sample = 0;
  for (let t = 0; t < minutes * 60; t += dt) {
    ai.attackThreshold = 1e9; ai.harassNext = 1e9; // keep the army at home
    // the idle player (no starting flyer, workers that don't fight) can't hold off a Nydus attack: keep its structures standing
    // so the match never ends early and the AI keeps teching for the whole audit
    for (const b of w.buildings) if (b.playerId === 'player' && !b.isDead) b.health = b.maxHealth;
    w.update(dt);
    if ((sample += dt) < 0.5) continue;
    sample = 0;
    for (const u of w.units) if (u.playerId === 'enemy' && !u.isDead && !starting.has(u.id) && u.type !== 'larva' && u.type !== 'egg' && !u.morph) mark(units, u.type);
    for (const b of w.buildings) {
      if (b.playerId !== 'enemy' || b.isDead || !b.isConstructed || starting.has(b.id)) continue;
      mark(buildings, b.type);
      if (b.type === 'hatchery' && b.tier >= 1) mark(buildings, 'lair');
      if (b.type === 'hatchery' && b.tier >= 2) mark(buildings, 'hive');
      if (b.type === 'gateway' && b.warpGate) mark(buildings, 'warp_gate');
    }
  }
  for (const t of ai.stats?.warpIns ?? []) mark(units, 'warpin:' + t);
  if (ai.stats?.merges) mark(units, 'merge:archon');
  if (ai.stats?.nydus) mark(buildings, 'nydus_worm');
  return { units, buildings, firstSeen, world: w };
}

/**
 * Make shots land in a headless world: weapon damage is applied in the projectile effect's onHit callback, which the inert
 * particle stub never calls. This stub calls every function argument of a `spawn*` call at once (impact = the target point),
 * so combat resolves like in the game minus travel time. Used by mission autoplay (tools/campaign/autoplay.ts).
 */
export function instantHits(w: any) {
  const hit = (args: any[]) => {
    const at = args.find(a => a && typeof a === 'object' && 'x' in a && 'z' in a) ?? { x: 0, y: 0, z: 0 };
    const p = new THREE.Vector3(at.x, at.y ?? 0, at.z);
    for (const a of args) if (typeof a === 'function') a(p);
    return inert;
  };
  w.particles = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k.startsWith('spawn') ? (...a: any[]) => hit(a) : k === 'fx' ? inert : inert) });
  return w;
}
