import { mission } from '../common';
import { boss, reach, waves, mustSurvive } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 22. Echoes of the Future - reach the Nexus (starts the wave timer), then bring Zeratul to 4 Overmind Tendrils. */
export const echoesOfTheFuture = mission({
  key: 'echoes_of_the_future', order: 22, chapter: 'Prophecy', title: 'Echoes of the Future', subtitle: 'The Overmind\'s tendrils',
  playerFaction: 'protoss', enemyFaction: 'zerg', mapId: 'wol_echoes_of_the_future', noPlayerBase: false, startingMinerals: 500, startingGas: 100,
  unlock: d => d.has('a_sinister_turn'),
  briefing: 'Zeratul peers into the dead Overmind\'s mind. Reach the Nexus, survive the Zerg waves and touch all four tendrils.',
  objectives: [
    { id: 'nexus', text: 'Reach the Nexus', kind: 'primary' },
    { id: 'tendrils', text: 'Bring Zeratul to the Overmind Tendrils', kind: 'primary', target: 4, hidden: true },
    { id: 'zeratul', text: 'Zeratul must survive', kind: 'primary', passive: true },
    { id: 'obelisks', text: 'Power the Obelisks', kind: 'bonus', target: 2 }
  ],
  gaps: ['Observer and Void Prison omitted; the starting Nexus base is in place from the start'],
  script(rt) {
    const z = boss(rt, 'nova', 'player', [14, 80], 450); mustSurvive(rt, 'zeratul', () => z); rt.focus(14, 80);
    reach(rt, 'nexus', [30, 100], 5);
    rt.onTick(() => { if (rt.status('nexus') === 'done' && !rt.state.go) { rt.state.go = true; rt.reveal('tendrils'); rt.say('The Zerg are coming. A wave arrives every two minutes.');
      waves(rt, { start: 60, every: 120, from: [[100, 24], [64, 20], [20, 40]], to: [30, 100], tiers: [{ atMin: 0, units: [{ type: 'zergling', n: 12 }, { type: 'roach', n: 4 }] }, { atMin: 8, units: [{ type: 'roach', n: 10 }, { type: 'ultralisk', n: 2 }, { type: 'hydralisk', n: 6 }] }] }); } });
    const tend: Pt[] = [[40, 70], [100, 70], [30, 50], [64, 64]]; const t = new Set<number>();
    rt.onTick(() => { if (rt.status('tendrils') !== 'active') return; tend.forEach((s, i) => { if (!t.has(i) && rt.near(s[0], s[1], 4, 'player').filter(u => u.type === 'nova').length) { t.add(i); rt.progress('tendrils', t.size); } }); });
    const ob: Pt[] = [[44, 72], [30, 56]]; const o = new Set<number>();
    rt.onTick(() => ob.forEach((s, i) => { if (!o.has(i) && rt.near(s[0], s[1], 4, 'player').length) { o.add(i); rt.progress('obelisks', o.size); } }));
  }
});
