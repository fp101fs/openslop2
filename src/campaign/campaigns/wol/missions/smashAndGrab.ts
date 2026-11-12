import { mission } from '../common';
import { boss, place, reach, waves, wave, destroyAll } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 7. Smash and Grab - race the Zerg to the artifact; 3 Stone Zealots wake when you enter the artifact circle. */
export const smashAndGrab = mission({
  key: 'smash_and_grab', order: 7, chapter: 'Artifact', title: 'Smash and Grab', subtitle: 'Seize the Xel\'Naga Artifact',
  enemyFaction: 'protoss', mapId: 'wol_smash_and_grab', startingMinerals: 400,
  unlock: d => d.has('zero_hour'), startingUnits: [{ type: 'marine', count: 6 }, { type: 'marauder', count: 2 }, { type: 'medic', count: 1 }],
  briefing: 'The Tal\'darim guard an artifact and the Zerg want it too. Get there first and destroy the three Stone Zealots.',
  objectives: [
    { id: 'artifact', text: 'Get to the Artifact', kind: 'primary' },
    { id: 'zealots', text: 'Destroy the 3 Stone Zealots', kind: 'primary', hidden: true },
    { id: 'relics', text: 'Find the Protoss Relics', kind: 'bonus', target: 4 }
  ],
  gaps: ['Zerg artifact race (timer) is represented by a Zerg attack lane; Stone Zealots are strong Zealots', 'Marauder 100-hp rule not applied'],
  script(rt) {
    const art: Pt = [104, 30];
    place(rt, 'enemy', [{ type: 'nexus', at: [100, 24] }, { type: 'photon_cannon', at: [98, 34] }, { type: 'photon_cannon', at: [108, 36] }, { type: 'pylon', at: [96, 30] }, { type: 'gateway', at: [110, 28] }]);
    wave(rt, [{ type: 'stalker', n: 3 }], [92, 40], [92, 40], 'enemy', true);
    reach(rt, 'artifact', art, 5);
    const stones: any[] = []; rt.onTick(() => { if (rt.status('artifact') === 'done' && !rt.state.sz) { rt.state.sz = true; rt.reveal('zealots'); rt.say('The Stone Zealots awaken!'); for (let i = 0; i < 3; i++) stones.push(boss(rt, 'archon', 'enemy', [art[0] - 3 + i * 3, art[1] + 3], 500)); destroyAll(rt, 'zealots', stones); } });
    waves(rt, { start: 120, every: 90, from: [[24, 30]], to: [20, 104], tiers: [{ atMin: 0, units: [{ type: 'zergling', n: 8 }, { type: 'hydralisk', n: 2 }] }, { atMin: 6, units: [{ type: 'hydralisk', n: 6 }, { type: 'baneling', n: 6 }, { type: 'mutalisk', n: 3 }] }] });
    const sites: Pt[] = [[28, 96], [40, 40], [80, 60], [96, 34]]; const got = new Set<number>();
    rt.onTick(() => sites.forEach((s, i) => { if (!got.has(i) && rt.near(s[0], s[1], 3, 'player').length) { got.add(i); rt.progress('relics', got.size); } }));
  }
});
