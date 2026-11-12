import type { MissionDef } from '../../../types';
import { wave, place, mustSurvive, waves } from '../../../helpers';
import { spawnNova } from '../../../helpers';

/** Mission 5. Extract terrazine at devices while infested waves and Tal'darim raids hit. Device count (9), extract time (60 s) and raid cadence are UNVERIFIED. */
export const nightTerrors: MissionDef = {
  key: 'night_terrors', order: 5, chapter: 'Mission Pack 2', title: 'Night Terrors', subtitle: 'Jarban Minor · Acquire the terrazine',
  playerFaction: 'terran', enemyFaction: 'zerg', mapId: 'nco_night_terrors', difficulty: 'normal',
  startingMinerals: 700, startingGas: 200, aiOff: true, customWin: true,
  startingUnits: [{ type: 'marine', count: 6 }, { type: 'siege_tank', count: 2 }],
  briefing: 'Terrazine is drawn from the creatures here. Garrison each extraction device while it works, keep the Tal\'darim from smashing them, and survive the infested.',
  objectives: [
    { id: 'extract', text: 'Extract terrazine', kind: 'primary', target: 6 },
    { id: 'devices', text: 'Devices must not be destroyed (3)', kind: 'primary', passive: true },
    { id: 'mine', text: 'Explore Umojan mine (Blightbringer)', kind: 'bonus', hidden: false },
    { id: 'lab', text: 'Explore science facility (Eradicators)', kind: 'bonus' }
  ],
  spec: 'docs/campaign/nova-covert-ops.md',
  gaps: ['Bosses (Blightbringer, Eradicators) are stand-in strong units', 'HERC compound and Umojan outpost not placed', 'Competing Tal\'darim base is represented only by raid waves'],
  script(rt) {
    const nova = spawnNova(rt, [30, 30]); void nova; rt.focus(24, 24);
    const sites: [number, number][] = [[16, 52], [34, 12], [52, 26], [78, 16], [112, 22], [112, 62], [76, 110], [42, 100], [12, 100]];
    const devices = place(rt, 'player', sites.map(at => ({ type: 'missile_turret' as const, at })));
    const progress = sites.map(() => 0); const done = new Set<number>();
    rt.onTick(dt => {
      sites.forEach((s, i) => {
        if (done.has(i) || devices[i]!.isDead) return;
        if (rt.near(s[0], s[1], 7, 'player').length >= 3 && rt.near(s[0], s[1], 7, 'enemy').length === 0) { progress[i]! += dt; if (progress[i]! >= 60) { done.add(i); rt.add('extract'); rt.say('Terrazine canister extracted.'); } }
      });
      if (devices.filter(d => d.isDead).length >= 3) rt.fail('devices');
    });
    mustSurvive(rt, 'devices', () => ({ isDead: devices.filter(d => d.isDead).length >= 3 }));
    // Tal'darim raid the devices counter-clockwise starting with the south-east pair
    const order = [5, 4, 3, 2, 1, 0, 8, 7, 6]; let k = 0;
    rt.every(170, () => { const i = order[k++ % order.length]!; if (done.has(i) || devices[i]!.isDead) return;
      const ships = wave(rt, [{ type: 'zealot', n: 4 }, { type: 'stalker', n: 3 }, { type: 'void_ray', n: 1 }], [118, 118], sites[i]!);
      void ships; rt.say('Tal\'darim strike force heading for an extractor.'); }, 330);
    waves(rt, { start: 40, every: 35, from: [[104, 104], [8, 120], [120, 8]], to: [30, 30], tiers: [
      { atMin: 0, units: [{ type: 'zergling', n: 10 }] }, { atMin: 6, units: [{ type: 'roach', n: 6 }, { type: 'baneling', n: 6 }] }, { atMin: 14, units: [{ type: 'hydralisk', n: 8 }, { type: 'mutalisk', n: 4 }, { type: 'baneling', n: 8 }] }] });
    // bonus boss rooms
    const rooms: { id: string; at: [number, number]; type: any; hp: number; n: number }[] = [{ id: 'mine', at: [20, 108], type: 'ultralisk', hp: 1800, n: 1 }, { id: 'lab', at: [112, 112], type: 'archon', hp: 1000, n: 2 }];
    for (const r of rooms) {
      let spawned: any[] | null = null;
      rt.onTick(() => {
        if (!spawned && rt.near(r.at[0], r.at[1], 6, 'player').length) { spawned = rt.spawn(r.type, 'enemy', r.at[0], r.at[1], r.n); spawned.forEach(u => { u.maxHealth = u.health = r.hp; }); }
        if (spawned && spawned.every(u => u.isDead)) rt.complete(r.id);
      });
    }
  }
};
