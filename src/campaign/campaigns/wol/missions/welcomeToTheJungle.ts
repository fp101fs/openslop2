import { mission } from '../common';
import { place, wave, waves } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 13. Welcome to the Jungle - capture 7 terrazine canisters; fail if the Protoss seal 7 altars. */
export const welcomeToTheJungle = mission({
  key: 'welcome_to_the_jungle', order: 13, chapter: 'Covert', title: 'Welcome to the Jungle', subtitle: 'Gather Terrazine',
  enemyFaction: 'protoss', mapId: 'wol_welcome_to_the_jungle', startingMinerals: 400, startingGas: 100,
  unlock: d => d.has('the_devils_playground'), startingUnits: [{ type: 'marine', count: 6 }, { type: 'marauder', count: 2 }],
  briefing: 'Steal terrazine gas from the Tal\'darim\'s altars before they seal seven of them.',
  objectives: [
    { id: 'terrazine', text: 'Capture 7 canisters of Terrazine gas', kind: 'primary', target: 7 },
    { id: 'altars', text: 'Don\'t let the Protoss seal 7 altars', kind: 'primary', passive: true },
    { id: 'relics', text: 'Find 3 Protoss Relics', kind: 'bonus', target: 3 }
  ],
  gaps: ['13 deposits modelled as capture points (stand near one with a worker for 20 s); sealing is a Protoss Probe squad timer'],
  script(rt) {
    const deps: Pt[] = [[60, 96], [76, 100], [40, 84], [30, 70], [100, 90], [112, 70], [20, 50], [44, 56], [64, 50], [88, 56], [112, 40], [80, 24], [44, 24]];
    place(rt, 'enemy', [{ type: 'nexus', at: [28, 24] }, { type: 'gateway', at: [36, 30] }, { type: 'photon_cannon', at: [40, 34] }, { type: 'stargate', at: [24, 34] }]);
    const progress = deps.map(() => 0); const state = deps.map(() => 'open' as 'open' | 'taken' | 'sealed');
    rt.onTick(dt => deps.forEach((d, i) => {
      if (state[i] !== 'open') return;
      const near = rt.near(d[0], d[1], 6, 'player').filter(u => u.type === 'scv');
      if (near.length) { progress[i]! += dt; if (progress[i]! >= 20) { state[i] = 'taken'; rt.add('terrazine'); rt.say('Terrazine canister captured.'); wave(rt, [{ type: 'zealot', n: 4 }, { type: 'void_ray', n: 2 }], [28, 30], d); } }
    }));
    // every 2 minutes the Protoss try to seal an open altar (a Probe squad); fails if 7 sealed
    rt.every(120, () => { const open = deps.map((_, i) => i).filter(i => state[i] === 'open'); if (!open.length) return; const i = open[Math.floor(Math.random() * open.length)]!;
      const probes = wave(rt, [{ type: 'probe', n: 2 }, { type: 'zealot', n: 2 }], [28, 30], deps[i]!, 'enemy', true); rt.say('The Protoss are sealing an altar!');
      rt.after(60, () => { if (state[i] === 'open' && probes.some(p => !p.isDead)) { state[i] = 'sealed'; if (state.filter(s => s === 'sealed').length >= 7) rt.fail('altars'); } }); }, 100);
    waves(rt, { start: 120, every: 80, from: [[28, 30]], to: [64, 108], tiers: [{ atMin: 0, units: [{ type: 'zealot', n: 6 }, { type: 'stalker', n: 2 }] }, { atMin: 6, units: [{ type: 'archon', n: 2 }, { type: 'void_ray', n: 3 }, { type: 'stalker', n: 6 }] }] });
    const rel: Pt[] = [[64, 88], [30, 60], [100, 28]]; const got = new Set<number>();
    rt.onTick(() => rel.forEach((s, i) => { if (!got.has(i) && rt.near(s[0], s[1], 3, 'player').length) { got.add(i); rt.progress('relics', got.size); } }));
  }
});
