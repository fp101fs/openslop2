import { GameWorld } from '../simulation/GameWorld';
import { Unit } from '../simulation/Unit';
import { Building } from '../simulation/Building';
import { ABILITIES, abilityBlocked, castAbility } from '../simulation/Mechanics';
import { isLarvaKind, setLarvaRally } from '../simulation/Larva';
import { unloadAll, unloadUnit, startSalvage, cancelSalvage } from '../simulation/Bunker';
import { BuildingType, Command, PlayerId, UnitType, UpgradeType, Vector2D } from '../types';
import { BUILDING_CONFIGS, researchHost } from '../config';

/**
 * The multiplayer order protocol: every player action that changes the game, as plain JSON.
 *
 * Both sync modes use it. Snapshot mode: the guest sends these to the host, which runs them. Lockstep: both players
 * schedule them for a future turn and every computer runs the same list on the same tick. `applyCommand` is the one
 * place they turn into simulation calls, and it validates every field, because the other player is untrusted.
 *
 * Adding an order: add its shape to NetCommand, a sender to NetSync, and a case to applyCommand.
 */
export type NetCommand =
  | { t: 'cmd'; ids: string[]; c: Command }
  | { t: 'prod'; b: string; u: UnitType; l?: string }
  | { t: 'ecancel'; e: string }
  | { t: 'cancel'; b: string; i: number }
  | { t: 'place'; type: BuildingType; pos: Vector2D; w: string | null; q?: boolean }
  | { t: 'research'; type: UpgradeType }
  | { t: 'abil'; id: string; a: SimpleAbility }
  | { t: 'cast'; id: string; a: string; pos?: Vector2D; e?: string | null; n?: string | null }
  | { t: 'lrally'; ids: string[]; pos: Vector2D; target: string | null }
  | { t: 'rally'; b: string; pos: Vector2D; target: string | null }
  | { t: 'act'; id: string; a: StructureAction; u?: string; pos?: Vector2D };

/** Command-card actions on one of the player's structures. */
export type StructureAction = 'unload_all' | 'unload' | 'salvage' | 'salvage_cancel' | 'cancel_morph' | 'cancel_build' | 'fly';

export type SimpleAbility = 'stim' | 'siege' | 'afterburner' | 'depot' | 'burrow' | 'mode_e' | 'mode_d';

export const COMMAND_KINDS = new Set<string>(['cmd', 'prod', 'ecancel', 'cancel', 'place', 'research', 'abil', 'cast', 'lrally', 'rally', 'act']);

const UNIT_ORDERS = new Set<string>(['move', 'attack', 'attack_move', 'stop', 'hold', 'patrol', 'gather', 'return_resources', 'build', 'repair', 'load', 'stim', 'siege', 'unsiege', 'mode_e', 'mode_d']);

const num = (n: any) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10000;
const pt = (p: any) => !!p && num(p.x) && num(p.y);
const str = (v: any) => typeof v === 'string' && v.length <= 64;
const optStr = (v: any) => v == null || str(v);

/**
 * Run one order for player `pid`. Returns a message for the player who gave it when the game refuses the order
 * (not enough minerals, bad placement ...), or null. Malformed orders are dropped silently.
 */
export function applyCommand(w: GameWorld, pid: PlayerId, m: any): string | null {
  if (!m || typeof m !== 'object' || !COMMAND_KINDS.has(m.t)) return null;
  switch (m.t) {
    case 'cmd': {
      const c = m.c as Command;
      if (!c || !UNIT_ORDERS.has(c.type)) return null;
      if (c.targetPos !== undefined && !pt(c.targetPos)) return null;
      if (c.targetEntityId !== undefined && !str(c.targetEntityId)) return null;
      if (c.buildingTypeToConstruct !== undefined && !BUILDING_CONFIGS[c.buildingTypeToConstruct]) return null;
      if (c.abilityId !== undefined && !str(c.abilityId)) return null;
      if (!Array.isArray(m.ids) || m.ids.length > 400) return null;
      const want = new Set((m.ids as unknown[]).filter(str) as string[]);
      // world order, not message order: same result whichever way the ids were listed
      for (const u of w.units) if (want.has(u.id) && u.playerId === pid) u.setCommand({ ...c });
      return null;
    }
    case 'prod': {
      if (!str(m.b) || !str(m.u) || !optStr(m.l)) return null;
      const r = w.produceFor(pid, m.b, m.u, m.l || undefined);
      return r.ok ? null : r.msg;
    }
    case 'ecancel':
      if (str(m.e)) w.cancelEgg(pid, m.e);
      return null;
    case 'cancel': {
      if (!str(m.b) || !Number.isInteger(m.i) || m.i < 0 || m.i > 20) return null;
      const b = w.buildings.find(x => x.id === m.b && x.playerId === pid);
      if (b) b.cancelQueueItem(m.i, w);
      return null;
    }
    case 'place': {
      if (!BUILDING_CONFIGS[m.type as BuildingType] || !pt(m.pos) || !optStr(m.w)) return 'Invalid build order';
      const r = w.placeBuilding(pid, m.type, { x: m.pos.x, y: m.pos.y }, m.w, m.q === true); // re-validates and snaps (SC2 rules)
      return r.ok ? null : r.msg;
    }
    case 'research': {
      if (!str(m.type)) return null;
      const need = researchHost(m.type as UpgradeType, pid === 'player' ? w.matchConfig.playerFaction : w.matchConfig.enemyFaction);
      if (!w.hasConstructed(pid, need)) return `Requires a completed ${need.replace(/_/g, ' ')}`;
      const r = w.researchUpgrade(m.type as UpgradeType, pid);
      return r.ok ? null : r.msg;
    }
    case 'abil': {
      if (!str(m.id) || !str(m.a)) return null;
      const e = w.findEntityById(m.id);
      if (!e || e.playerId !== pid) return null;
      if (e instanceof Unit) {
        if (m.a === 'stim') e.activateStimpack(w);
        else if (m.a === 'siege') e.toggleSiegeMode(w);
        else if (m.a === 'mode_e' || m.a === 'mode_d') e.transformMode(w, m.a === 'mode_e' ? 'E' : 'D');
        else if (m.a === 'afterburner') e.activateAfterburner(w);
        else if (m.a === 'burrow' && ABILITIES.burrow!.casters.includes(e.type) && !abilityBlocked(w, e, ABILITIES.burrow!)) castAbility(w, e, 'burrow');
      } else if (e instanceof Building && m.a === 'depot') {
        e.toggleDepot(w);
      }
      return null;
    }
    case 'cast': {
      if (!str(m.id) || !str(m.a) || !ABILITIES[m.a] || (m.pos !== undefined && !pt(m.pos)) || !optStr(m.e) || !optStr(m.n)) return null;
      const caster = w.findEntityById(m.id);
      if (!caster || caster.playerId !== pid || caster.isDead) return null;
      const entity = m.e ? w.findEntityById(m.e) : null;
      return castAbility(w, caster, m.a, { pos: m.pos ? { x: m.pos.x, y: m.pos.y } : undefined, entity, nodeId: m.n ?? null });
    }
    case 'lrally': {
      if (!Array.isArray(m.ids) || m.ids.length > 400 || !pt(m.pos) || !optStr(m.target)) return null;
      const want = new Set((m.ids as unknown[]).filter(str) as string[]);
      for (const u of w.units) if (want.has(u.id) && u.playerId === pid && isLarvaKind(u.type)) setLarvaRally(u, m.pos, m.target || null);
      return null;
    }
    case 'rally': {
      if (!str(m.b) || !pt(m.pos) || !optStr(m.target)) return null;
      const b = w.buildings.find(x => x.id === m.b && x.playerId === pid);
      if (b) { b.rallyPoint = { x: m.pos.x, y: m.pos.y }; b.rallyTargetId = m.target || null; }
      return null;
    }
    case 'act': {
      if (!str(m.id) || !str(m.a) || !optStr(m.u) || (m.pos !== undefined && !pt(m.pos))) return null;
      const b = w.buildings.find(x => x.id === m.id && x.playerId === pid && !x.isDead);
      if (!b) return null;
      switch (m.a as StructureAction) {
        case 'unload_all': if (b.cargo.length) unloadAll(w, b); return null;
        case 'unload': { const u = b.cargo.find(c => c.id === m.u); if (u) unloadUnit(w, b, u); return null; }
        case 'salvage': return b.type === 'bunker' && !b.salvaging ? startSalvage(w, b) : null;
        case 'salvage_cancel': if (b.salvaging) cancelSalvage(b); return null;
        case 'cancel_morph': b.cancelMorph(w); return null;
        case 'cancel_build': b.cancelConstruction(w); return null;
        case 'fly': if (b.isAirborne && m.pos) b.flyTo({ x: m.pos.x, y: m.pos.y }, false); return null;
      }
      return null;
    }
  }
  return null;
}
