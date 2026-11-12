import { test, expect } from 'bun:test';
import { Unit } from './Unit';
import { UNIT_CONFIGS, RESEARCH } from '../config';
import { castAbility, isHiddenFrom, mineBurrowAlertFor } from './Mechanics';

const hits: any[] = [];
const world: any = {
  isNetGuest: false, gameTime: 0, creep: { hasCreep: () => false }, sound: { at: () => new Proxy({}, { get: () => () => {} }) },
  particles: { spawnHeavyTracer: (_a: any, _b: any, cb: () => void) => cb(), spawnMuzzleFlash: () => {}, impactBlast: () => {} }, buildings: [], units: [], resources: {}, scans: [],
  upgrades: { player: {} as any, enemy: {} as any }, getUpgrades(p: string) { return this.upgrades[p]; },
  findNearestHostile: () => null, findTacticalTarget: () => null, getNearbyUnits: () => [], getNearbyBuildings: () => [], later: () => {},
};
const tick = (u: Unit, secs: number, dt = 0.05) => { for (let t = 0; t < secs - 1e-9; t += dt) { world.gameTime += dt; u.update(dt, world); } };
const mkTarget = (type: string, x: number, shield = 0) => { const t = new Unit('t' + Math.random(), type as any, 'enemy', { x, y: 0 }); t.shield = shield; return t; };

test('stats: speed 3.94, 75/25, 21s, 2 supply, 90 HP, 29s cooldown', () => {
  const c = UNIT_CONFIGS.widow_mine;
  expect([c.speed, c.costMinerals, c.costGas, c.buildTime, c.supplyCost, c.maxHealth, c.attackRange]).toEqual([3.94, 75, 25, 21, 2, 90, 5]);
  expect(1 / c.attackSpeed).toBeCloseTo(29, 0);
  const dc = RESEARCH.find(r => r.id === 'drilling_claws')!;
  expect([dc.minerals, dc.gas, dc.time, dc.building, dc.req]).toEqual([75, 75, 79, 'techlab', 'armory']);
});

test('burrow takes 2.14s (0.71s with Drilling Claws); unburrow 0.71s (0.355s)', () => {
  for (const claws of [false, true]) {
    world.upgrades.player = claws ? { techs: { drilling_claws: true } } : {};
    const m = new Unit('m', 'widow_mine' as any, 'player', { x: 0, y: 0 });
    world.units = [m];
    castAbility(world, m, 'burrow' as any, {} as any);
    const t = claws ? 0.71 : 2.14;
    tick(m, t - 0.1); expect(m.burrowed).toBe(false);
    tick(m, 0.25); expect(m.burrowed).toBe(true);
    castAbility(world, m, 'burrow' as any, {} as any);
    const u = claws ? 0.355 : 0.71;
    tick(m, u - 0.1); expect(m.burrowed).toBe(true);
    tick(m, 0.25); expect(m.burrowed).toBe(false);
  }
});

test('lock-on 1.07s, then 125+35 vs shields, 40+25 splash r1.5, ignoring armor; friendly mines immune; cooldown 29s', () => {
  world.upgrades.player = {};
  const m = new Unit('m', 'widow_mine' as any, 'player', { x: 0, y: 0 }); m.burrowed = true;
  const stalker = mkTarget('stalker', 4, 80); const zealotNear = mkTarget('zealot', 5.4, 50); const far = mkTarget('zealot', 6.6, 50);
  const friend = new Unit('f', 'widow_mine' as any, 'player', { x: 4.5, y: 0 }); const marine = new Unit('mr', 'marine' as any, 'player', { x: 4.5, y: 0.5 });
  world.units = [m, stalker, zealotNear, far, friend, marine];
  const hp0 = [stalker.health, zealotNear.health];
  const frames = (secs: number) => { for (let t = 0; t < secs - 1e-9; t += 0.05) { world.gameTime += 0.05; (m as any).performAttack(stalker, world); } };
  frames(1.0); expect(stalker.shield).toBe(80);
  frames(0.2);
  expect(stalker.shield).toBe(0); expect(stalker.health).toBe(hp0[0] - (160 - 80)); // 160 total, 80 absorbed by shields
  expect(zealotNear.shield).toBe(0); expect(zealotNear.health).toBe(hp0[1] - (65 - 50));
  expect(far.shield).toBe(50); expect(friend.health).toBe(friend.maxHealth);
  expect(marine.health).toBe(marine.maxHealth - 40);
  expect(m.attackCooldown).toBeCloseTo(29, 0);
});

test('target leaving range cancels the lock without spending the cooldown', () => {
  const m = new Unit('m', 'widow_mine' as any, 'player', { x: 0, y: 0 }); m.burrowed = true;
  const t = mkTarget('marine', 3); world.units = [m, t];
  (m as any).performAttack(t, world); tick(m, 0.5);
  world.gameTime += 2; // target was out of reach for 2s, nothing called performAttack
  (m as any).performAttack(t, world);
  expect(m.attackCooldown).toBeLessThanOrEqual(0); expect(t.health).toBe(t.maxHealth);
});

test('burrowed mine is revealed while reloading unless Drilling Claws', () => {
  const m = new Unit('m', 'widow_mine' as any, 'player', { x: 0, y: 0 }); m.burrowed = true;
  world.upgrades.player = {};
  expect(isHiddenFrom(world, m, 'enemy')).toBe(true);
  m.attackCooldown = 10; expect(isHiddenFrom(world, m, 'enemy')).toBe(false);
  world.upgrades.player = { techs: { drilling_claws: true } };
  expect(isHiddenFrom(world, m, 'enemy')).toBe(true);
});

test('two friendly mines never auto-target the same unit', () => {
  world.upgrades.player = {};
  const a = new Unit('a', 'widow_mine' as any, 'player', { x: 0, y: 0 }); a.burrowed = true;
  const b = new Unit('b', 'widow_mine' as any, 'player', { x: 0.5, y: 0 }); b.burrowed = true;
  const t1 = mkTarget('marine', 3), t2 = mkTarget('marine', 3.5);
  world.units = [a, b, t1, t2];
  world.findTacticalTarget = (_p: any, _pid: any, _r: any, _air: any, _gr: any, ex?: (u: Unit) => boolean) => [t1, t2].find(t => !ex?.(t)) ?? null;
  (a as any).handleAutoAcquireTarget(world);
  (b as any).handleAutoAcquireTarget(world);
  expect(a.mineLock!.targetId).toBe(t1.id);
  expect(b.mineLock!.targetId).toBe(t2.id);
  world.findTacticalTarget = () => null;
});

test('burrowing in range of enemy units alerts them; mines already burrowed do not', () => {
  let alerts = 0;
  const w2: any = { ...world, sound: { playAdjutant: () => { alerts++; }, at: world.sound.at } };
  w2.mineBurrowAlert = (m: Unit) => mineBurrowAlertFor(w2, m, 'player');
  const mine = new Unit('m', 'widow_mine' as any, 'enemy', { x: 0, y: 0 });
  const mine2 = new Unit('m2', 'widow_mine' as any, 'enemy', { x: 20, y: 0 });
  const marine = new Unit('mr', 'marine' as any, 'player', { x: 4, y: 0 });
  w2.units = [mine, mine2, marine];
  castAbility(w2, mine, 'burrow' as any, {} as any);
  expect(alerts).toBe(1);
  castAbility(w2, mine2, 'burrow' as any, {} as any); // nobody in range
  expect(alerts).toBe(1);
  marine.pos.x = 20; // enters range of an already-burrowed (or burrowing) mine: no new alert
  expect(alerts).toBe(1);
});
