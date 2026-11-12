/**
 * Turns a `.openslop2mission` (MissionData) into a MissionDef: the engine runs it like any hand-coded mission.
 *
 * Save / load: everything a trigger does runs through MissionRuntime events or timers, so a save's fireLog replays it and
 * spawned units get the same tags. The interpreter's own bookkeeping (which triggers fired, edge states, counted deaths)
 * lives in `rt.state.dm`, which is saved and restored with the mission.
 */
import { BUILDING_CONFIGS } from '../../config';
import type { BuildingType, UnitType } from '../../types';
import { inShape } from '../../levels/LevelRaster';
import { levelIdOf } from './level';
import type { MissionRuntime } from '../MissionRuntime';
import type { MissionDef } from '../types';
import type { Action, Cond, Diff, GroupDef, MissionData, PerDiff, Trigger, Who } from './MissionData';
import { DIFFS } from './MissionData';

/** Code escape hatch: `hook` conditions return a boolean, `hook` actions do anything. */
export type Hook = (ctx: DataCtx, args?: unknown) => unknown;
export type Hooks = Record<string, Hook>;

const GAME_TO_DIFF: Record<string, Diff> = { easy: 'casual', normal: 'normal', hard: 'hard', insane: 'brutal', elite: 'brutal', cheater: 'brutal' };
export const diffOf = (difficulty: string | undefined): Diff => GAME_TO_DIFF[difficulty ?? 'normal'] ?? 'normal';

/** Value of a per-difficulty field: the exact difficulty's entry, else normal's, else undefined (a missing upgrade = none). */
export function pick<T>(v: PerDiff<T> | undefined, d: Diff): T | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object' || Array.isArray(v) || !DIFFS.some(k => k in (v as object))) return v as T;
  const m = v as Partial<Record<Diff, T>>;
  if (m[d] !== undefined) return m[d];
  return m.normal;
}

export const isBuildingType = (t: string): t is BuildingType => t in BUILDING_CONFIGS;
export { levelIdOf, dataLevel } from './level';

/** What hooks (and the interpreter) can use. */
export interface DataCtx {
  rt: MissionRuntime;
  data: MissionData;
  diff: Diff;
  /** Live and dead entities of a group (empty until spawned), or one unit for `group#n`. */
  units(ref: string): any[];
  alive(ref: string): any[];
  spawnGroup(id: string, at?: [number, number]): any[];
  run(actions: Action[]): void;
}

interface DmState { fired: Record<string, number>; last: Record<string, boolean>; dead: Record<string, number>; taken: Record<string, true> }

export function dataMission(d: MissionData, hooks: Hooks = {}): MissionDef {
  return {
    key: d.key, order: d.order, chapter: d.chapter, title: d.title, subtitle: d.subtitle,
    playerFaction: d.playerFaction, enemyFaction: d.enemyFaction, mapId: levelIdOf(d), difficulty: 'normal',
    noEnemyBase: d.noEnemyBase ?? true, noPlayerBase: d.noPlayerBase, aiOff: d.aiOff ?? true, customWin: true,
    startingMinerals: d.startingMinerals, startingGas: d.startingGas, startingUnits: d.startingUnits, startingBuildings: d.startingBuildings,
    briefing: d.briefing, objectives: d.objectives, gaps: d.gaps, spec: d.spec, data: d,
    script: rt => runData(rt, d, hooks)
  };
}

const POLL = 0.25;

function runData(rt: MissionRuntime, d: MissionData, hooks: Hooks) {
  const w: any = rt.world;
  const diff = diffOf(w.matchConfig?.difficulty);
  rt.state.dm = { fired: {}, last: {}, dead: {}, taken: {} } as DmState;
  const S = () => rt.state.dm as DmState; // the restore replaces the object: always read it through rt.state
  const groups = new Map(d.groups.map(g => [g.id, g]));
  const regions = new Map(d.regions.map(r => [r.id, r]));
  const paths = new Map(d.paths.map(p => [p.id, p]));
  const lines = new Map(d.dialogue.map(l => [l.id, l]));
  const spawned = new Map<string, any[]>();
  for (const s of d.stats ?? []) rt.stats[s.id] ??= 0;

  // ---- enemy upgrades for this difficulty ----
  const up = pick(d.enemyUpgrades, diff) ?? {};
  const eu = w.enemyUpgrades;
  if (eu) {
    if (up.infantryArmor) eu.armorLevel = up.infantryArmor;
    if (up.infantryWeapons) eu.weaponsLevel = up.infantryWeapons;
    if (up.vehicleArmor) eu.vehicleArmorLevel = up.vehicleArmor;
    if (up.vehicleWeapons) eu.vehicleWeaponsLevel = up.vehicleWeapons;
    if (up.shipArmor) eu.shipArmorLevel = up.shipArmor;
    if (up.shipWeapons) eu.shipWeaponsLevel = up.shipWeapons;
  }

  const units = (ref: string): any[] => {
    const [gid, n] = ref.split('#');
    const list = spawned.get(gid!) ?? [];
    return n ? (list[+n - 1] ? [list[+n - 1]] : []) : list;
  };
  const alive = (ref: string) => units(ref).filter(e => !e.isDead);
  const who = (x: Who | undefined): any[] =>
    !x || x === 'player' || x === 'enemy' ? w.units.filter((u: any) => u.playerId === (x ?? 'player') && !u.isDead && !u.scripted) : alive(x);
  const pathPts = (id: string | undefined) => (id ? paths.get(id)?.pts : undefined) ?? [];

  function order(list: any[], pts: [number, number][], type: 'attack_move' | 'move') {
    for (const u of list) {
      if (u.isDead || !u.setCommand) continue;
      pts.forEach((p, i) => u.setCommand({ type, targetPos: { x: p[0], y: p[1] }, queued: i > 0 }));
    }
  }

  function applyBehavior(g: GroupDef, list: any[]) {
    const b = g.behavior; if (!b) return;
    if (b.kind === 'hold') for (const u of list) u.setCommand?.({ type: 'hold' });
    else if (b.kind === 'attackMove') order(list, pathPts(b.path), 'attack_move');
    else if (b.kind === 'patrol') {
      const pts = pathPts(b.path);
      if (pts.length) for (const u of list) { u.setCommand?.({ type: 'patrol', targetPos: { x: pts[pts.length - 1]![0], y: pts[pts.length - 1]![1] } }); }
    } else if (b.kind === 'follow') follow(list, b.leader, b.scripted);
  }

  const followers: { list: any[]; leader: string }[] = [];
  function follow(list: any[], leader: string, scripted?: boolean) {
    if (scripted) for (const u of list) u.scripted = true;
    followers.push({ list, leader });
  }

  function spawnGroup(id: string, at?: [number, number]): any[] {
    const g = groups.get(id); if (!g) return [];
    const [x0, y0] = at ?? g.at;
    const sp = g.spread ?? 1.3;
    const out: any[] = [];
    const total = g.units.reduce((n, u) => n + Math.max(0, pick(u.count, diff) ?? 0), 0);
    const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
    let i = 0;
    const hpScale = g.owner === 'enemy' ? (up.hpScale ?? 1) : 1;
    for (const gu of g.units) {
      const n = Math.max(0, pick(gu.count, diff) ?? 0);
      for (let k = 0; k < n; k++, i++) {
        const pos = { x: x0 + ((i % cols) - (cols - 1) / 2) * sp, y: y0 + (Math.floor(i / cols) - (Math.ceil(total / cols) - 1) / 2) * sp };
        const e = isBuildingType(gu.type) ? w.spawnBuilding(gu.type, g.owner, total === 1 ? { x: x0, y: y0 } : pos, true)
          : w.spawnUnit(gu.type as UnitType, g.owner, pos);
        if (!e) continue;
        if (gu.hp) e.maxHealth = e.health = gu.hp;
        if (hpScale !== 1) { e.maxHealth = Math.max(1, Math.floor(e.maxHealth * hpScale)); e.health = Math.min(e.health, e.maxHealth); }
        if (gu.hero) e.heroName = gu.hero;
        if (g.untargetable) e.untargetable = true;
        if (g.scripted) e.scripted = true;
        if (g.facing !== undefined && 'facing' in e) e.facing = g.facing;
        e.missionGroup = id;
        out.push(e);
      }
    }
    spawned.set(id, [...(spawned.get(id) ?? []), ...out]);
    applyBehavior(g, out);
    return out;
  }

  const speakerOf = (id: string) => {
    const s = d.speakers[id];
    return s ? { id, name: s.name, portrait: s.portrait, unit: s.unit, team: s.team } : { id, name: id };
  };
  const lineSec = (l: { text: string; sec?: number }) => l.sec ?? Math.min(8, Math.max(2.5, l.text.length / 14));

  function say(id: string) {
    const l = lines.get(id); if (!l) return 0;
    const sec = lineSec(l);
    rt.say(l.text, sec, speakerOf(l.speaker));
    return sec;
  }

  function act(x: Action) {
    switch (x.a) {
      case 'spawn': spawnGroup(x.group); break;
      case 'dropPods': {
        const g = groups.get(x.group); if (!g) break;
        const [cx, cy] = x.at ?? g.at;
        // one pod per slot around the target; the units come out of each pod in turn (visual: world.dropPod, Phase 2)
        for (let p = 0; p < x.pods; p++) {
          const ang = (p / x.pods) * Math.PI * 2, at: [number, number] = [cx + Math.cos(ang) * 2.5, cy + Math.sin(ang) * 2.5];
          rt.after(p * 0.6, () => { w.dropPod?.(at[0], at[1]); rt.after(1.2, () => { const list = spawnGroup(x.group, at); void list; }); });
        }
        break;
      }
      case 'say': say(x.line); break;
      case 'sayAll': {
        let t = 0;
        for (const id of x.lines) { const l = lines.get(id); if (!l) continue; rt.after(t, () => say(id)); t += lineSec(l) + (x.gap ?? 0.4); }
        break;
      }
      case 'objective':
        if (x.op === 'reveal') rt.reveal(x.id);
        else if (x.op === 'complete') rt.complete(x.id);
        else if (x.op === 'fail') rt.fail(x.id);
        else rt.add(x.id, x.n ?? 1);
        break;
      case 'camera': rt.focus(x.to[0], x.to[1]); break;
      case 'cutscene': {
        // a step with a line lasts at least as long as its dialogue card (beep + line), so the pictures never run ahead of the words
        w.missionCutscene?.(true);
        let t = 0;
        for (const s of x.steps) {
          rt.after(t, () => {
            if (s.camera) { rt.focus(s.camera[0], s.camera[1]); w.missionCutscene?.(true, s.camera); }
            if (s.say) say(s.say);
            if (s.move) for (const u of alive(s.move.unit)) u.setCommand?.({ type: 'move', targetPos: { x: s.move.to[0], y: s.move.to[1] } });
            if (s.kill) for (const u of alive(s.kill.unit)) {
              const by = s.kill.by ? alive(s.kill.by)[0] : undefined;
              if (by) by.setCommand?.({ type: 'attack', targetEntityId: u.id });
              rt.after(Math.max(0.3, s.wait - 0.2), () => { if (!u.isDead) u.takeDamage(1e6, undefined, false, true); });
            }
          });
          const l = s.say ? lines.get(s.say) : undefined;
          t += l ? Math.max(s.wait, lineSec(l) + 1) : s.wait;
        }
        rt.after(t, () => w.missionCutscene?.(false));
        break;
      }
      case 'attackMove': order(alive(x.group), x.path ? pathPts(x.path) : x.to ? [x.to] : [], 'attack_move'); break;
      case 'move': order(alive(x.group), [x.to], 'move'); break;
      case 'attack': { const t = alive(x.target)[0]; if (t) for (const u of alive(x.group)) u.setCommand?.({ type: 'attack', targetEntityId: t.id }); break; }
      case 'follow': follow(alive(x.group), x.leader, x.scripted); break;
      case 'transfer': for (const u of alive(x.group)) { u.playerId = x.to; u.scripted = false; } break;
      case 'land': {
        // fly to the spot, then land (Viking Assault Mode) once there
        const list = alive(x.group);
        order(list, [x.at], 'move');
        const at = x.at;
        const check = () => {
          let pending = false;
          for (const u of list) {
            if (u.isDead || u.type !== 'viking') continue;
            if (Math.hypot(u.pos.x - at[0], u.pos.y - at[1]) < 4) u.transformMode?.(w, 'D'); else pending = true;
          }
          if (pending) rt.after(0.5, check);
        };
        rt.after(0.5, check);
        break;
      }
      case 'tutorial': w.missionTutorial?.(x.id, x.title, x.text); break;
      case 'block': { const r = regions.get(x.region); if (r) w.missionBlock?.(x.region, r.shape, x.on); break; }
      case 'autosave': if (!rt.restoring) w.missionAutosave?.(); break;
      case 'resources': { const r = w.resources.player; r.minerals += x.minerals ?? 0; r.gas += x.gas ?? 0; break; }
      case 'stat': if (x.op === 'add') rt.addStat(x.id, x.n); else rt.stats[x.id] = x.n; break;
      case 'remove': { const set = new Set(alive(x.group)); w.removeWhere?.((e: any) => set.has(e)); break; }
      case 'win': rt.win(); break;
      case 'lose': rt.lose(x.reason); break;
      case 'hook': hooks[x.name]?.(ctx, x.args); break;
    }
  }
  const run = (list: Action[]) => { for (const x of list) act(x); };
  const ctx: DataCtx = { rt, data: d, diff, units, alive, spawnGroup, run };

  // ---- conditions ----
  function test(c: Cond): boolean {
    switch (c.k) {
      case 'start': return true;
      case 'time': return rt.elapsed >= c.sec;
      case 'every': return true;
      case 'enter': { const r = regions.get(c.region); if (!r) return false; return who(c.who).filter(u => inShape(r.shape, u.pos.x, u.pos.y)).length >= (c.n ?? 1); }
      case 'near': return who(c.who).some(u => Math.hypot(u.pos.x - c.at[0], u.pos.y - c.at[1]) <= c.r);
      case 'dies': { const l = units(c.unit); return l.length > 0 && l.every(e => e.isDead); }
      case 'wiped': { const l = units(c.group); return l.length > 0 && l.every(e => e.isDead); }
      case 'killed': return units(c.group).filter(e => e.isDead).length >= c.n;
      case 'objective': return rt.status(c.id) === c.status;
      case 'trigger': return (S().fired[c.id] ?? 0) > 0;
      case 'stat': return c.op === '>=' ? rt.stat(c.id) >= c.n : rt.stat(c.id) <= c.n;
      case 'hook': return !!hooks[c.name]?.(ctx);
      case 'pickup': return c.id ? !!S().taken[c.id] : Object.keys(S().taken).length >= (c.n ?? 1);
    }
  }
  const extra = (t: Trigger) => (t.if ?? []).every(test);

  // a trigger's firing = mark it, then its actions (now or after `delay`)
  const body = (t: Trigger) => () => {
    S().fired[t.id] = (S().fired[t.id] ?? 0) + 1;
    if (t.delay) rt.after(t.delay, () => run(t.do)); else run(t.do);
  };

  // groups present from the start
  for (const g of d.groups) if (g.spawn === 'start') spawnGroup(g.id);

  const polled: Trigger[] = [];
  for (const t of d.triggers) {
    const fire = body(t);
    if (t.when.k === 'start') { if (extra(t)) fire(); continue; }               // runs inside the setup context: replays by re-running setup
    if (t.when.k === 'time' && !t.if?.length) { rt.after(t.when.sec, fire); continue; } // timers replay natively
    if (t.when.k === 'every') { rt.every(t.when.sec, () => { if (extra(t)) fire(); }); continue; }
    rt.defineEvent(t.id, fire);
    polled.push(t);
  }

  let acc = 0;
  rt.onTick(dt => {
    if (rt.restoring || rt.result) return;
    // followers: stay near the leader, fight on the way (every tick is cheap: one distance test per unit)
    for (const f of followers) {
      const lead = alive(f.leader)[0]; if (!lead) continue;
      for (const u of f.list) {
        if (u.isDead) continue;
        const dx = u.pos.x - lead.pos.x, dy = u.pos.y - lead.pos.y;
        if (dx * dx + dy * dy > 30 && (u.currentCommand?.type !== 'attack_move' || u.followT === undefined || rt.elapsed - u.followT > 1.5)) {
          u.followT = rt.elapsed;
          u.setCommand?.({ type: 'attack_move', targetPos: { x: lead.pos.x + (Math.random() - 0.5) * 4, y: lead.pos.y + (Math.random() - 0.5) * 4 } });
        }
      }
    }
    acc += dt; if (acc < POLL) return; acc = 0;
    const s = S();
    // resource pallets: the first player unit (not a scripted ally) to step on one takes it
    for (const p of d.pickups ?? []) {
      if (s.taken[p.id]) continue;
      if (!w.units.some((u: any) => u.playerId === 'player' && !u.isDead && !u.scripted && !u.isFlying && Math.hypot(u.pos.x - p.at[0], u.pos.y - p.at[1]) < 1.6)) continue;
      s.taken[p.id] = true;
      const r = w.resources.player; r.minerals += p.minerals ?? 0; r.gas += p.gas ?? 0;
      w.missionPickup?.(p.id, true);
      rt.message = `+${p.minerals ?? 0} minerals${p.gas ? `, +${p.gas} gas` : ''}`; rt.messageT = 3; rt.speaker = null;
    }
    // death counters (e.g. civilians lost)
    for (const g of d.groups) {
      if (!g.deathStat) continue;
      const n = units(g.id).filter(e => e.isDead).length, seen = s.dead[g.id] ?? 0;
      if (n > seen) { rt.addStat(g.deathStat, n - seen); s.dead[g.id] = n; }
    }
    for (const t of polled) {
      const once = t.once ?? true;
      if (once && s.fired[t.id]) continue;
      const now = test(t.when) && extra(t);
      const was = s.last[t.id] ?? false;
      s.last[t.id] = now;
      if (now && !was) rt.fireEvent(t.id);
    }
  });
}
