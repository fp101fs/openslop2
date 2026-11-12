import { test, expect } from 'bun:test';
import { ZergAI } from './ZergAI';
import { Unit } from '../simulation/Unit';

const mkWorld = (difficulty = 'hard'): any => ({
  matchConfig: { difficulty, mode: 'skirmish' }, gameTime: 0, units: [], buildings: [], isNetGuest: false,
  sound: { at: () => new Proxy({}, { get: () => () => {} }) }, particles: {}, getUpgrades: () => ({}),
  pathfinding: { isWalkable: () => true, findNearestWalkable: (p: any) => p },
});
const ai = (w: any) => new ZergAI(w) as any;
const at = (type: string, pid: 'player' | 'enemy', x: number, y = 0) => new Unit(type + Math.random(), type as any, pid, { x, y });

test('Thor goes High Impact vs capital ships, back to Explosive vs light air swarms', () => {
  const w = mkWorld(); const a = ai(w);
  const thor = at('thor', 'enemy', 0);
  w.units = [thor, at('battlecruiser', 'player', 8)];
  a.updateModes([thor]);
  expect(thor.transformToType).toBe('thor_ap');
  thor.isTransforming = false; thor.type = 'thor_ap'; thor.transformToType = null;
  w.units = [thor, at('mutalisk', 'player', 8), at('mutalisk', 'player', 9)];
  w.gameTime = 2; a.updateModes([thor]);
  expect(thor.isTransforming).toBe(false); // holds its new mode for a few seconds
  w.gameTime = 10; a.updateModes([thor]);
  expect(thor.transformToType as string | null).toBe('thor');
});

test('Thor ignores air it is already suited for, and no air at all', () => {
  const w = mkWorld(); const a = ai(w);
  const thor = at('thor', 'enemy', 0);
  w.units = [thor, at('mutalisk', 'player', 8)]; a.updateModes([thor]);
  expect(thor.isTransforming).toBe(false);
  w.units = [thor, at('marine', 'player', 5)]; a.updateModes([thor]);
  expect(thor.isTransforming).toBe(false);
});

test('Viking lands to fight ground units with no air around, lifts off when air appears', () => {
  const w = mkWorld(); const a = ai(w);
  const vk = at('viking', 'enemy', 0);
  const marine = at('marine', 'player', 6);
  w.units = [vk, marine]; a.updateModes([vk]);
  expect(vk.transformToType).toBe('viking_assault');
  vk.isTransforming = false; vk.type = 'viking_assault'; vk.isFlying = false; vk.transformToType = null;
  w.gameTime = 10; w.units = [vk, marine, at('medivac', 'player', 9)]; a.updateModes([vk]);
  expect(vk.transformToType as string | null).toBe('viking');
});

test('Viking stays up while enemy air is near; landed Viking lifts off with nothing left to shoot', () => {
  const w = mkWorld(); const a = ai(w);
  const vk = at('viking', 'enemy', 0);
  w.units = [vk, at('marine', 'player', 6), at('banshee', 'player', 10)]; a.updateModes([vk]);
  expect(vk.isTransforming).toBe(false);
  const va = at('viking_assault', 'enemy', 0);
  w.units = [va]; a.updateModes([va]);
  expect(va.transformToType).toBe('viking');
});

test('Easy AI never switches modes; Normal AI does not land Vikings', () => {
  const w = mkWorld('easy'); const a = ai(w);
  const thor = at('thor', 'enemy', 0);
  w.units = [thor, at('battlecruiser', 'player', 8)]; a.updateModes([thor]);
  expect(thor.isTransforming).toBe(false);
  const w2 = mkWorld('normal'); const a2 = ai(w2);
  const vk = at('viking', 'enemy', 0);
  w2.units = [vk, at('marine', 'player', 6)]; a2.updateModes([vk]);
  expect(vk.isTransforming).toBe(false);
});
