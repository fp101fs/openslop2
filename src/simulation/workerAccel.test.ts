import { test, expect } from 'bun:test';
import { Unit } from './Unit';
import { UNIT_ACCELERATION, unitAcceleration } from '../config';

const world: any = { gameTime: 0, isNetGuest: true, creep: { hasCreep: () => false }, sound: {}, particles: {}, buildings: [], units: [], resources: {}, pathfinding: null, getNearbyUnits: () => [], getNearbyBuildings: () => [] };
const step = (u: Unit, target: any, dt = 0.05) => { world.gameTime += dt; u.moveTowards(target, dt, world, true); };

test('acceleration is the SC2 value x1.4² (Faster); 1000-acceleration and unlisted units are instant', () => {
  expect(unitAcceleration('scv')).toBeCloseTo(4.9, 5);
  expect(unitAcceleration('broodlord')).toBeCloseTo(1.063 * 1.96, 5);
  for (const t of ['marine', 'zealot', 'roach', 'thor', 'zergling']) expect(unitAcceleration(t)).toBe(Infinity);
});

test('every unit with an acceleration ramps up to full speed instead of starting at it', () => {
  for (const t of Object.keys(UNIT_ACCELERATION)) {
    const u = new Unit('w', t as any, 'player', { x: 0, y: 0 });
    u.speed = u.baseSpeed;
    step(u, { x: 1000, y: 0 });
    expect(u.curSpeed).toBeCloseTo(unitAcceleration(t) * 0.05, 5);
    expect(u.curSpeed).toBeLessThan(u.speed);
    for (let i = 0; i < 400; i++) step(u, { x: 1000, y: 0 });
    expect(u.curSpeed).toBeCloseTo(u.speed, 5);
  }
});

test('a new leg after a pause restarts from standstill; instant units are unaffected', () => {
  const u = new Unit('w', 'scv' as any, 'player', { x: 0, y: 0 });
  u.speed = u.baseSpeed;
  for (let i = 0; i < 40; i++) step(u, { x: 100, y: 0 });
  world.gameTime += 1;
  step(u, { x: 100, y: 0 });
  expect(u.curSpeed).toBeCloseTo(unitAcceleration('scv') * 0.05, 5);
  const m = new Unit('m', 'marine' as any, 'player', { x: 0, y: 0 });
  m.speed = m.baseSpeed;
  step(m, { x: 100, y: 0 });
  expect(m.pos.x).toBeCloseTo(m.speed * 0.05, 3);
});
