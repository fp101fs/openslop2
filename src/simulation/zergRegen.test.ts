import { test, expect } from 'bun:test';
import { Unit } from './Unit';
import { Building } from './Building';
import { ZERG_REGEN_RATE, ROACH_BURROW_REGEN_RATE } from '../config';

const world: any = { isNetGuest: true, creep: { hasCreep: () => false }, sound: {}, particles: {}, buildings: [], units: [], resources: {}, findNearestHostile: () => null, findTacticalTarget: () => null, getNearbyUnits: () => [], getNearbyBuildings: () => [] };
const run = (e: any, secs: number, dt = 0.05) => { for (let t = 0; t < secs - 1e-9; t += dt) e.update(dt, world); };

test('Faster-speed rate is 0.38 HP/s (0.27 at Normal)', () => {
  expect(ZERG_REGEN_RATE).toBeCloseTo(0.38, 2);
  expect(ZERG_REGEN_RATE / 1.4).toBeCloseTo(0.27, 2);
});

test('Zerg units regenerate 0.38 HP/s; other races do not', () => {
  const z = new Unit('z', 'zergling' as any, 'player', { x: 0, y: 0 });
  z.health = 10;
  run(z, 10);
  expect(z.health).toBeCloseTo(10 + ZERG_REGEN_RATE * 10, 1);
  const m = new Unit('m', 'marine' as any, 'player', { x: 0, y: 0 });
  m.health = 10;
  run(m, 10);
  expect(m.health).toBe(10);
});

test('burrowed Roach regenerates 7 HP/s in total, unburrowed 0.38', () => {
  const r = new Unit('r', 'roach' as any, 'player', { x: 0, y: 0 });
  r.health = 10;
  run(r, 2);
  expect(r.health).toBeCloseTo(10 + ZERG_REGEN_RATE * 2, 1);
  r.burrowed = true;
  const h = r.health;
  run(r, 2);
  expect(r.health).toBeCloseTo(h + ROACH_BURROW_REGEN_RATE * 2, 1);
});

test('finished Zerg structures regenerate, even off creep, capped at max; Terran do not', () => {
  const s = new Building('s', 'spawning_pool' as any, 'player', { x: 0, y: 0 }, true);
  s.health = 100;
  run(s, 10);
  expect(s.health).toBeCloseTo(100 + ZERG_REGEN_RATE * 10, 1);
  s.health = s.maxHealth - 0.1;
  run(s, 5);
  expect(s.health).toBe(s.maxHealth);
  const d = new Building('d', 'supply_depot' as any, 'player', { x: 0, y: 0 }, true);
  d.health = 100;
  run(d, 10);
  expect(d.health).toBe(100);
});

test('larvae and eggs regenerate too', () => {
  for (const t of ['larva', 'egg']) {
    const e: any = new Unit(t, t as any, 'player', { x: 0, y: 0 });
    e.hatcheryId = 'h';
    e.egg = { t: 0, total: 1000 };
    e.health = 1;
    const w = { ...world, buildings: [{ id: 'h', isDead: false }] };
    for (let i = 0; i < 200; i++) e.update(0.05, w);
    expect(e.health).toBeCloseTo(1 + ZERG_REGEN_RATE * 10, 1);
  }
});
