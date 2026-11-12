/**
 * Computer opponent reachability: real headless matches (full simulation and tech gating, no rendering) prove that each race's
 * AI builds its whole multiplayer roster and tech tree on Hard and Elite, and stays within its tech level on Normal / Recruit.
 * Slow by unit-test standards (~1-2 min for all 12 matches).
 */
import { runAudit, type Race, type Difficulty, type AuditResult } from './headlessWorld';
import { test, expect, describe } from 'bun:test';
import { rosterUnits, rosterBuildings } from './roster';
import { UNIT_PLANS, techCap } from './plans';
import { UNIT_SETS } from '../config';

const quiet = <T>(fn: () => Promise<T>): Promise<T> => {
  const saved = [console.log, console.warn, console.error];
  console.log = console.warn = console.error = () => {};
  return fn().finally(() => { [console.log, console.warn, console.error] = saved; });
};
const runs = new Map<string, Promise<AuditResult>>();
const run = (race: Race, d: Difficulty, minutes: number) => {
  const k = `${race}/${d}/${minutes}`;
  if (!runs.has(k)) runs.set(k, quiet(() => runAudit(race, d, minutes)));
  return runs.get(k)!;
};
const levelOf = (race: Race, unit: string) => UNIT_PLANS[race].find(p => p.unit === unit)?.level ?? 1;
const RACES: Race[] = ['terran', 'zerg', 'protoss'];
const TIERS: Record<string, number> = { easy: 0, normal: 1, hard: 2, elite: 4 };

test('every roster unit has a build plan', () => {
  for (const race of RACES) {
    const planned = new Set(UNIT_PLANS[race].map(p => p.unit as string));
    const workers = { terran: 'scv', zerg: 'drone', protoss: 'probe' }[race];
    for (const u of rosterUnits(race)) if (u !== workers && u !== 'overlord' && u !== 'queen') expect(`${race}:${u}:${planned.has(u)}`).toBe(`${race}:${u}:true`);
  }
});

for (const race of RACES) {
  describe(race, () => {
    for (const d of ['hard', 'elite'] as Difficulty[]) {
      // Hard plays on a slower economy (and the default map has one shared expansion), so it gets a longer window
      const minutes = d === 'hard' ? 24 : 20;
      test(`${d}: builds every multiplayer unit and structure within ${minutes} minutes`, async () => {
        const r = await run(race, d, minutes);
        const missingUnits = rosterUnits(race).filter(u => !r.units.has(u));
        // Overlord Pods are only a fallback for a larva-starved, supply-blocked Zerg (Overlords are its supply)
        const missingBuildings = rosterBuildings(race).filter(b => b !== 'overlord_pod' && !r.buildings.has(b));
        expect(missingUnits).toEqual([]);
        expect(missingBuildings).toEqual([]);
        if (race === 'protoss') expect([...r.units].filter(u => u.startsWith('warpin:')).length).toBeGreaterThan(0);
        if (race === 'zerg') expect(r.buildings.has('nydus_worm')).toBe(true); // summoned the Worm for a Nydus attack
      }, 180_000);
    }

    for (const d of ['easy', 'normal'] as Difficulty[]) {
      test(`${d}: builds every unit of its tech level and nothing above it`, async () => {
        const r = await run(race, d, 20);
        const cap = techCap(TIERS[d]!);
        const roster = rosterUnits(race);
        const expected = roster.filter(u => levelOf(race, u) <= cap);
        expect(expected.filter(u => !r.units.has(u))).toEqual([]);
        expect([...r.units].filter(u => roster.includes(u) && levelOf(race, u) > cap)).toEqual([]);
      }, 180_000);
    }

    test('never fields units outside the multiplayer set', async () => {
      const r = await run(race, 'elite', 20);
      expect([...r.units].filter(u => UNIT_SETS.multiplayer.hidden.has(u))).toEqual([]);
    }, 180_000);
  });
}

test('a structure morph in progress cannot be bought again (Planetary Fortress used to charge every think)', async () => {
  const { makeWorld } = await import('./headlessWorld');
  const { castAbility } = await import('../simulation/Mechanics');
  const w = await quiet(() => makeWorld({ enemyFaction: 'terran', difficulty: 'hard' }));
  const cc = w.buildings.find((b: any) => b.playerId === 'enemy' && b.type === 'command_center');
  w.spawnBuilding('engineering_bay', 'enemy', { x: cc.pos.x - 9, y: cc.pos.y }, true);
  w.resources.enemy.minerals = 1000; w.resources.enemy.gas = 1000;
  expect(castAbility(w, cc, 'planetary')).toBeNull();
  expect(castAbility(w, cc, 'planetary')).toBe('Already morphing');
  expect([w.resources.enemy.minerals, w.resources.enemy.gas]).toEqual([850, 850]);
});
