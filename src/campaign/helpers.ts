import type { BuildingType, UnitType } from '../types';
import type { MissionRuntime } from './MissionRuntime';
import { applyLoadout } from './campaigns/nco/equipment';

/** Reusable mission building blocks. Missions compose these; nothing here knows about a specific mission. */
export type Pt = [number, number];
export interface WaveUnit { type: UnitType; n: number }

const DIFF: Record<string, number> = { easy: 0.6, normal: 1, hard: 1.35, insane: 1.7, elite: 1.9, cheater: 2.2 };
/** Difficulty multiplier for wave sizes (Casual < Normal < Hard < Brutal). */
export const diffScale = (rt: MissionRuntime) => DIFF[rt.world.matchConfig.difficulty] ?? 1;

/** Spawn a squad for `owner` at `from` and send it attack-moving to `to`. Counts scale with difficulty unless `fixed`. */
export function wave(rt: MissionRuntime, units: WaveUnit[], from: Pt, to: Pt, owner: 'enemy' | 'player' = 'enemy', fixed = false) {
  const out: any[] = [];
  for (const u of units) {
    const n = fixed ? u.n : Math.max(1, Math.round(u.n * diffScale(rt)));
    out.push(...rt.spawn(u.type, owner, from[0] + (Math.random() - 0.5) * 3, from[1] + (Math.random() - 0.5) * 3, n));
  }
  for (const e of out) e.setCommand({ type: 'attack_move', targetPos: { x: to[0], y: to[1] } });
  return out;
}

/** Spawn enemy/player structures; returns them so scripts can track kills. */
export function place(rt: MissionRuntime, owner: 'enemy' | 'player', list: { type: BuildingType; at: Pt }[], done = true) {
  return list.map(b => rt.world.spawnBuilding(b.type, owner, { x: b.at[0], y: b.at[1] }, done));
}

/** Completes `id` when any player unit comes within `r` of `at`. Optional `when` gate. */
export function reach(rt: MissionRuntime, id: string, at: Pt, r = 4, when: () => boolean = () => true) {
  rt.onTick(() => { if (rt.status(id) === 'active' && when() && rt.near(at[0], at[1], r, 'player').length) rt.complete(id); });
}

/** Counts every entity in `list` that dies into objective `id` (completes at its target). */
export function countKills(rt: MissionRuntime, id: string, list: any[]) {
  const seen = new Set<any>();
  rt.onTick(() => { for (const e of list) if (e.isDead && !seen.has(e)) { seen.add(e); rt.add(id, 1); } });
}

/** Fails `id` (and the mission, if it is primary) when `e` dies. */
export function mustSurvive(rt: MissionRuntime, id: string, e: () => { isDead: boolean } | undefined) {
  rt.onTick(() => { const x = e(); if (x && x.isDead && rt.status(id) === 'active') rt.fail(id); });
}

/** Succeeds `id` after `seconds` of mission time. */
export function surviveFor(rt: MissionRuntime, id: string, seconds: number) {
  rt.after(seconds, () => rt.complete(id));
}

/** Periodic escalating attack waves: every `every` s from `start`, composition picked by elapsed minutes. */
export function waves(rt: MissionRuntime, o: { start: number; every: number; from: Pt[]; to: Pt; tiers: { atMin: number; units: WaveUnit[] }[]; owner?: 'enemy' | 'player' }) {
  let i = 0;
  rt.every(o.every, () => {
    const min = rt.elapsed / 60;
    const tier = [...o.tiers].reverse().find(t => min >= t.atMin) ?? o.tiers[0]!;
    wave(rt, tier.units, o.from[i++ % o.from.length]!, o.to, o.owner ?? 'enemy');
  }, o.start);
}

/** Mission-wide hero: the Nova unit placed at `at` (cloaked, with the equipment loadout applied). */
export function spawnNova(rt: MissionRuntime, at: Pt, opts: { jumpsuit?: boolean } = {}) {
  const n = rt.spawn('nova', 'player', at[0], at[1])[0]!;
  applyLoadout(n, rt.def.key);
  if (opts.jumpsuit) n.noCloak = true;
  n.energy = n.maxEnergy; return n;
}

/** A named strong unit (hero / boss / stand-in for units the game lacks): `type` with its hit points overridden. */
export function boss(rt: MissionRuntime, type: UnitType, owner: 'enemy' | 'player', at: Pt, hp: number) {
  const u = rt.spawn(type, owner, at[0], at[1])[0]!; u.maxHealth = u.health = hp; return u;
}

/** Completes `id` when the mission has gathered `n` minerals (workers only). */
export function mineGoal(rt: MissionRuntime, id: string, n: number) {
  rt.onTick(() => { const m = Math.floor(rt.world.mined.player.minerals); if (rt.status(id) === 'active') rt.progress(id, Math.min(n, m)); });
}

/** Scripted allied/enemy group list helper: spawn many squads at once. */
export function squads(rt: MissionRuntime, list: { u: WaveUnit[]; at: Pt; to?: Pt; owner?: 'enemy' | 'player' }[]) {
  return list.map(s => wave(rt, s.u, s.at, s.to ?? s.at, s.owner ?? 'enemy', true));
}

/** Failure when every unit of `list` is dead (e.g. "the shelter must survive"). */
export function failIfAllDead(rt: MissionRuntime, id: string, list: { isDead: boolean }[]) {
  rt.onTick(() => { if (rt.status(id) === 'active' && list.length && list.every(e => e.isDead)) rt.fail(id); });
}

/** Win-by-clearing: completes `id` when every entity in `list` is dead. */
export function destroyAll(rt: MissionRuntime, id: string, list: { isDead: boolean }[]) {
  rt.onTick(() => { if (rt.status(id) === 'active' && list.every(e => e.isDead)) rt.complete(id); });
}

/** Periodic "rescue" objective: units near `at` join the player; counts toward `id`. */
export function rescue(rt: MissionRuntime, id: string, at: Pt, units: WaveUnit[], r = 4) {
  let done = false;
  rt.onTick(() => { if (done || !rt.near(at[0], at[1], r, 'player').length) return; done = true; for (const u of units) rt.spawn(u.type, 'player', at[0] + 1, at[1] + 1, u.n); rt.add(id); });
}

/** Countdown "hold out" objective: completes `id` at `seconds`, optionally harassed by waves. */
export function holdOut(rt: MissionRuntime, id: string, seconds: number) {
  rt.after(seconds, () => rt.complete(id));
  rt.state.holdSeconds = seconds;
}
