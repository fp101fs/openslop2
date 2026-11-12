import { makeWorld } from '../../ai/headlessWorld';
import { test, expect, beforeAll } from 'bun:test';
import * as THREE from 'three';
import skeleton from './fixtures/outlaws_skeleton.openslop2mission';

/** Mission 2 readiness: The Outlaws' mechanics (base building, rescuing an allied base, raider waves, resource pallets) as data. */
let captureGame: any, restoreGame: any, encodeSave: any, decodeSave: any;
beforeAll(async () => {
  const { dataMission } = await import('./compile');
  ({ captureGame, restoreGame } = await import('../../save/SaveState'));
  ({ encodeSave, decodeSave } = await import('../../save/SaveFiles'));
  const { CAMPAIGNS } = await import('../registry');
  let c = CAMPAIGNS.find(x => x.id === 'test');
  if (!c) { c = { id: 'test', name: 'Test', tagline: '', color: '#fff', hero: 'marine', missions: [] }; CAMPAIGNS.push(c); }
  if (!c.missions.some(m => m.key === skeleton.key)) c.missions.push(dataMission(skeleton));
});
const cfg: any = { mode: 'campaign', campaignId: 'test', missionKey: 'outlaws_skeleton', campaignMissionId: 0, playerFaction: 'terran', enemyFaction: 'terran', mapId: 'sector_vanguard', difficulty: 'normal' };
const run = (w: any, sec: number, dt = 1 / 20) => { for (let t = 0; t < sec; t += dt) w.update(dt); };
const grp = (w: any, id: string) => [...w.units, ...w.buildings].filter((e: any) => e.missionGroup === id && !e.isDead);
const hold = (w: any) => { for (const u of w.units) if (u.playerId === 'player') u.setCommand?.({ type: 'hold' }); };
const fakeApp = (w: any) => ({ world: w, renderer: { cameraTarget: new THREE.Vector3(), savedRtsTarget: new THREE.Vector3(), cameraDistance: 30 }, input: { controlGroups: new Map() } });

test('the skeleton validates against its own map', async () => {
  const { validateMission } = await import('./validate');
  const { dataLevel } = await import('./level');
  expect(validateMission(skeleton, dataLevel(skeleton)).filter(i => i.level === 'error')).toEqual([]);
});

test('base building: the player keeps a base and 400 minerals; the allied rebels are not controllable yet', async () => {
  const w = await makeWorld(cfg);
  expect(w.buildings.some((b: any) => b.playerId === 'player' && b.type === 'command_center')).toBe(true);
  expect(w.resources.player.minerals).toBe(400);
  expect(grp(w, 'outlaws').every((u: any) => u.scripted)).toBe(true);
});

test('raider waves while the rebels wait; reaching them hands their base over; waves stop', async () => {
  const w = await makeWorld(cfg);
  hold(w); run(w, 72);
  expect(grp(w, 'raiders').length).toBeGreaterThanOrEqual(4);
  const m = w.units.find((u: any) => u.playerId === 'player' && u.type === 'marine' && !u.missionGroup);
  m.pos.x = 20; m.pos.y = 60; hold(w); run(w, 1);
  expect(w.mission.status('outlaws')).toBe('done');
  expect(grp(w, 'outlaws').every((u: any) => u.playerId === 'player' && !u.scripted)).toBe(true);
  expect(grp(w, 'outlaw_base')[0].playerId).toBe('player');
  for (const r of grp(w, 'raiders')) r.takeDamage(1e6, undefined, false, true);
  run(w, 75);
  expect(grp(w, 'raiders').length).toBe(0); // no new wave once rescued
});

test('resource pallets: walking over one pays out once; all three fire the condition; survives save / load', async () => {
  const a = await makeWorld(cfg);
  const m = a.units.find((u: any) => u.playerId === 'player' && u.type === 'marine' && !u.missionGroup);
  const before = a.resources.player.minerals;
  m.pos.x = 40; m.pos.y = 90; hold(a); run(a, 1); run(a, 2);
  expect(a.resources.player.minerals).toBe(before + 100);
  const data = await decodeSave(await encodeSave(captureGame(fakeApp(a), 'x')));
  const b = await makeWorld(data.config); restoreGame(fakeApp(b), data);
  expect(b.mission.state.dm.taken).toEqual({ pallet1: true });
  const mb = b.units.find((u: any) => u.id === m.id);
  for (const p of [[40, 90], [52, 76], [70, 70]]) { mb.pos.x = p[0]; mb.pos.y = p[1]; hold(b); run(b, 1); }
  expect(b.resources.player.minerals).toBe(a.resources.player.minerals + 200);
  expect(b.resources.player.gas).toBe(50);
  expect(b.mission.state.dm.fired.all_supplies).toBe(1);
});
