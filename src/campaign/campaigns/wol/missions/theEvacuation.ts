import { mission } from '../common';
import { place, reach, waves } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 4. The Evacuation - reach the settlement, then escort 50 colonists in three convoys to the colony ships. */
export const theEvacuation = mission({
  key: 'the_evacuation', order: 4, chapter: 'Colonist', title: 'The Evacuation', subtitle: 'Evacuate the Agria Colony',
  enemyFaction: 'zerg', mapId: 'wol_the_evacuation', startingMinerals: 300,
  startingUnits: [{ type: 'firebat', count: 2 }, { type: 'medic', count: 2 }, { type: 'marine', count: 4 }],
  briefing: 'Fight to Dr. Hanson\'s settlement, then escort convoys of colonists along the road to the spaceport.',
  objectives: [
    { id: 'reach', text: 'Reach Dr. Hanson\'s Settlement', kind: 'primary' },
    { id: 'escort', text: 'Escort colonists to the Colony Ships', kind: 'primary', target: 50, hidden: true },
    { id: 'dna', text: 'Collect Chrysalis DNA', kind: 'bonus', target: 3 }
  ],
  gaps: ['Colonists are represented by SCV transport trucks (one per colonist group); drop pods and Nydus waves are generic'],
  script(rt) {
    rt.focus(100, 100); const settlement: Pt = [24, 24], port: Pt = [104, 104];
    reach(rt, 'reach', settlement, 6);
    rt.onTick(() => { if (rt.status('reach') === 'done' && !rt.state.convoys) {
      rt.state.convoys = true; rt.reveal('escort'); rt.say('The first convoy is leaving. Hold the chokepoints.');
      const sizes = [17, 17, 16]; let delivered = 0;
      sizes.forEach((n, ci) => rt.after(20 + ci * 150, () => {
        const trucks = rt.spawn('scv', 'player', settlement[0] + 3, settlement[1] + 3, n);
        trucks.forEach(t => t.setCommand({ type: 'move', targetPos: { x: port[0], y: port[1] } }));
        rt.say(`Convoy ${ci + 1} departs.`);
        const arrived = new Set<any>();
        rt.onTick(() => { for (const t of trucks) if (!t.isDead && !arrived.has(t) && Math.hypot(t.pos.x - port[0], t.pos.y - port[1]) < 6) { arrived.add(t); delivered++; rt.progress('escort', delivered); t.isDead = true; } });
      }));
      waves(rt, { start: 40, every: 35, from: [[64, 20], [20, 64], [104, 60]], to: [64, 64], tiers: [{ atMin: 0, units: [{ type: 'zergling', n: 8 }, { type: 'roach', n: 2 }] }, { atMin: 6, units: [{ type: 'roach', n: 6 }, { type: 'baneling', n: 6 }, { type: 'ultralisk', n: 1 }] }] });
    } });
    place(rt, 'enemy', [{ type: 'hatchery', at: [20, 108] }, { type: 'hatchery', at: [104, 24] }]);
    for (const at of [[100, 96], [40, 70], [66, 50]] as Pt[]) reach(rt, 'dna', at, 3, () => true);
    // chrysalis: count each distinct site once
    const got = new Set<number>(); const sites: Pt[] = [[100, 96], [40, 70], [66, 50]];
    rt.onTick(() => sites.forEach((s, i) => { if (!got.has(i) && rt.near(s[0], s[1], 3, 'player').length) { got.add(i); rt.progress('dna', got.size); } }));
  }
});
