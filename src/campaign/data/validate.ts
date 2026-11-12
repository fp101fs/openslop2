/**
 * Checks a MissionData for mistakes. Pure (no DOM / three): used by tools/campaign/mapcheck.ts and the Mission Builder's
 * Problems panel. `where` is a JSON-ish path the editor can jump to; `at` is a map point when the problem has one.
 */
import { BUILDING_CONFIGS, UNIT_CONFIGS } from '../../config';
import { LevelRaster } from '../../levels/LevelRaster';
import type { LevelDef, Pt, Shape } from '../../levels/LevelTypes';
import type { Action, Cond, MissionData } from './MissionData';

export interface Issue { level: 'error' | 'warn'; where: string; msg: string; at?: Pt }

const FLYING = new Set(Object.entries(UNIT_CONFIGS).filter(([, s]: [string, any]) => s.isFlying).map(([k]) => k));
const centre = (s: Shape): Pt => s.k === 'poly' ? [s.pts.reduce((a, p) => a + p[0], 0) / s.pts.length, s.pts.reduce((a, p) => a + p[1], 0) / s.pts.length] : [s.x, s.y];

export function validateMission(d: MissionData, level?: LevelDef): Issue[] {
  const out: Issue[] = [];
  const err = (where: string, msg: string, at?: Pt) => out.push({ level: 'error', where, msg, at });
  const warn = (where: string, msg: string, at?: Pt) => out.push({ level: 'warn', where, msg, at });

  // ---- unique ids ----
  const ids = (list: { id: string }[], kind: string, path: string) => {
    const seen = new Set<string>();
    list.forEach((x, i) => { if (!x.id) err(`${path}[${i}]`, `${kind} without an id`); else if (seen.has(x.id)) err(`${path}[${i}]`, `duplicate ${kind} id "${x.id}"`); seen.add(x.id); });
    return seen;
  };
  const groups = ids(d.groups, 'group', 'groups'), regions = ids(d.regions, 'region', 'regions'), paths = ids(d.paths, 'path', 'paths');
  const lines = ids(d.dialogue, 'line', 'dialogue'), triggers = ids(d.triggers, 'trigger', 'triggers'), objectives = ids(d.objectives, 'objective', 'objectives');
  const stats = new Set((d.stats ?? []).map(s => s.id)), hooks = new Set(d.hooks ?? []), speakers = new Set(Object.keys(d.speakers ?? {}));
  ids(d.map.decor ?? [], 'decor', 'map.decor');
  const pickups = ids(d.pickups ?? [], 'pickup', 'pickups');

  const unitRef = (where: string, ref: string | undefined) => {
    if (!ref) return;
    const [g, n] = ref.split('#');
    if (!groups.has(g!)) err(where, `unknown group "${g}"`);
    else if (n !== undefined && !(+n >= 1)) err(where, `bad unit index in "${ref}" (use group#1, group#2...)`);
  };
  const whoRef = (where: string, ref: string | undefined) => { if (ref && ref !== 'player' && ref !== 'enemy') unitRef(where, ref); };
  const has = (set: Set<string>, kind: string) => (where: string, id: string | undefined) => { if (id !== undefined && !set.has(id)) err(where, `unknown ${kind} "${id}"`); };
  const region = has(regions, 'region'), path = has(paths, 'path'), line = has(lines, 'dialogue line'), trig = has(triggers, 'trigger');
  const obj = has(objectives, 'objective'), stat = has(stats, 'stat'), hook = has(hooks, 'hook (list it in "hooks")');

  // ---- groups ----
  d.groups.forEach((g, i) => {
    const w = `groups[${i}]`;
    if (g.owner !== 'player' && g.owner !== 'enemy') err(w, `owner must be player or enemy`);
    if (!g.units.length) warn(w, `group "${g.id}" has no units`);
    g.units.forEach((u, j) => {
      if (!(u.type in UNIT_CONFIGS) && !(u.type in BUILDING_CONFIGS)) err(`${w}.units[${j}]`, `unknown unit / building type "${u.type}"`);
      if (u.count && typeof u.count === 'object' && u.count.normal === undefined && Object.keys(u.count).length < 4) warn(`${w}.units[${j}]`, `count has no "normal" value: difficulties not listed get 0`);
    });
    const b = g.behavior;
    if (b?.kind === 'guard') region(`${w}.behavior`, b.region);
    if (b?.kind === 'patrol' || b?.kind === 'attackMove') path(`${w}.behavior`, b.path);
    if (b?.kind === 'follow') unitRef(`${w}.behavior`, b.leader);
    if (g.deathStat) stat(`${w}.deathStat`, g.deathStat);
  });

  // ---- dialogue ----
  d.dialogue.forEach((l, i) => { if (!speakers.has(l.speaker)) err(`dialogue[${i}]`, `unknown speaker "${l.speaker}"`); if (!l.text?.trim()) err(`dialogue[${i}]`, 'empty line'); });

  // ---- triggers ----
  const usedLines = new Set<string>(), touchedObjectives = new Set<string>(), spawnedGroups = new Set<string>();
  const cond = (w: string, c: Cond) => {
    switch (c.k) {
      case 'enter': region(w, c.region); whoRef(w, c.who); break;
      case 'near': whoRef(w, c.who); break;
      case 'dies': unitRef(w, c.unit); break;
      case 'wiped': case 'killed': unitRef(w, c.group); break;
      case 'objective': obj(w, c.id); break;
      case 'trigger': trig(w, c.id); break;
      case 'stat': stat(w, c.id); break;
      case 'hook': hook(w, c.name); break;
      case 'pickup': if (c.id && !pickups.has(c.id)) err(w, `unknown pickup "${c.id}"`); break;
      case 'start': case 'time': case 'every': break;
      default: err(w, `unknown condition "${(c as any).k}"`);
    }
  };
  const action = (w: string, a: Action) => {
    switch (a.a) {
      case 'spawn': case 'dropPods': unitRef(w, a.group); spawnedGroups.add(a.group); break;
      case 'say': line(w, a.line); usedLines.add(a.line); break;
      case 'sayAll': a.lines.forEach(l => { line(w, l); usedLines.add(l); }); break;
      case 'objective': obj(w, a.id); touchedObjectives.add(a.id); break;
      case 'cutscene': a.steps.forEach((s, k) => { if (s.say) { line(`${w}.steps[${k}]`, s.say); usedLines.add(s.say); } unitRef(`${w}.steps[${k}]`, s.move?.unit); unitRef(`${w}.steps[${k}]`, s.kill?.unit); unitRef(`${w}.steps[${k}]`, s.kill?.by); }); break;
      case 'attackMove': unitRef(w, a.group); path(w, a.path); if (!a.path && !a.to) err(w, 'attackMove needs a path or a point'); break;
      case 'move': case 'land': case 'transfer': case 'remove': unitRef(w, a.group); break;
      case 'follow': unitRef(w, a.group); unitRef(w, a.leader); break;
      case 'attack': unitRef(w, a.group); unitRef(w, a.target); break;
      case 'block': region(w, a.region); break;
      case 'stat': stat(w, a.id); break;
      case 'hook': hook(w, a.name); break;
      case 'camera': case 'tutorial': case 'autosave': case 'resources': case 'win': case 'lose': break;
      default: err(w, `unknown action "${(a as any).a}"`);
    }
  };
  d.triggers.forEach((t, i) => {
    const w = `triggers[${i}]`;
    cond(`${w}.when`, t.when);
    (t.if ?? []).forEach((c, j) => cond(`${w}.if[${j}]`, c));
    if (!t.do.length) warn(w, `trigger "${t.id}" does nothing`);
    t.do.forEach((a, j) => action(`${w}.do[${j}]`, a));
  });

  d.dialogue.forEach((l, i) => { if (!usedLines.has(l.id)) warn(`dialogue[${i}]`, `line "${l.id}" is never spoken`); });
  d.objectives.forEach((o, i) => { if (!o.passive && !touchedObjectives.has(o.id)) warn(`objectives[${i}]`, `nothing completes objective "${o.id}"`); });
  d.groups.forEach((g, i) => { if (g.spawn === 'trigger' && !spawnedGroups.has(g.id)) warn(`groups[${i}]`, `group "${g.id}" is never spawned`); });
  if (d.testRoute) path('testRoute', d.testRoute);

  // ---- map points ----
  if (level) {
    const r = new LevelRaster(level), res = r.res, N = res * res, size = level.size;
    const cell = (x: number, y: number) => Math.round(y * 2) * res + Math.round(x * 2);
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x <= size && y <= size;
    const ok = (x: number, y: number) => inside(x, y) && !r.wall[cell(x, y)];
    const comp = new Int32Array(N).fill(-1); const big: number[] = []; let nc = 0;
    for (let s = 0; s < N; s++) {
      if (comp[s]! >= 0 || r.wall[s]) continue;
      const q = [s]; comp[s] = nc; let n = 0;
      while (q.length) {
        const k = q.pop()!; n++; const x = k % res;
        for (const j of [k - 1, k + 1, k - res, k + res]) {
          if (j < 0 || j >= N || comp[j]! >= 0 || r.wall[j]) continue;
          if ((j === k - 1 && x === 0) || (j === k + 1 && x === res - 1)) continue;
          comp[j] = nc; q.push(j);
        }
      }
      big.push(n); nc++;
    }
    const snap = (x: number, y: number) => {
      for (let dd = 0; dd <= 4; dd++) for (let dy = -dd; dy <= dd; dy++) for (let dx = -dd; dx <= dd; dx++) { const px = x + dx * 0.5, py = y + dy * 0.5; if (ok(px, py)) return comp[cell(px, py)]!; }
      return -1;
    };
    const start = d.groups.find(g => g.owner === 'player' && g.spawn === 'start');
    const sc = start ? snap(start.at[0], start.at[1]) : -1;
    if (start && sc < 0) err(`groups[${d.groups.indexOf(start)}]`, `start group "${start.id}" is not on walkable ground`, start.at);
    const ground = (where: string, p: Pt, what: string) => {
      if (!inside(p[0], p[1])) { err(where, `${what} is outside the map (${p[0]}, ${p[1]})`, p); return; }
      const c = snap(p[0], p[1]);
      if (c < 0) err(where, `${what} is inside a wall or cliff`, p);
      else if (sc >= 0 && c !== sc) err(where, `${what} can't be reached from the start${big[c]! < 200 ? ' (tiny pocket)' : ''}`, p);
    };
    d.groups.forEach((g, i) => {
      const air = g.units.every(u => FLYING.has(u.type));
      if (!air) ground(`groups[${i}]`, g.at, `group "${g.id}"`);
      else if (!inside(g.at[0], g.at[1])) err(`groups[${i}]`, `group "${g.id}" is outside the map`, g.at);
    });
    d.paths.forEach((p, i) => p.pts.forEach((pt, j) => ground(`paths[${i}].pts[${j}]`, pt, `path "${p.id}" point ${j + 1}`)));
    d.regions.forEach((rg, i) => { const c = centre(rg.shape); if (!inside(c[0], c[1])) err(`regions[${i}]`, `region "${rg.id}" is outside the map`, c); });
    (d.map.decor ?? []).forEach((p, i) => { if (!inside(p.at[0], p.at[1])) err(`map.decor[${i}]`, `prop "${p.id}" is outside the map`, p.at); });
    (d.pickups ?? []).forEach((p, i) => ground(`pickups[${i}]`, p.at, `pallet "${p.id}"`));
  }
  return out;
}
