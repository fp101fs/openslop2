import { makeWorld } from '../ai/headlessWorld';
import { test, expect } from 'bun:test';

test('the Probe that warps in an Assimilator harvests it once it finishes', async () => {
  const w = await makeWorld({ playerFaction: 'protoss', enemyFaction: 'terran' });
  w.ai.update = () => {};
  const probe = w.units.find((u: any) => u.playerId === 'player' && u.type === 'probe');
  const nexus = w.buildings.find((b: any) => b.playerId === 'player' && b.type === 'nexus');
  const geyser = w.resourceNodes.filter((r: any) => r.type === 'vespene')
    .sort((a: any, b: any) => Math.hypot(a.pos.x - nexus.pos.x, a.pos.y - nexus.pos.y) - Math.hypot(b.pos.x - nexus.pos.x, b.pos.y - nexus.pos.y))[0];
  w.resources.player.minerals = 1000;
  const res = w.placeBuilding('player', 'assimilator', geyser.pos, probe.id, false);
  expect(res.ok).toBe(true);
  for (let t = 0; t < 40; t += 0.05) w.update(0.05);
  expect(res.building.isConstructed).toBe(true);
  expect(probe.isGathering).toBe(true);
  expect(probe.targetNodeId).toBe(geyser.id);
}, 30000);

test('a Pylon power field shows only when selected, or for all own Pylons when asked', async () => {
  const w = await makeWorld({ playerFaction: 'protoss', enemyFaction: 'terran' });
  const nexus = w.buildings.find((b: any) => b.playerId === 'player' && b.type === 'nexus');
  const pylon = w.spawnBuilding('pylon', 'player', { x: nexus.pos.x + 8, y: nexus.pos.y }, true);
  const unfinished = w.spawnBuilding('pylon', 'player', { x: nexus.pos.x - 8, y: nexus.pos.y }, false);
  w.selectedEntities = [];
  w.updatePowerFields(false);
  expect(pylon.powerField.visible).toBe(false);
  w.selectedEntities = [pylon];
  w.updatePowerFields(false);
  expect(pylon.powerField.visible).toBe(true);
  w.selectedEntities = [];
  w.updatePowerFields(true);
  expect(pylon.powerField.visible).toBe(true);
  expect(unfinished.powerField.visible).toBe(false);
}, 30000);
