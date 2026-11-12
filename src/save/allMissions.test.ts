import { makeWorld } from '../ai/headlessWorld';
import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { captureGame, restoreGame } from './SaveState';
import { encodeSave, decodeSave } from './SaveFiles';

const run = (w: any, sec: number, dt = 1 / 20) => { for (let t = 0; t < sec; t += dt) w.update(dt); };
const fakeApp = (w: any) => ({ world: w, renderer: { cameraTarget: new THREE.Vector3(), savedRtsTarget: new THREE.Vector3(), cameraDistance: 30 }, input: { controlGroups: new Map() } });
const live = (w: any) => [...w.units, ...w.buildings].filter((e: any) => !e.isDead).map((e: any) => `${e.id}:${e.type}`).sort();
const objs = (w: any) => w.mission ? [...w.mission.objectives.values()].map((o: any) => `${o.def.id}:${o.status}:${o.progress}`) : [];

test('every campaign mission survives save / load', async () => {
  const { CAMPAIGNS } = await import('../campaign/registry');
  const problems: string[] = [];
  for (const c of CAMPAIGNS) for (const m of c.missions) {
    const cfg: any = { mode: 'campaign', campaignId: c.id, missionKey: m.key, campaignMissionId: 0, playerFaction: m.playerFaction, enemyFaction: m.enemyFaction, mapId: m.mapId, difficulty: 'normal' };
    try {
      const a = await makeWorld(cfg);
      run(a, 360);
      if (a.isGameOver) continue; // the idle test player lost before the save point
      const data = await decodeSave(await encodeSave(captureGame(fakeApp(a), 'x')));
      const b = await makeWorld(data.config);
      const errs: unknown[] = []; const orig = console.warn; console.warn = (...x: unknown[]) => errs.push(x.join(' '));
      restoreGame(fakeApp(b), data);
      console.warn = orig;
      const la = live(a), lb = live(b);
      if (JSON.stringify(la) !== JSON.stringify(lb)) problems.push(`${m.key}: entities differ (${la.length} vs ${lb.length}) missing=${la.filter(x => !lb.includes(x)).slice(0, 4)} extra=${lb.filter(x => !la.includes(x)).slice(0, 4)}`);
      if (JSON.stringify(objs(a)) !== JSON.stringify(objs(b))) problems.push(`${m.key}: objectives differ ${objs(a)} vs ${objs(b)}`);
      const ta = a.mission.timers.length, tb = b.mission.timers.length;
      if (ta !== tb) problems.push(`${m.key}: timers ${ta} vs ${tb}`);
      if (errs.length) problems.push(`${m.key}: warnings ${errs.slice(0, 2)}`);
      run(b, 60);
      console.log(`${m.key}: ok (${la.length} entities, ${tb} timers, size ${(await encodeSave(data)).length} B)`);
    } catch (e) { problems.push(`${m.key}: threw ${(e as Error).stack?.split('\n').slice(0, 3).join(' | ')}`); }
  }
  console.log(problems.join('\n'));
  expect(problems).toEqual([]);
}, 600000);
