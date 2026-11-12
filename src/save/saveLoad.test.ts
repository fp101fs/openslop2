import { makeWorld } from '../ai/headlessWorld';
import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { captureGame, restoreGame, defaultSaveName } from './SaveState';
import { encodeSave, decodeSave, cleanSaveName } from './SaveFiles';

const fakeApp = (w: any) => ({ world: w, renderer: { cameraTarget: new THREE.Vector3(30, 0, 40), savedRtsTarget: new THREE.Vector3(), cameraDistance: 30 }, input: { controlGroups: new Map() } });
const run = (w: any, sec: number, dt = 1 / 20) => { for (let t = 0; t < sec; t += dt) w.update(dt); };
const summary = (w: any) => ({
  units: w.units.filter((u: any) => !u.isDead).map((u: any) => `${u.id}:${u.type}:${u.playerId}:${Math.round(u.health)}:${u.pos.x.toFixed(2)},${u.pos.y.toFixed(2)}`).sort(),
  buildings: w.buildings.filter((b: any) => !b.isDead).map((b: any) => `${b.id}:${b.type}:${b.tier}:${Math.round(b.health)}:${b.isConstructed}:${b.queue.length}`).sort(),
  res: JSON.stringify(w.resources), time: w.gameTime, nodes: w.resourceNodes.map((n: any) => n.amount).join(','),
});

async function roundTrip(cfg: any, minutes: number) {
  const a = await makeWorld(cfg);
  run(a, minutes * 60);
  const appA = fakeApp(a);
  // a hands-off player can be wiped by an early rush (no free starting flyer, workers don't fight): give the group fresh units
  const squad = [0, 1, 2].map(i => a.spawnUnit('zealot', 'player', { x: 20 + i * 1.5, y: 20 }));
  appA.input.controlGroups.set(1, squad);
  const data = await decodeSave(await encodeSave(captureGame(appA, 'test')));
  const b = await makeWorld(data.config);
  const appB = fakeApp(b);
  restoreGame(appB, data);
  return { a, b, appB, data };
}

test('skirmish save restores the match exactly', async () => {
  const { a, b, appB, data } = await roundTrip({ enemyFaction: 'zerg', playerFaction: 'protoss', difficulty: 'hard' }, 5);
  expect(summary(b)).toEqual(summary(a));
  expect(b.pathfinding.obstacleGrid).toEqual(a.pathfinding.obstacleGrid);
  expect((b.ai as any).built).toEqual((a.ai as any).built);
  expect(appB.input.controlGroups.get(1)?.map((e: any) => e.id)).toEqual(data.groups[0]![1]);
  // keeps playing without errors
  run(a, 60); run(b, 60);
  expect(b.units.length).toBeGreaterThan(5);
}, 120000);

test('campaign mission save restores objectives, timers and script state', async () => {
  const { a, b } = await roundTrip({ mode: 'campaign', campaignId: 'wol', missionKey: 'outbreak', campaignMissionId: 0, enemyFaction: 'zerg', playerFaction: 'terran', difficulty: 'normal' }, 4);
  expect(summary(b)).toEqual(summary(a));
  const objs = (w: any) => [...w.mission.objectives.values()].map((o: any) => `${o.def.id}:${o.status}:${o.progress}`);
  expect(objs(b)).toEqual(objs(a));
  expect(b.mission.elapsed).toBe(a.mission.elapsed);
  expect((b.mission as any).timers.map((t: any) => t.id)).toEqual((a.mission as any).timers.map((t: any) => t.id));
  // kill a script structure in both: the count goes up by exactly one in each (no double counting of earlier kills)
  const before = objs(b);
  for (const w of [a, b]) { const s = w.buildings.find((x: any) => x.playerId === 'enemy' && x.scriptTag && !x.isDead); s.takeDamage(1e6); run(w, 1); }
  expect(objs(b)).toEqual(objs(a));
  expect(objs(b)).not.toEqual(before);
}, 120000);

test('default save names have no spaces or special characters', () => {
  const n = defaultSaveName({ mode: 'campaign', playerFaction: 'terran' } as any, new Date(2026, 10, 11, 15, 42, 7));
  expect(n).toBe('Campaign_Terran_2026-11-11_15-42-07');
  expect(cleanSaveName('My base: rush #2!.openslop2save')).toBe('My_base_rush_2');
});
