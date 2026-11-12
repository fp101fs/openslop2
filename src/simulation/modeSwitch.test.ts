import { test, expect } from 'bun:test';
import { Unit } from './Unit';
import { UNIT_CONFIGS, RESEARCH } from '../config';
import { upgradeClassOf } from './Mechanics';

// Minimal world: morphUnit mirrors GameWorld.morphUnit's gameplay fields (no meshes in tests)
const hits: { id: string; dmg: number }[] = [];
const world: any = {
  isNetGuest: false, gameTime: 0, creep: { hasCreep: () => false }, sound: { at: () => new Proxy({}, { get: () => () => {} }) },
  particles: new Proxy({}, { get: () => (...a: any[]) => { const cb = a.find((x: any) => typeof x === 'function'); cb?.({ x: 0, y: 0, z: 0 }); } }),
  buildings: [], units: [], resourceNodes: [], resources: {}, scans: [], fog: { revealCircle: () => {} },
  upgrades: { player: {} as any, enemy: {} as any }, getUpgrades(p: string) { return this.upgrades[p]; },
  pathfinding: { isWalkable: () => true, findNearestWalkable: (p: any) => p },
  findNearestHostile: () => null, findTacticalTarget: () => null, getNearbyUnits: () => [], getNearbyBuildings: () => [], later: () => {},
  morphUnit(u: Unit, t: any) {
    const c = UNIT_CONFIGS[t as keyof typeof UNIT_CONFIGS];
    u.type = t; u.baseSpeed = u.speed = c.speed; u.attackRange = Math.max(c.attackRange, c.airWeapon?.attackRange ?? 0);
    u.damage = c.damage; u.bonusDamage = c.bonusDamage; u.attackSpeed = c.attackSpeed;
    u.isFlying = !!c.isFlying; u.canTargetAir = !!c.canTargetAir; u.canTargetGround = c.canTargetGround;
  },
};
const tick = (u: Unit, secs: number, dt = 0.05) => { for (let t = 0; t < secs - 1e-9; t += dt) { world.gameTime += dt; u.update(dt, world); } };

test('Liquipedia stats: Thor payloads and Viking modes', () => {
  const t = UNIT_CONFIGS.thor.airWeapon!, h = UNIT_CONFIGS.thor_ap.airWeapon!;
  expect([t.damage, t.attackCount, t.bonusDamage?.type, t.bonusDamage?.amount, t.attackRange, t.splashRadius]).toEqual([6, 4, 'light', 6, 10, 0.5]);
  expect(1 / t.attackSpeed).toBeCloseTo(2.14, 2);
  expect([h.damage, h.attackCount, h.bonusDamage?.type, h.bonusDamage?.amount, h.attackRange, h.splashRadius, h.upgradeDamage, h.upgradeBonus]).toEqual([25, 1, 'massive', 10, 11, undefined, 3, 1]);
  expect(1 / h.attackSpeed).toBeCloseTo(0.91, 2);
  const f = UNIT_CONFIGS.viking, a = UNIT_CONFIGS.viking_assault;
  expect([f.costMinerals, f.costGas, f.speed, f.damage, f.attackCount, f.attackRange, f.isFlying, f.canTargetGround]).toEqual([125, 75, 3.85, 10, 2, 9, true, false]);
  expect([a.speed, a.damage, a.bonusDamage?.type, a.bonusDamage?.amount, a.attackRange, !!a.isFlying, a.canTargetAir, a.upgradeBonus]).toEqual([3.15, 12, 'mechanical', 8, 6, false, false, 1]);
  expect(1 / a.attackSpeed).toBeCloseTo(0.71, 2);
  const ss = RESEARCH.find(r => r.id === 'smart_servos')!;
  expect([ss.minerals, ss.gas, ss.time, ss.building, ss.req, ss.hotkey]).toEqual([100, 100, 79, 'techlab', 'armory', 'S']);
});

test('Thor: E -> High Impact after ~1.8s, locked in place; D back; Smart Servos 0.71s', () => {
  for (const servos of [false, true]) {
    world.upgrades.player = servos ? { techs: { smart_servos: true } } : {};
    const th = new Unit('th', 'thor', 'player', { x: 10, y: 10 });
    expect(th.transformMode(world, 'D')).toBe(false); // already Explosive Payload
    expect(th.transformMode(world, 'E')).toBe(true);
    th.setCommand({ type: 'move', targetPos: { x: 30, y: 10 } } as any);
    const secs = servos ? 0.71 : 1.8;
    tick(th, secs - 0.1);
    expect(th.type).toBe('thor');
    expect(th.pos.x).toBe(10); // cannot move while transforming
    tick(th, 0.2);
    expect(th.type).toBe('thor_ap');
    expect(th.attackRange).toBe(11);
    expect(th.transformMode(world, 'D')).toBe(true);
    tick(th, secs + 0.1);
    expect(th.type).toBe('thor');
  }
});

test('High Impact: one 25 (+10 vs massive) hit per 0.91s on air; ground weapon unchanged', () => {
  world.upgrades.player = {};
  const th = new Unit('th', 'thor_ap', 'player', { x: 0, y: 0 });
  const w = th.weaponVs(new Unit('bc', 'battlecruiser', 'enemy', { x: 5, y: 0 }));
  expect([w.damage, w.count, w.bonus?.amount, w.range]).toEqual([25, 1, 10, 11]);
  const g = th.weaponVs(new Unit('m', 'marine', 'enemy', { x: 5, y: 0 }));
  expect([g.damage, g.count, g.range]).toEqual([30, 2, 7]);
});

test('Viking: lands in ~1.85s (airborne during the transform), becomes a ground unit; lifts off airborne at once', () => {
  world.upgrades.player = {};
  const v = new Unit('v', 'viking', 'player', { x: 5, y: 5 });
  expect(v.transformMode(world, 'E')).toBe(false);
  expect(v.transformMode(world, 'D')).toBe(true);
  tick(v, 1.0);
  expect(v.isFlying).toBe(true); // still an air unit until it touches down
  expect(v.flightAltitude).toBeLessThan(Unit.CRUISE_ALTITUDE);
  tick(v, 1.0);
  expect(v.type).toBe('viking_assault');
  expect([v.isFlying, v.canTargetAir, v.canTargetGround, v.attackRange, v.baseSpeed]).toEqual([false, false, true, 6, 3.15]);
  expect(v.transformMode(world, 'E')).toBe(true);
  expect(v.isFlying).toBe(true); // airborne from the start of lift-off
  tick(v, 1.9);
  expect(v.type).toBe('viking');
  expect(v.flightAltitude).toBe(Unit.CRUISE_ALTITUDE);
  expect([v.canTargetAir, v.canTargetGround]).toEqual([true, false]);
});

test('Viking: Smart Servos ~1.13s; refuses to land with no pathable ground nearby', () => {
  world.upgrades.player = { techs: { smart_servos: true } };
  const v = new Unit('v', 'viking', 'player', { x: 5, y: 5 });
  v.transformMode(world, 'D'); tick(v, 1.2);
  expect(v.type).toBe('viking_assault');
  const pf = world.pathfinding;
  world.pathfinding = { isWalkable: () => false, findNearestWalkable: (p: any) => p };
  const v2 = new Unit('v2', 'viking', 'player', { x: 5, y: 5 });
  expect(v2.transformMode(world, 'D')).toBe(false);
  world.pathfinding = pf;
});

test('Viking always uses Ship upgrades; Thor modes use Vehicle', () => {
  expect(upgradeClassOf('viking', true)).toBe('ship');
  expect(upgradeClassOf('viking_assault', false)).toBe('ship');
  expect(upgradeClassOf('thor', false)).toBe('vehicle');
  expect(upgradeClassOf('thor_ap', false)).toBe('vehicle');
});

test('Assault Mode Gatling: 12 (+8 vs mechanical) per shot, +1 / +1 per Ship Weapons level', () => {
  world.upgrades.player = { weaponsLevel: 0, vehicleWeaponsLevel: 0, shipWeaponsLevel: 0 };
  const v = new Unit('v', 'viking_assault', 'player', { x: 0, y: 0 });
  const tank = new Unit('t', 'siege_tank', 'enemy', { x: 4, y: 0 });
  const marine = new Unit('m', 'marine', 'enemy', { x: 4, y: 0.5 });
  world.units = [v, tank, marine];
  const h0 = tank.health; (v as any).performAttack(tank, world);
  expect(h0 - tank.health).toBe(20 - tank.armor);
  v.attackCooldown = 0;
  const m0 = marine.health; (v as any).performAttack(marine, world);
  expect(m0 - marine.health).toBe(12 - marine.armor);
  world.upgrades.player.shipWeaponsLevel = 2; v.attackCooldown = 0;
  const h1 = tank.health; (v as any).performAttack(tank, world);
  expect(h1 - tank.health).toBe(24 - tank.armor);
  void hits;
});
