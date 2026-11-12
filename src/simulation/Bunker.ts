import { Outline } from '../graphics/Outline';
import { RiggedAnimator } from '../graphics/RiggedAnimator';
import { BUILDING_CONFIGS } from '../config';
import type { Unit } from './Unit';
import type { Building } from './Building';

/**
 * Terran Bunker, as in SC2: 4 cargo slots, Marines and Marauders take 1 each, loaded units are safe inside
 * (not targetable), fire from the bunker with +1 range and their own weapon / upgrades, and pop out alive when it
 * dies. Salvage returns 75% of the cost after 5s and unloads everyone first.
 * Loaded units leave world.units / the scene entirely (supply stays spent) and live in `Building.cargo`.
 */
export const BUNKER_CAPACITY = 4;
export const BUNKER_LOADABLE: ReadonlySet<string> = new Set(['marine', 'marauder']);
export const SALVAGE_TIME = 5;
export const SALVAGE_REFUND = 0.75;
/** +1 weapon range for the bunker, plus the half-footprint (SC2 measures range from the bunker's edge, we measure from its centre). */
const RANGE_BONUS = 1 + 1.5;

export const isNydus = (t: string) => t === 'nydus_network' || t === 'nydus_worm';
export const isLoadable = (u: { type: string; playerId: string; isDead: boolean }) => BUNKER_LOADABLE.has(u.type) && !u.isDead;

/** Why `u` can't enter `b` right now (null = it can). */
export function loadBlockReason(b: Building, u: Unit): string | null {
  if (isNydus(b.type)) {
    // Nydus Network / Worm: any friendly ground unit can enter; units leave from whichever Nydus structure you unload (SC2)
    if (!b.isConstructed) return 'Nydus is still under construction';
    if (u.playerId !== b.playerId) return 'Cannot load enemy units';
    if (u.isFlying || u.type === 'larva' || u.type === 'egg' || u.morph) return 'Only ground units can use the Nydus';
    return null;
  }
  if (b.type !== 'bunker') return 'Not a bunker';
  if (!b.isConstructed) return 'Bunker is still under construction';
  if (b.salvaging) return 'Bunker is being salvaged';
  if (!BUNKER_LOADABLE.has(u.type)) return 'Only Marines and Marauders can enter a Bunker';
  if (u.playerId !== b.playerId) return 'Cannot load enemy units';
  if (b.cargo.length >= BUNKER_CAPACITY) return 'Bunker is full';
  return null;
}

export function loadUnit(world: any, b: Building, u: Unit): boolean {
  if (loadBlockReason(b, u) || b.cargo.includes(u)) return false;
  const i = world.units.indexOf(u);
  if (i >= 0) world.units.splice(i, 1);
  if (u.isSelected) {
    u.isSelected = false;
    world.selectedEntities = world.selectedEntities.filter((e: any) => e !== u);
  }
  if (u.mesh) { Outline.set(u.mesh, false); world.scene.remove(u.mesh); }
  world.decals.removeHealthBar(u.id);
  u.currentCommand = null;
  u.commandQueue = [];
  u.targetEntityId = null;
  u.isStimmed = false; u.stimTimer = 0; // no stimming inside a Bunker
  u.burrowed = false;
  u.loadedIn = b.id;
  u.rangeBonus = isNydus(b.type) ? 0 : RANGE_BONUS;
  b.cargo.push(u);
  return true;
}

/** Put a unit back on the map next to the bunker (towards the rally point if one is set). Returns false if it isn't inside. */
export function unloadUnit(world: any, b: Building, u: Unit): boolean {
  const i = b.cargo.indexOf(u);
  if (i < 0) return false;
  b.cargo.splice(i, 1);
  const base = b.rallyPoint ? Math.atan2(b.rallyPoint.y - b.pos.y, b.rallyPoint.x - b.pos.x) : Math.PI / 2;
  const r = b.radius + u.radius + 0.5;
  let spot = { x: b.pos.x + Math.cos(base) * r, y: b.pos.y + Math.sin(base) * r };
  for (let k = 0; k < 16; k++) {
    const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
    const c = { x: b.pos.x + Math.cos(a) * r, y: b.pos.y + Math.sin(a) * r };
    const taken = world.getNearbyUnits(c, u.radius * 1.6).length > 0;
    if (!taken && world.pathfinding.isWalkable(c.x, c.y)) { spot = c; break; }
  }
  u.pos.x = spot.x; u.pos.y = spot.y;
  u.loadedIn = null;
  u.rangeBonus = 0;
  u.height = b.height;
  if (u.mesh) {
    u.mesh.position.set(u.pos.x, u.height, u.pos.y);
    world.scene.add(u.mesh);
  }
  world.units.push(u);
  if (b.rallyPoint && !b.rallyTargetId) u.setCommand({ type: 'move', targetPos: { ...b.rallyPoint } });
  else u.setCommand({ type: 'stop' });
  return true;
}

export function unloadAll(world: any, b: Building) {
  for (const u of [...b.cargo]) unloadUnit(world, b, u);
}

export function startSalvage(world: any, b: Building): string | null {
  if (b.type !== 'bunker' || !b.isConstructed) return 'Not a completed bunker';
  if (b.salvaging) return 'Already salvaging';
  unloadAll(world, b);
  b.salvaging = true;
  b.salvageLeft = SALVAGE_TIME;
  return null;
}

export function cancelSalvage(b: Building) {
  b.salvaging = false;
  b.salvageLeft = 0;
}

/** Per-tick bunker logic: salvage countdown and the loaded units' weapons. */
export function updateBunker(world: any, b: Building, dt: number) {
  if (b.salvaging) {
    b.salvageLeft -= dt;
    if (b.salvageLeft <= 0) {
      const cfg = BUILDING_CONFIGS[b.type];
      world.resources[b.playerId].minerals += Math.floor(cfg.costMinerals * SALVAGE_REFUND);
      b.salvaging = false;
      b.salvaged = true;
      b.health = 0;
      b.isDead = true;
    }
    return;
  }
  if (b.cargo.length === 0) return;

  const top = b.height + 1.55;
  b.cargo.forEach((u, idx) => {
    u.attackCooldown = Math.max(0, u.attackCooldown - dt);
    u.pos.x = b.pos.x; u.pos.y = b.pos.y; u.height = top;
    if (u.attackCooldown > 0) return;
    const range = u.attackRange + u.rangeBonus;
    const target = world.findTacticalTarget
      ? world.findTacticalTarget(b.pos, b.playerId, range, u.canTargetAir, u.canTargetGround)
      : world.findNearestHostile(b.pos, b.playerId, range);
    if (!target) return;
    // fire from one of four loopholes around the roof so tracers don't all start at the centre
    if (u.mesh) {
      const a = Math.PI / 4 + (idx * Math.PI) / 2 + b.rotation;
      u.mesh.position.set(b.pos.x + Math.cos(a) * 0.7, top, b.pos.y + Math.sin(a) * 0.7);
      u.mesh.updateMatrixWorld(true);
    }
    u.fireFromBunker(target, world);
    RiggedAnimator.buildingShot(b);
  });
}
