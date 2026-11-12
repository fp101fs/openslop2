import { mission } from '../common';
import { boss, place, destroyAll, waves, rescue } from '../../../helpers';
import type { Pt, WaveUnit } from '../../../helpers';

/** 24. Gates of Hell - reach 100 supply by rescuing drop pods and training, then destroy 3 Nydus Worms. */
export const gatesOfHell = mission({
  key: 'gates_of_hell', order: 24, chapter: 'Final', title: 'Gates of Hell', subtitle: 'Gather a large army',
  enemyFaction: 'zerg', mapId: 'wol_gates_of_hell', noPlayerBase: false, startingMinerals: 500, startingGas: 150,
  unlock: d => d.has('maw_of_the_void'),
  startingBuildings: [{ type: 'bunker', dx: -8, dy: 0 }, { type: 'bunker', dx: 8, dy: 0 }, { type: 'bunker', dx: 0, dy: -8 }],
  startingUnits: [{ type: 'siege_tank', count: 2 }, { type: 'marine', count: 8 }, { type: 'marauder', count: 2 }],
  briefing: 'The assault on Char is chaos. Rescue Dominion drop pods and build up 100 supply, then destroy the three Nydus Worms.',
  objectives: [
    { id: 'army', text: 'Build an army totalling 100 supply', kind: 'primary', target: 100 },
    { id: 'nydus', text: 'Destroy the 3 Nydus Worms', kind: 'primary', target: 3, hidden: true }
  ],
  gaps: ['Warfield\'s Camp and the Nydus alternative (nukes) are not special-cased; spore cannons are decor'],
  script(rt) {
    rt.onTick(() => { rt.progress('army', Math.min(100, Math.floor(rt.world.resources.player.supply))); if (rt.status('army') === 'done') rt.reveal('nydus'); });
    const pods: { at: Pt; u: WaveUnit[]; g: WaveUnit[] }[] = [
      { at: [40, 56], u: [{ type: 'marine', n: 6 }, { type: 'medic', n: 2 }], g: [{ type: 'zergling', n: 8 }] }, { at: [44, 80], u: [{ type: 'marauder', n: 4 }, { type: 'medic', n: 2 }], g: [{ type: 'roach', n: 4 }] },
      { at: [30, 66], u: [{ type: 'firebat', n: 4 }, { type: 'marine', n: 4 }], g: [{ type: 'zergling', n: 10 }] }, { at: [48, 44], u: [{ type: 'siege_tank', n: 2 }], g: [{ type: 'hydralisk', n: 4 }] },
      { at: [84, 48], u: [{ type: 'goliath', n: 4 }], g: [{ type: 'roach', n: 6 }] }, { at: [80, 82], u: [{ type: 'ghost', n: 2 }, { type: 'marine', n: 4 }], g: [{ type: 'hydralisk', n: 6 }] },
      { at: [96, 60], u: [{ type: 'banshee', n: 3 }, { type: 'hellion', n: 3 }], g: [{ type: 'baneling', n: 6 }, { type: 'zergling', n: 8 }] }, { at: [92, 72], u: [{ type: 'wraith', n: 4 }], g: [{ type: 'mutalisk', n: 4 }] },
      { at: [100, 52], u: [{ type: 'battlecruiser', n: 2 }], g: [{ type: 'mutalisk', n: 6 }, { type: 'hydralisk', n: 6 }] }, { at: [104, 76], u: [{ type: 'thor', n: 2 }], g: [{ type: 'ultralisk', n: 2 }, { type: 'roach', n: 6 }] }];
    pods.forEach((p, i) => rt.after(60 + Math.floor(i / 2) * 120 + (i % 2) * 20 + (i >= 6 ? 40 : 0), () => { rt.say(`Drop pod ${i + 1} is down.`); rescue(rt, 'pods' as any, p.at, p.u, 4); rt.spawn('zergling', 'enemy', p.at[0] + 2, p.at[1], 0); require_guards(p); }));
    function require_guards(p: { at: Pt; g: WaveUnit[] }) { for (const g of p.g) rt.spawn(g.type, 'enemy', p.at[0] + 3, p.at[1] + 3, g.n); }
    place(rt, 'enemy', [{ type: 'spine_crawler', at: [24, 20] }, { type: 'spine_crawler', at: [20, 104] }, { type: 'spine_crawler', at: [64, 14] }, { type: 'spine_crawler', at: [104, 96] }]);
    waves(rt, { start: 60, every: 50, from: [[20, 20], [20, 108]], to: [64, 64], tiers: [{ atMin: 0, units: [{ type: 'zergling', n: 10 }] }, { atMin: 6, units: [{ type: 'roach', n: 8 }, { type: 'baneling', n: 6 }, { type: 'hydralisk', n: 4 }] }, { atMin: 14, units: [{ type: 'ultralisk', n: 2 }, { type: 'broodlord', n: 2 }] }] });
    const worms = place(rt, 'enemy', ([[108, 20], [112, 28], [104, 28]] as Pt[]).map(at => ({ type: 'spine_crawler' as const, at })));
    worms.forEach(w => { w.maxHealth = w.health = 900; });
    let k = 0; rt.onTick(() => { if (rt.status('nydus') !== 'active') return; const d = worms.filter(w => w.isDead).length; if (d > k) { k = d; rt.progress('nydus', d); } });
    boss(rt, 'broodlord', 'enemy', [100, 30], 600); void destroyAll;
  }
});
