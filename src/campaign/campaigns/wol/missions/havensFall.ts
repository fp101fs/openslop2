import { mission } from '../common';
import { place, destroyAll, waves } from '../../../helpers';
import type { Pt } from '../../../helpers';
import { after } from '../common';

/** 6b. Haven's Fall - destroy the Zerg infestation (three infested bases) before the colonies fall. */
export const havensFall = mission({
  key: 'havens_fall', order: 6, chapter: 'Colonist', title: 'Haven\'s Fall', subtitle: 'Destroy the Zerg infestation',
  enemyFaction: 'zerg', mapId: 'wol_havens_fall', startingMinerals: 500, startingGas: 100,
  startingUnits: [{ type: 'wraith', count: 3 }, { type: 'firebat', count: 2 }, { type: 'marine', count: 4 }],
  unlock: d => d.has('outbreak') && after(d, 'outbreak') >= 2,
  briefing: 'Raynor sides with the Protoss: wipe out the Zerg infestation before it spreads from colony to colony.',
  objectives: [
    { id: 'infest', text: 'Destroy the Zerg infestation', kind: 'primary' },
    { id: 'colonies', text: 'Keep settlements protected', kind: 'bonus', passive: true }
  ],
  gaps: ['Virophage morphing / colony infection timer reduced to periodic waves; Vikings are Wraiths'],
  script(rt) {
    const bases: Pt[][] = [[[64, 24], [60, 28], [68, 20]], [[108, 64], [104, 60], [112, 68]], [[64, 104], [60, 100], [68, 108]], [[64, 64], [60, 60]]];
    const list = place(rt, 'enemy', bases.flat().map((at, i) => ({ type: (i % 3 === 0 ? 'hatchery' : i % 3 === 1 ? 'spine_crawler' : 'extractor') as any, at })));
    destroyAll(rt, 'infest', list);
    waves(rt, { start: 50, every: 55, from: [[64, 24], [108, 64], [64, 104]], to: [20, 64], tiers: [{ atMin: 0, units: [{ type: 'zergling', n: 10 }, { type: 'mutalisk', n: 2 }] }, { atMin: 6, units: [{ type: 'roach', n: 6 }, { type: 'broodlord', n: 2 }, { type: 'mutalisk', n: 4 }] }, { atMin: 12, units: [{ type: 'ultralisk', n: 2 }, { type: 'broodlord', n: 3 }] }] });
  }
});
