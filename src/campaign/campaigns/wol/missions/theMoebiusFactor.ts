import { mission } from '../common';
import { boss, place, rescue, destroyAll, waves } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 9. The Moebius Factor - destroy 3 Data Cores before Kerrigan reaches one. */
export const theMoebiusFactor = mission({
  key: 'the_moebius_factor', order: 9, chapter: 'Artifact', title: 'The Moebius Factor', subtitle: 'Evacuate the Moebius Foundation',
  enemyFaction: 'zerg', mapId: 'wol_the_moebius_factor', startingMinerals: 400,
  unlock: d => d.has('the_dig') && d.size >= 11, startingUnits: [{ type: 'marine', count: 4 }],
  briefing: 'Kerrigan is attacking the Moebius Foundation headquarters. Destroy the data cores before she can access them, rescuing survivors along the way.',
  objectives: [
    { id: 'cores', text: 'Destroy the 3 Data Cores', kind: 'primary', target: 3 },
    { id: 'kerrigan', text: 'Kerrigan must not access a Data Core', kind: 'primary', passive: true },
    { id: 'brutalisk', text: 'Kill the Brutalisk', kind: 'bonus' },
    { id: 'survivors', text: 'Rescue the stranded Moebius', kind: 'bonus', target: 5 }
  ],
  gaps: ['Medivacs are Wraith-style transports not modelled (units walk); Kerrigan is a strong stand-in', 'Abandoned-structure destruction timer is a Kerrigan raid every few minutes'],
  script(rt) {
    rt.spawn('wraith', 'player', 108, 60, 2); rt.spawn('marauder', 'player', 106, 66, 4); rt.focus(108, 64);
    const cores = place(rt, 'enemy', [{ type: 'spawning_pool', at: [80, 36] }, { type: 'spawning_pool', at: [64, 20] }, { type: 'spawning_pool', at: [30, 90] }]);
    let k = 0; rt.onTick(() => { const d = cores.filter(c => c.isDead).length; if (d > k) { k = d; rt.progress('cores', d); } });
    place(rt, 'enemy', [{ type: 'hatchery', at: [64, 24] }, { type: 'spine_crawler', at: [76, 40] }, { type: 'spine_crawler', at: [34, 86] }]);
    waves(rt, { start: 80, every: 60, from: [[20, 64], [64, 108]], to: [108, 64], tiers: [{ atMin: 0, units: [{ type: 'zergling', n: 8 }, { type: 'hydralisk', n: 2 }] }, { atMin: 6, units: [{ type: 'roach', n: 6 }, { type: 'mutalisk', n: 4 }] }] });
    // Kerrigan: heads for the nearest living core; reaching it fails the mission
    rt.after(6 * 60, () => { rt.say('Kerrigan is moving on a data core!'); const kerr = boss(rt, 'queen', 'enemy', [20, 64], 3000); rt.state.k = kerr;
      rt.every(3, () => { const tgt = cores.find(c => !c.isDead); if (tgt) { kerr.setCommand({ type: 'move', targetPos: { x: tgt.pos.x, y: tgt.pos.y } }); if (Math.hypot(kerr.pos.x - tgt.pos.x, kerr.pos.y - tgt.pos.y) < 5) rt.fail('kerrigan'); } }); });
    const brut = boss(rt, 'ultralisk', 'enemy', [64, 64], 1500); rt.onTick(() => { if (brut.isDead) rt.complete('brutalisk'); });
    for (const at of [[90, 56], [96, 70], [34, 96], [30, 80], [40, 100]] as Pt[]) rescue(rt, 'survivors', at, [{ type: 'marine', n: 3 }]);
  }
});
