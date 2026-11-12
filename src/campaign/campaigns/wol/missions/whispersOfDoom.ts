import { mission } from '../common';
import { boss, place, reach, wave, mustSurvive } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 20. Whispers of Doom (Zeratul) - bring Zeratul and his Stalkers to 3 Xel'Naga shrines, then run to the Void Seeker. */
export const whispersOfDoom = mission({
  key: 'whispers_of_doom', order: 20, chapter: 'Prophecy', title: 'Whispers of Doom', subtitle: 'Bring Zeratul to the shrines',
  playerFaction: 'protoss', enemyFaction: 'zerg', mapId: 'wol_whispers_of_doom', noPlayerBase: true, startingMinerals: 0,
  unlock: d => d.has('the_dig'),
  briefing: 'Zeratul races Kerrigan to the fragments of the prophecy. Slip past the swarm, light three shrines and reach the Void Seeker.',
  objectives: [
    { id: 'shrines', text: 'Bring Zeratul to each Xel\'Naga Shrine', kind: 'primary', target: 3 },
    { id: 'zeratul', text: 'Zeratul must survive', kind: 'primary', passive: true },
    { id: 'seeker', text: 'Escape to the Void Seeker', kind: 'primary', hidden: true },
    { id: 'hatch', text: 'Destroy Zerg Hatcheries', kind: 'bonus', target: 3 }
  ],
  gaps: ['Void Prison/Blink are replaced by Nova\'s cloak kit; Stalkers arrive at the first checkpoint'],
  script(rt) {
    const z = boss(rt, 'nova', 'player', [14, 64], 450); rt.focus(14, 64); mustSurvive(rt, 'zeratul', () => z);
    rt.after(40, () => { rt.spawn('stalker', 'player', 20, 64, 4); rt.say('Stalkers have joined you.'); });
    const shrines: Pt[] = [[30, 40], [64, 30], [100, 50]];
    wave(rt, [{ type: 'zergling', n: 8 }, { type: 'mutalisk', n: 3 }], [60, 62], [60, 62], 'enemy', true);
    wave(rt, [{ type: 'baneling', n: 8 }], [50, 80], [50, 80], 'enemy', true);
    const hatch = place(rt, 'enemy', [{ type: 'hatchery', at: [64, 36] }, { type: 'hatchery', at: [28, 96] }, { type: 'hatchery', at: [100, 70] }]);
    place(rt, 'enemy', [{ type: 'spine_crawler', at: [62, 40] }, { type: 'spine_crawler', at: [30, 92] }]);
    let k = 0; rt.onTick(() => { const d = hatch.filter(h => h.isDead).length; if (d > k) { k = d; rt.progress('hatch', d); } });
    const lit = new Set<number>();
    rt.onTick(() => shrines.forEach((s, i) => { if (!lit.has(i) && rt.near(s[0], s[1], 4, 'player').filter(u => u.type === 'nova').length) { lit.add(i); rt.progress('shrines', lit.size); rt.say(`Shrine ${lit.size} activated.`);
      if (lit.size === 3) { rt.reveal('seeker'); rt.say('Run! The swarm is coming. Reach the Void Seeker!'); rt.every(8, () => wave(rt, [{ type: 'zergling', n: 14 }, { type: 'ultralisk', n: 1 }], [64, 64], [114, 64]), 4); } } }));
    reach(rt, 'seeker', [114, 64], 5, () => rt.status('shrines') === 'done');
  }
});
