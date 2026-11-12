import { mission } from '../common';
import { boss, place, destroyAll, wave, waves } from '../../../helpers';
import type { Pt } from '../../../helpers';
import { after } from '../common';

/** 6a. Safe Haven - destroy 3 Protoss Nexuses, then the Purifier Mothership; Terror Fleets arrive as colonist outposts fall. */
export const safeHaven = mission({
  key: 'safe_haven', order: 6, chapter: 'Colonist', title: 'Safe Haven', subtitle: 'Protect the Haven colony',
  enemyFaction: 'protoss', mapId: 'wol_safe_haven', startingMinerals: 500, startingGas: 100,
  startingUnits: [{ type: 'marine', count: 6 }, { type: 'wraith', count: 3 }],
  unlock: d => d.has('outbreak') && after(d, 'outbreak') >= 2,
  briefing: 'Dr. Hanson wants the colonists cured, not purified. Destroy the three Nexuses guiding the Purifier, then bring the Purifier down.',
  objectives: [
    { id: 'nexus', text: 'Destroy the 3 Protoss Nexuses', kind: 'primary', target: 3 },
    { id: 'purifier', text: 'Destroy the Purifier Mothership', kind: 'primary', hidden: true },
    { id: 'fleet1', text: 'Stop the first Terror Fleet', kind: 'bonus', hidden: true },
    { id: 'fleet2', text: 'Stop the second Terror Fleet', kind: 'bonus', hidden: true },
    { id: 'fleet3', text: 'Stop the third Terror Fleet', kind: 'bonus', hidden: true }
  ],
  gaps: ['Vikings are represented by Wraiths; Purifier Vortex missing; colonist outposts not simulated'],
  script(rt) {
    const nex = place(rt, 'enemy', [[64, 104], [24, 64], [104, 64]].map(at => ({ type: 'nexus' as const, at: at as Pt })));
    place(rt, 'enemy', [{ type: 'photon_cannon', at: [60, 100] }, { type: 'photon_cannon', at: [28, 60] }, { type: 'photon_cannon', at: [100, 60] }, { type: 'pylon', at: [66, 98] }]);
    let k = 0; rt.onTick(() => { const d = nex.filter(n => n.isDead).length; if (d > k) { rt.progress('nexus', d); k = d; } });
    const purifier = boss(rt, 'void_ray', 'enemy', [64, 70], 6000); rt.state.p = purifier;
    rt.onTick(() => { if (rt.status('nexus') !== 'done') purifier.health = purifier.maxHealth; else if (!rt.state.open) { rt.state.open = true; rt.reveal('purifier'); rt.say('The Purifier is exposed. Bring it down.'); purifier.setCommand({ type: 'attack_move', targetPos: { x: 64, y: 24 } }); } if (purifier.isDead) rt.complete('purifier'); });
    waves(rt, { start: 60, every: 80, from: [[64, 100], [24, 64]], to: [64, 24], tiers: [{ atMin: 0, units: [{ type: 'zealot', n: 6 }, { type: 'stalker', n: 3 }] }, { atMin: 6, units: [{ type: 'stalker', n: 8 }, { type: 'archon', n: 1 }] }] });
    const fleets = [{ id: 'fleet1', at: 4, u: [{ type: 'void_ray' as const, n: 2 }] }, { id: 'fleet2', at: 8, u: [{ type: 'void_ray' as const, n: 4 }] }, { id: 'fleet3', at: 12, u: [{ type: 'void_ray' as const, n: 5 }] }];
    for (const f of fleets) rt.after(f.at * 60, () => { rt.reveal(f.id); rt.say('A Terror Fleet descends on a colonist outpost.'); const ships = wave(rt, f.u, [124, 64], [64, 24]); rt.onTick(() => { if (rt.status(f.id) === 'active' && ships.every(s => s.isDead)) rt.complete(f.id); }); });
  }
});
