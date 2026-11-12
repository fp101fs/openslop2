import { makeWorld } from '../../ai/headlessWorld';
import { test, expect, beforeAll } from 'bun:test';
import * as THREE from 'three';
import fixture from './fixtures/fixture.openslop2mission';
import type { MissionData } from './MissionData';

let dataMission: typeof import('./compile').dataMission, pick: typeof import('./compile').pick;
let validateMission: typeof import('./validate').validateMission;
let captureGame: any, restoreGame: any, encodeSave: any, decodeSave: any;

beforeAll(async () => {
  ({ dataMission, pick } = await import('./compile'));
  ({ validateMission } = await import('./validate'));
  ({ captureGame, restoreGame } = await import('../../save/SaveState'));
  ({ encodeSave, decodeSave } = await import('../../save/SaveFiles'));
  // register the fixture as a one-mission campaign so GameWorld finds it like any other
  const { CAMPAIGNS } = await import('../registry');
  let c = CAMPAIGNS.find(x => x.id === 'test');
  if (!c) { c = { id: 'test', name: 'Test', tagline: '', color: '#fff', hero: 'marine', missions: [] }; CAMPAIGNS.push(c); }
  if (!c.missions.some(m => m.key === fixture.key)) c.missions.push(dataMission(fixture));
});

const cfg = (difficulty = 'normal'): any => ({ mode: 'campaign', campaignId: 'test', missionKey: 'fixture', campaignMissionId: 0, playerFaction: 'terran', enemyFaction: 'terran', mapId: 'sector_vanguard', difficulty });
const run = (w: any, sec: number, dt = 1 / 20) => { for (let t = 0; t < sec; t += dt) w.update(dt); };
const group = (w: any, id: string) => [...w.units, ...w.buildings].filter((e: any) => e.missionGroup === id);
const alive = (w: any, id: string) => group(w, id).filter((e: any) => !e.isDead);
const freeze = (w: any) => { for (const u of w.units) { u.setCommand?.({ type: 'hold' }); } };
const fakeApp = (w: any) => ({ world: w, renderer: { cameraTarget: new THREE.Vector3(), savedRtsTarget: new THREE.Vector3(), cameraDistance: 30 }, input: { controlGroups: new Map() } });

test('pick: bare value, exact, normal fallback, nearest', () => {
  expect(pick(4, 'hard')).toBe(4);
  expect(pick({ casual: 2, normal: 3, brutal: 5 }, 'brutal')).toBe(5);
  expect(pick({ casual: 2, normal: 3, brutal: 5 }, 'hard')).toBe(3);
  expect(pick({ casual: 2, brutal: 5 }, 'hard')).toBe(undefined);
  expect(pick({ brutal: 5 }, 'casual')).toBe(undefined);
  expect(pick({ hpScale: 0.5 } as any, 'hard')).toEqual({ hpScale: 0.5 });
});

test('groups: start groups spawn with per-difficulty counts, hp override and casual half HP', async () => {
  const n = await makeWorld(cfg('normal')), c = await makeWorld(cfg('easy')), b = await makeWorld(cfg('insane'));
  expect([alive(c, 'guards').length, alive(n, 'guards').length, alive(b, 'guards').length]).toEqual([2, 3, 5]);
  expect(alive(n, 'hero')[0].maxHealth).toBe(400);
  expect(alive(c, 'guards')[0].maxHealth).toBe(Math.floor(alive(n, 'guards')[0].maxHealth / 2));
  expect(b.enemyUpgrades.armorLevel).toBe(1);
  expect(alive(n, 'pods').length).toBe(0); // spawn: 'trigger'
});

test('triggers: start / time / every / enter / dropPods / stat edge / wiped → win', async () => {
  const w = await makeWorld(cfg());
  const rt = w.mission;
  expect(rt.message).toBe("Let's move.");
  freeze(w); run(w, 6);
  expect(alive(w, 'folk').length).toBe(2);
  expect(alive(w, 'folk').every((u: any) => u.scripted)).toBe(true);
  // walk Raynor into the camp region: pods land and the hidden bonus appears
  const hero = alive(w, 'hero')[0]; hero.pos.x = 40; hero.pos.y = 30; freeze(w);
  run(w, 4);
  expect(rt.status('bonus')).toBe('active');
  expect(alive(w, 'pods').length).toBe(9); // 3 pods × the group's 3 Marines
  run(w, 10); // ticks stat reaches 1 → edge trigger adds 1 once (not every poll)
  expect(rt.stat('ticks')).toBeGreaterThanOrEqual(1);
  expect(rt.objectives.get('bonus').progress).toBe(1);
  for (const e of alive(w, 'guards')) e.takeDamage(1e6, undefined, false, true);
  run(w, 2);
  expect(rt.status('clear')).toBe('done');
  expect(rt.result).toBe('victory');
});

test('deathStat counts deaths of a group once each', async () => {
  const w = await makeWorld(cfg());
  freeze(w); run(w, 6);
  const f = alive(w, 'folk'); f[0].takeDamage(1e6, undefined, false, true);
  run(w, 1); run(w, 1);
  expect(w.mission.stat('lost')).toBe(1);
});

test('hero death fails the passive objective and loses', async () => {
  const w = await makeWorld(cfg());
  alive(w, 'hero')[0].takeDamage(1e6, undefined, false, true);
  run(w, 1);
  expect(w.mission.result).toBe('defeat');
});

test('save / load after a polled trigger: same entities, objectives, stats; nothing spawns twice', async () => {
  const a = await makeWorld(cfg());
  freeze(a); run(a, 6);
  const hero = alive(a, 'hero')[0]; hero.pos.x = 40; hero.pos.y = 30; freeze(a);
  run(a, 12);
  const data = await decodeSave(await encodeSave(captureGame(fakeApp(a), 'x')));
  const b = await makeWorld(data.config);
  restoreGame(fakeApp(b), data);
  const live = (w: any) => [...w.units, ...w.buildings].filter((e: any) => !e.isDead).map((e: any) => `${e.id}:${e.type}`).sort();
  expect(live(b)).toEqual(live(a));
  expect([...b.mission.objectives.values()].map((o: any) => o.status + o.progress)).toEqual([...a.mission.objectives.values()].map((o: any) => o.status + o.progress));
  expect(b.mission.stats).toEqual(a.mission.stats);
  expect(alive(b, 'pods').length).toBe(9);
  // the restored world keeps running without re-firing the camp trigger
  run(b, 5);
  expect(alive(b, 'pods').length).toBe(9);
  expect(b.mission.state.dm.fired.reach).toBe(1);
});

test('validate: the fixture is clean; broken references are reported', () => {
  expect(validateMission(fixture).filter(i => i.level === 'error')).toEqual([]);
  const bad: MissionData = JSON.parse(JSON.stringify(fixture));
  bad.triggers.push({ id: 'x', when: { k: 'enter', region: 'nowhere' }, do: [{ a: 'spawn', group: 'ghosts' }, { a: 'say', line: 'nope' }] });
  bad.groups.push({ id: 'hero', owner: 'enemy', at: [1, 1], spawn: 'start', units: [{ type: 'tauren' as any, count: 1 }] });
  const msgs = validateMission(bad).filter(i => i.level === 'error').map(i => i.msg);
  expect(msgs).toContain('unknown region "nowhere"');
  expect(msgs).toContain('unknown group "ghosts"');
  expect(msgs).toContain('unknown dialogue line "nope"');
  expect(msgs).toContain('duplicate group id "hero"');
  expect(msgs).toContain('unknown unit / building type "tauren"');
});
