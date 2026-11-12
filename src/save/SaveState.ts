import { Entity } from '../simulation/Entity';
import { ResourceNode } from '../simulation/ResourceNode';
import type { Unit } from '../simulation/Unit';
import type { Building } from '../simulation/Building';
import { Pathfinding } from '../simulation/Pathfinding';
import { Outline } from '../graphics/Outline';
import { MAP_SIZE, CAMPAIGN_MISSIONS, MAP_CONFIGS } from '../config';
import { missionOf } from '../campaign/registry';
import type { GameWorld } from '../simulation/GameWorld';
import type { MatchConfig } from '../types';

/**
 * Single-player save games: a snapshot of the whole match as plain data, and the code that puts it back.
 *
 * Units, buildings and the AI are saved field by field (every own field that is plain data: numbers, strings, plain objects,
 * arrays, Sets, Maps; references to other entities become their ids). Meshes, animators and other runtime objects are not saved:
 * a load starts the same match fresh (same map, same mission script, same starting entities) and then writes the saved fields onto
 * it, so the models, animators and script closures are all built by the normal code.
 *
 * Campaign scripts keep their own variables and hold direct references to the units they spawned. To rebuild those, a load re-runs
 * the script's timers that had fired before the save (see MissionRuntime.replayFired), and the units those callbacks spawn are matched
 * to the saved ones by the tag they got when spawned (`scriptTag`), so the script keeps tracking the right objects.
 */

export const SAVE_VERSION = 1;

export interface SaveMeta {
  name: string;
  /** Real time of the save (ms since epoch). */
  savedAt: number;
  gameType: 'Campaign' | 'Skirmish';
  race: string;
  enemyRace: string;
  title: string;
  difficulty: string;
  /** Game seconds played. */
  gameTime: number;
}

export interface SaveData {
  v: number;
  meta: SaveMeta;
  config: MatchConfig;
  world: Record<string, unknown>;
  units: Record<string, any>[];
  buildings: Record<string, any>[];
  nodes: [string, number, string | null][];
  rocks: [string, number][];
  ai: Record<string, unknown>;
  mission: any;
  fog: unknown;
  creep: unknown;
  camera: { x: number; z: number; dist: number };
  groups: [number, string[]][];
}

// ---------------------------------------------------------------------------------------------------------------------
// Plain-data codec
// ---------------------------------------------------------------------------------------------------------------------

const SKIP = Symbol('skip');
/** Runtime-only fields that a load must leave as the fresh object has them. */
const NO_SAVE = new Set(['mesh', 'cargoMesh', 'isSelected', 'stageMesh', 'stagesDone', 'world']);

const TYPED: Record<string, new (b: ArrayBuffer) => ArrayBufferView> = {
  Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array, Uint8ClampedArray
};

function toB64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
}
function fromB64(b64: string): Uint8Array {
  const s = atob(b64), u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

/** Encode a value as JSON-safe data, or SKIP if any part of it is not plain data (a whole field is saved or left alone, never half). */
function enc(v: unknown, depth = 0): unknown {
  if (depth > 16) return SKIP;
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : { $n: String(v) };
  if (v === undefined) return { $u: 1 };
  if (typeof v !== 'object') return SKIP; // functions, symbols, bigints
  if (v instanceof Entity || v instanceof ResourceNode) return { $r: v.id };
  if (Array.isArray(v)) {
    const out: unknown[] = [];
    for (const x of v) { const e = enc(x, depth + 1); if (e === SKIP) return SKIP; out.push(e); }
    return out;
  }
  if (v instanceof Set) { const a = enc([...v], depth + 1); return a === SKIP ? SKIP : { $s: a }; }
  if (v instanceof Map) { const a = enc([...v], depth + 1); return a === SKIP ? SKIP : { $m: a }; }
  if (ArrayBuffer.isView(v)) {
    const name = v.constructor.name;
    if (!TYPED[name]) return SKIP;
    return { $t: name, b: toB64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
  }
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return SKIP;
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(v as object)) {
    const e = enc((v as Record<string, unknown>)[k], depth + 1);
    if (e === SKIP) return SKIP;
    o[k] = e;
  }
  return o;
}

/** Encode, giving `undefined` for values that cannot be saved. */
export function encode(v: unknown): unknown { const e = enc(v); return e === SKIP ? undefined : e; }

function decoder(refs: Map<string, unknown>) {
  const dec = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(dec);
    const o = v as Record<string, any>;
    if ('$r' in o) return refs.get(o.$r) ?? null;
    if ('$n' in o) return Number(o.$n);
    if ('$u' in o) return undefined;
    if ('$s' in o) return new Set(dec(o.$s) as unknown[]);
    if ('$m' in o) return new Map(dec(o.$m) as [unknown, unknown][]);
    if ('$t' in o) { const u8 = fromB64(o.b); const C = TYPED[o.$t]!; return new C(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer); }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) out[k] = dec(o[k]);
    return out;
  };
  return dec;
}

function encFields(obj: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if (NO_SAVE.has(k)) continue;
    const e = enc((obj as Record<string, unknown>)[k]);
    if (e !== SKIP) out[k] = e;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------------------------------------------------

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function gameTypeOf(cfg: MatchConfig): 'Campaign' | 'Skirmish' { return cfg.mode === 'campaign' ? 'Campaign' : 'Skirmish'; }

/** What the match is: the mission's title, or the skirmish map. */
export function titleOf(cfg: MatchConfig): string {
  const pm = missionOf(cfg.campaignId, cfg.missionKey);
  if (pm) return pm.title;
  const legacy = cfg.mode === 'campaign' ? CAMPAIGN_MISSIONS.find(m => m.id === cfg.campaignMissionId) : undefined;
  if (legacy) return legacy.title;
  return MAP_CONFIGS[cfg.mapId]?.name ?? cfg.mapId;
}

/** Default save name, e.g. `Campaign_Terran_2026-11-11_15-42-07` (letters, digits, '_' and '-' only, like SC2's date-stamped names). */
export function defaultSaveName(cfg: MatchConfig, when = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${when.getFullYear()}-${p(when.getMonth() + 1)}-${p(when.getDate())}`;
  const time = `${p(when.getHours())}-${p(when.getMinutes())}-${p(when.getSeconds())}`;
  return `${gameTypeOf(cfg)}_${cap(cfg.playerFaction)}_${date}_${time}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------------------------------------------------

/** Snapshot the running single-player match. `app` is the StarCraftApp. */
export function captureGame(app: any, name: string): SaveData {
  const w: GameWorld = app.world;
  const cfg = w.matchConfig;
  const live = <T extends Entity>(e: T) => !e.isDead;
  const cargo = w.buildings.filter(live).flatMap(b => b.cargo.filter(live));
  const groups: [number, string[]][] = [];
  const cg: Map<number, Entity[]> | undefined = app.input?.controlGroups;
  cg?.forEach((list, n) => { const ids = list.filter(live).map(e => e.id); if (ids.length) groups.push([n, ids]); });
  const ai = encFields(w.ai);
  return {
    v: SAVE_VERSION,
    meta: {
      name, savedAt: Date.now(), gameType: gameTypeOf(cfg), race: cap(cfg.playerFaction), enemyRace: cap(cfg.enemyFaction),
      title: titleOf(cfg), difficulty: cfg.difficulty, gameTime: w.gameTime
    },
    config: { ...cfg },
    world: encFields({
      gameTime: w.gameTime, entityIdCounter: w.entityIdCounter, resources: w.resources, upgrades: w.upgrades, enemyUpgrades: w.enemyUpgrades,
      mined: w.mined, doctrines: w.doctrines, scans: w.scans, burnTimers: (w as any).burnTimers,
      rngState: w.rngState // seeded simulation randomness (multiplayer keyframes need both computers on the same sequence)
    }),
    units: [...w.units.filter(live), ...cargo].map(encFields),
    buildings: w.buildings.filter(live).map(encFields),
    nodes: w.resourceNodes.map(n => [n.id, n.amount, n.reservedBy]),
    rocks: w.rocks.filter(live).map(r => [r.id, r.health]),
    ai,
    mission: w.mission ? w.mission.exportState(encode) : null,
    fog: encode(w.fog.exportState()),
    creep: encode(w.creep.exportState()),
    camera: { x: app.renderer.cameraTarget.x, z: app.renderer.cameraTarget.z, dist: app.renderer.cameraDistance },
    groups
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Put a save back. Call right after `world.configureMatch(save.config)` has set up the same match from scratch.
 */
export function restoreGame(app: any, s: SaveData) {
  const w: GameWorld = app.world;

  // 1. Campaign: re-run the mission timers that had fired, so the script's own variables and spawned units exist again
  if (w.mission && s.mission) w.mission.replayFired(s.mission.fireLog ?? []);

  // 2. Pair every saved unit / building with a live object: script-spawned ones by tag, the match's starting ones by id
  const freshUnits: Unit[] = [...w.units, ...w.buildings.flatMap(b => b.cargo)];
  const freshBuildings: Building[] = [...w.buildings];
  const index = <T extends Entity>(list: T[]) => {
    const byTag = new Map<string, T>(), byId = new Map<string, T>();
    for (const e of list) { if (e.scriptTag) byTag.set(e.scriptTag, e); else byId.set(e.id, e); }
    return (saved: Record<string, any>) => saved.scriptTag ? byTag.get(saved.scriptTag) : byId.get(saved.id);
  };
  const findUnit = index(freshUnits), findBuilding = index(freshBuildings);
  const used = new Set<Entity>();
  const refs = new Map<string, unknown>();
  const dec = decoder(refs);
  for (const e of [...freshUnits, ...freshBuildings]) { w.decals.removeHealthBar(e.id); w.decals.removeRallyLine(e.id); }

  const units: [Unit, Record<string, any>][] = [];
  for (const su of s.units) {
    let u = findUnit(su);
    if (u && used.has(u)) u = undefined;
    if (u) { if (u.type !== su.type) w.morphUnit(u, su.type, true); }
    else u = w.spawnUnit(su.type, su.playerId, dec(su.pos) as { x: number; y: number }, su.id);
    used.add(u); units.push([u, su]); refs.set(su.id, u);
  }
  const buildings: [Building, Record<string, any>, boolean][] = [];
  for (const sb of s.buildings) {
    let b = findBuilding(sb);
    if (b && used.has(b)) b = undefined;
    let remodel = false;
    if (b) remodel = b.type !== sb.type || b.tier !== sb.tier;
    else { b = w.spawnBuilding(sb.type, sb.playerId, dec(sb.pos) as { x: number; y: number }, true, sb.id); remodel = (sb.tier ?? 0) >= 2; }
    used.add(b); buildings.push([b, sb, remodel]); refs.set(sb.id, b);
  }
  for (const n of w.resourceNodes) refs.set(n.id, n);
  for (const r of w.rocks) refs.set(r.id, r);

  // starting / script entities that were gone by the time of the save
  const drop = (e: Entity) => {
    e.isDead = true;
    if (e.mesh) { Outline.set(e.mesh, false); w.scene.remove(e.mesh); }
  };
  for (const e of [...freshUnits, ...freshBuildings]) if (!used.has(e)) drop(e);

  // 3. Write the saved fields
  for (const [u, su] of units) for (const k of Object.keys(su)) (u as any)[k] = dec(su[k]);
  for (const [b, sb] of buildings) for (const k of Object.keys(sb)) (b as any)[k] = dec(sb[k]);
  w.units = units.map(([u]) => u).filter(u => !u.loadedIn);
  w.buildings = buildings.map(([b]) => b);
  for (const [u] of units) {
    if (u.loadedIn) { if (u.mesh) w.scene.remove(u.mesh); continue; }
    u.updateMeshTransform();
  }
  for (const [b, , remodel] of buildings) {
    if (remodel) w.refreshBuildingModel(b);
    else { (b as any).stagesDone = false; b.updateConstructionVisuals(); }
    b.updateMeshTransform();
    if (b.mesh) b.mesh.position.y = b.height + (b.isAirborne ? b.flyY : 0);
  }

  // 4. Resources and rocks
  const nodes = new Map(s.nodes.map(n => [n[0], n]));
  for (const n of w.resourceNodes) { const x = nodes.get(n.id); if (x) { n.amount = x[1]; n.reservedBy = x[2]; } }
  const rocks = new Map(s.rocks);
  w.rocks = w.rocks.filter(r => {
    const hp = rocks.get(r.id);
    if (hp === undefined) { drop(r); return false; }
    r.health = hp; return true;
  });

  // 5. Pathing: rebuilt from what now stands on the map
  const pf = new Pathfinding(MAP_SIZE, MAP_SIZE);
  for (const n of w.resourceNodes) {
    const m = n.type === 'minerals';
    pf.setAreaObstacle(n.pos.x - (m ? 1 : 1.5), n.pos.y - (m ? 0.5 : 1.5), m ? 2 : 3, m ? 1 : 3, true);
  }
  for (const r of w.rocks) pf.setAreaObstacle(r.pos.x - r.size / 2, r.pos.y - r.size / 2, r.size, r.size, true);
  for (const b of w.buildings) {
    if (b.isAirborne || b.walkable) continue;
    pf.setAreaObstacle(b.pos.x - b.width / 2, b.pos.y - b.heightTiles / 2, b.width, b.heightTiles, true);
  }
  w.pathfinding = pf;

  // 6. World, AI, mission
  for (const k of Object.keys(s.world)) (w as any)[k] = dec(s.world[k]);
  for (const k of Object.keys(s.ai)) (w.ai as any)[k] = dec(s.ai[k]);
  if (w.mission && s.mission) {
    // the watchers' catch-up pass may spawn things (it sees the restored world for the first time): those are not part of the save
    const keepU = new Set(w.units), keepB = new Set(w.buildings);
    w.mission.finishRestore(s.mission, dec);
    for (const e of [...w.units.filter(u => !keepU.has(u)), ...w.buildings.filter(b => !keepB.has(b))]) drop(e);
    w.units = w.units.filter(u => keepU.has(u));
    w.buildings = w.buildings.filter(b => keepB.has(b));
  }
  w.isGameOver = false;
  w.gameResult = null;
  w.delayed = [];
  w.selectedEntities = [];

  // 7. Fog, creep, camera, control groups
  if (s.fog) w.fog.importState(dec(s.fog) as any);
  if (s.creep) w.creep.importState(dec(s.creep) as any);
  app.renderer.cameraTarget.set(s.camera.x, 0, s.camera.z);
  app.renderer.savedRtsTarget?.set(s.camera.x, 0, s.camera.z);
  app.renderer.cameraDistance = s.camera.dist;
  const cg: Map<number, Entity[]> | undefined = app.input?.controlGroups;
  if (cg) {
    cg.clear();
    for (const [n, ids] of s.groups) {
      const list = ids.map(id => refs.get(id)).filter((e): e is Entity => e instanceof Entity && !e.isDead);
      if (list.length) cg.set(n, list);
    }
  }
}
