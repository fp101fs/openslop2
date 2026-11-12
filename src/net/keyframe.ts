import * as THREE from 'three';
import { captureGame, restoreGame, type SaveData } from '../save/SaveState';
import { encodeSave, decodeSave } from '../save/SaveFiles';
import { Outline } from '../graphics/Outline';
import type { GameWorld } from '../simulation/GameWorld';
import type { Entity } from '../simulation/Entity';

/**
 * Keyframes: the whole match state, sent host -> guest. Built on the single-player save system (src/save/SaveState.ts).
 *
 * Used for: the lockstep start (the guest copies the host's tick-0 state, so both begin identical), healing a lockstep
 * desync (the guest jumps to the host's state), and host migration in snapshot mode (the guest keeps the latest one and
 * continues the match from it if the host leaves).
 *
 * The local view (fog, camera, selection, control groups) is never sent: each player keeps their own.
 */

/** Stand-in for the app object the save code reads the camera and control groups from. */
function viewStub(world: GameWorld, groups = new Map<number, Entity[]>()) {
  return { world, renderer: { cameraTarget: new THREE.Vector3(), savedRtsTarget: null, cameraDistance: 0 }, input: { controlGroups: groups } };
}

/** Snapshot the simulation (no view state). Synchronous, so it can be taken exactly at a turn boundary. */
export function captureKeyframe(world: GameWorld): SaveData {
  const d = captureGame(viewStub(world), 'keyframe');
  if (d.creep && typeof d.creep === 'object') (d.creep as { exact?: boolean }).exact = true;
  d.fog = null;
  d.groups = [];
  return d;
}

const flip = (p: unknown) => (p === 'player' ? 'enemy' : p === 'enemy' ? 'player' : p);
function swapSides(rec: any) {
  if (rec && typeof rec === 'object' && 'player' in rec && 'enemy' in rec) [rec.player, rec.enemy] = [rec.enemy, rec.player];
}

/**
 * PvP guests see their own side as 'player' (so all UI code stays the same). This turns a host keyframe into the guest's
 * labels. Every stored side label lives in one of these fields; a new PlayerId field in the save needs a line here.
 */
export function mirrorKeyframe(d: SaveData): SaveData {
  const m: SaveData = JSON.parse(JSON.stringify(d));
  for (const e of [...m.units, ...m.buildings]) e.playerId = flip(e.playerId);
  const w = m.world as any;
  swapSides(w.resources);
  swapSides(w.mined);
  swapSides(w.doctrines);
  [w.upgrades, w.enemyUpgrades] = [w.enemyUpgrades, w.upgrades];
  if (Array.isArray(w.scans)) for (const s of w.scans) s.owner = flip(s.owner);
  return m;
}

/**
 * Replace the running match's state with a keyframe. Every unit and structure is rebuilt (so models get the right team
 * colours); the map, rocks and resource fields stay. Selection and control groups are kept by id.
 */
export function applyKeyframe(world: GameWorld, d: SaveData, controlGroups?: Map<number, Entity[]>) {
  const selected = new Set(world.selectedEntities.map(e => e.id));
  const groups = new Map<number, string[]>();
  controlGroups?.forEach((list, n) => groups.set(n, list.map(e => e.id)));

  for (const u of world.units) {
    if (u.mesh) { Outline.set(u.mesh, false); world.scene.remove(u.mesh); }
    world.decals.removeHealthBar(u.id);
  }
  for (const b of world.buildings) {
    if (b.mesh) { Outline.set(b.mesh, false); world.scene.remove(b.mesh); }
    world.decals.removeHealthBar(b.id);
    world.decals.removeRallyLine(b.id);
    for (const c of b.cargo) if (c.mesh) world.scene.remove(c.mesh);
  }
  world.units = [];
  world.buildings = [];

  restoreGame(viewStub(world), { ...d, fog: null, groups: [] });

  const byId = new Map<string, Entity>();
  for (const e of [...world.units, ...world.buildings]) byId.set(e.id, e);
  world.selectedEntities = [...selected].map(id => byId.get(id)).filter((e): e is Entity => !!e && !e.isDead) as any;
  world.selectedEntities.forEach(e => (e.isSelected = true));
  if (controlGroups) {
    controlGroups.clear();
    groups.forEach((ids, n) => {
      const list = ids.map(id => byId.get(id)).filter((e): e is Entity => !!e && !e.isDead);
      if (list.length) controlGroups.set(n, list);
    });
  }
}

/** Keyframe -> compact text for the wire (gzip + base64 when the browser has CompressionStream). */
export async function encodeKeyframe(d: SaveData): Promise<string> {
  const bytes = await encodeSave(d);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
}

export async function decodeKeyframe(text: string): Promise<SaveData> {
  const s = atob(text), bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return decodeSave(bytes);
}
