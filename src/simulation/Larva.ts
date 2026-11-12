import * as THREE from 'three';
import type { UnitType } from '../types';
import { UNIT_CONFIGS } from '../config';
import type { Unit } from './Unit';
import { isWorkerType } from '../config';
import type { Building } from './Building';
import { LARVA_MAX, LARVA_REGEN, usesLarva } from './Mechanics';

/**
 * Zerg larva, as in SC2: a Hatchery spawns real, selectable Larva units around itself (one every 11s while it has fewer than 3;
 * a Queen's Inject Larva adds 3 more after 29s, up to 19). Selecting larva opens the Zerg unit-morph card; morphing turns a larva into an
 * Egg (same unit object, 200 HP / 10 armor) that hatches in place after the unit's build time. Cancelling an egg refunds everything and
 * gives the larva back; a Hatchery that dies takes its larva with it, but eggs still hatch.
 *
 * Everything larva-specific lives here so the rest of the simulation only calls a handful of functions:
 *   spawnLarva / tickHatchery (Building.update), queueFromLarva (Building.queueUnit), cancelEgg (World / net),
 *   tickLarvaUnit (Unit.update).
 */

/** A Hatchery stops spawning at LARVA_MAX but injects may push it this high. */
export const LARVA_CAP = 19;
/** How many units one larva hatches into (a Zergling egg holds a pair). */
export const LARVA_YIELD: Partial<Record<UnitType, number>> = { zergling: 2 };
export const larvaYield = (t: UnitType): number => LARVA_YIELD[t] ?? 1;
/** Supply a morph reserves (per unit supply x units hatched). */
export const larvaSupply = (t: UnitType): number => UNIT_CONFIGS[t].supplyCost * larvaYield(t);
export const isLarvaKind = (t: string): boolean => t === 'larva' || t === 'egg';
/** The unit types the larva command card offers (same rule the Hatchery used before larva existed). */
export const larvaMorphs = (produces: readonly UnitType[]): UnitType[] => produces.filter(t => usesLarva(t));

const SLOTS_PER_ROW = 7;

/** Where larva slot `i` sits: a fan of positions across the front of the Hatchery, second row behind the first. */
export function larvaSlotPos(h: Building, i: number): { x: number; y: number; rot: number } {
  const row = Math.floor(i / SLOTS_PER_ROW), k = i % SLOTS_PER_ROW;
  const a = Math.PI * (0.14 + 0.72 * (k / (SLOTS_PER_ROW - 1))) + (row % 2 ? 0.07 : 0);
  const r = Math.max(h.width, h.heightTiles) * 0.62 + row * 0.95;
  return { x: h.pos.x + Math.cos(a) * r * 1.1, y: h.pos.y + Math.sin(a) * r, rot: Math.PI / 2 - a };
}

type Owned = Unit & { hatcheryId: string };
const ofHatchery = (world: any, id: string, type?: 'larva' | 'egg'): Owned[] =>
  world.units.filter((u: Unit) => !u.isDead && u.hatcheryId === id && (type ? u.type === type : isLarvaKind(u.type)));

/** Free (not yet morphing) larva of a Hatchery. Works on guests too (the snapshot carries `hatcheryId`). */
export const larvaOf = (world: any, hatchId: string): Unit[] => ofHatchery(world, hatchId, 'larva');
export const larvaCount = (world: any, hatchId: string): number => larvaOf(world, hatchId).length;

function setKind(world: any, u: Unit, type: UnitType) {
  world.morphUnit(u, type);
  const c = UNIT_CONFIGS[type];
  u.maxHealth = c.maxHealth; u.health = c.maxHealth; u.armor = c.armor;
  u.attrs = [...(c.attributes ?? [c.armorType])];
}

export function spawnLarva(world: any, h: Building): Unit | null {
  const used = new Set(ofHatchery(world, h.id).map(u => u.larvaSlot));
  let slot = 0;
  while (used.has(slot)) slot++;
  if (slot >= LARVA_CAP + 4) return null;
  const p = larvaSlotPos(h, slot);
  const u: Unit = world.spawnUnit('larva', h.playerId, { x: p.x, y: p.y });
  u.hatcheryId = h.id; u.larvaSlot = slot; u.rotation = p.rot;
  return u;
}

/** Hatchery upkeep: natural spawning (below 3) and finished injects. Host / single-player only. */
export function tickHatchery(world: any, h: Building, dt: number) {
  const n = larvaCount(world, h.id);
  const aiSide = h.playerId === 'enemy' && world.matchConfig?.mode !== 'multiplayer_pvp';
  const regen = aiSide ? LARVA_REGEN * 0.7 : LARVA_REGEN; // the AI's hatcheries are a little faster so it keeps up (not a human PvP opponent's)
  if (n < LARVA_MAX) {
    h.larvaTimer += dt;
    if (h.larvaTimer >= regen) { h.larvaTimer = 0; spawnLarva(world, h); }
  } else h.larvaTimer = 0;
  for (let i = h.injects.length - 1; i >= 0; i--) {
    h.injects[i]! -= dt;
    if (h.injects[i]! <= 0) {
      h.injects.splice(i, 1);
      for (let k = 0; k < 3 && larvaCount(world, h.id) < LARVA_CAP; k++) spawnLarva(world, h);
    }
  }
}

/** A fresh Hatchery starts with its three larva. */
export function initialLarva(world: any, h: Building) {
  for (let i = larvaCount(world, h.id); i < LARVA_MAX; i++) spawnLarva(world, h);
}

/**
 * Turn a free larva (the given one, else any) into an egg for `type`. Cost and supply are charged by the caller (Building.queueUnit);
 * returns false only when the Hatchery has no larva.
 */
export function morphLarva(world: any, h: Building, type: UnitType, larvaId?: string): boolean {
  const free = larvaOf(world, h.id);
  const larva = (larvaId ? free.find(u => u.id === larvaId) : free[0]) ?? null;
  if (!larva) return false;
  const c = UNIT_CONFIGS[type];
  setKind(world, larva, 'egg');
  larva.egg = { type, t: 0, total: c.buildTime, minerals: c.costMinerals, gas: c.costGas, supply: larvaSupply(type) };
  if (larva.playerId === 'player') world.sound?.at(larva.pos.x, larva.pos.y).playLarvaSlime(0.55);
  return true;
}

/** Refund a morphing egg in full and turn it back into a larva (SC2: cancelling returns the larva). */
export function cancelEgg(world: any, egg: Unit): boolean {
  if (egg.type !== 'egg' || !egg.egg || egg.isDead) return false;
  const r = world.resources[egg.playerId];
  r.minerals += egg.egg.minerals; r.gas += egg.egg.gas;
  r.supply = Math.max(0, r.supply - egg.egg.supply);
  egg.egg = undefined;
  setKind(world, egg, 'larva');
  return true;
}

/** Give a Larva / Egg a waypoint (or clear it with null). The egg that a larva becomes is the same unit, so it keeps the waypoint. */
export function setLarvaRally(u: Unit, pos: { x: number; y: number } | null, targetId: string | null = null) {
  u.rally = pos ? { x: pos.x, y: pos.y, targetId } : undefined;
}

/** Send a freshly hatched unit to its egg's own waypoint, else to the Hatchery's rally. */
function sendHatched(world: any, egg: Unit, unit: Unit, home: Building | undefined, off: number) {
  const r = egg.rally;
  if (!r) { home?.sendToRally(unit, world); return; }
  const node = r.targetId ? world.resourceNodes.find((n: any) => n.id === r.targetId) : null;
  if (node && isWorkerType(unit.type)) unit.setCommand({ type: 'gather', targetEntityId: node.id });
  else unit.setCommand({ type: 'move', targetPos: { x: r.x + off, y: r.y } });
}

function hatch(world: any, egg: Unit) {
  const e = egg.egg!;
  const n = larvaYield(e.type);
  const home = world.buildings.find((b: Building) => b.id === egg.hatcheryId && !b.isDead);
  for (let i = 0; i < n; i++) {
    const off = n > 1 ? (i === 0 ? -0.3 : 0.3) : 0;
    const unit: Unit = world.spawnUnit(e.type, egg.playerId, { x: egg.pos.x + off, y: egg.pos.y });
    unit.rotation = egg.rotation;
    sendHatched(world, egg, unit, home, off * 1.5);
  }
  if (egg.playerId === 'player') world.sound.at(egg.pos.x, egg.pos.y).playLarvaHatch(e.type);
  // the supply reserved at morph time now belongs to the hatched units (each refunds its own when it dies)
  egg.egg = undefined;
  egg.silent = true; // removed without a death animation
  egg.isDead = true;
}

const wriggle = new WeakMap<object, THREE.AnimationAction>();

/** Per-frame upkeep for larva and eggs. `puppet` = multiplayer guest (visuals only; the host owns the simulation). */
export function tickLarvaUnit(world: any, u: Unit, dt: number, puppet = false) {
  if (u.type === 'larva') {
    if (!puppet) {
      const home = world.buildings.find((b: Building) => b.id === u.hatcheryId && !b.isDead);
      if (!home) { u.takeDamage(1e6); return; } // the Hatchery is gone: its larva die with it
    }
    const rig = u.mesh?.userData.rigged as { mixer: THREE.AnimationMixer; clips: Record<string, THREE.AnimationClip> } | undefined;
    if (rig) {
      let act = wriggle.get(rig.mixer);
      if (!act) {
        const clip = Object.values(rig.clips)[0];
        if (clip) { act = rig.mixer.clipAction(clip); act.time = Math.random() * clip.duration; act.play(); wriggle.set(rig.mixer, act); }
      }
      rig.mixer.update(dt);
    }
  } else if (u.type === 'egg') {
    const e = u.egg;
    if (!puppet && e) {
      e.t += dt;
      if (e.t >= e.total) { hatch(world, u); return; }
    }
    // the egg swells and trembles as it nears hatching
    const prog = e ? Math.min(1, e.t / e.total) : (u.eggProgress ?? 0);
    if (u.mesh) {
      const s = 0.85 + 0.25 * prog + Math.sin(performance.now() / (260 - 150 * prog) + u.larvaSlot) * 0.02 * (0.4 + prog);
      u.mesh.userData.eggScale = s;
      const body = u.mesh.getObjectByName('egg');
      if (body) body.scale.set(0.85 * s, 1.15 * s, 0.85 * s);
    }
  }
}
