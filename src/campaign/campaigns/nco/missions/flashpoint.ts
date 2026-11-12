import type { MissionDef } from '../../../types';
import { wave, reach } from '../../../helpers';
import { spawnNova } from '../../../helpers';
import type { UnitType } from '../../../../types';

/** Mission 6. Five memory sites (Liquipedia: 5; Fandom says 6), each removing a zerg strain from the attack waves. Wave pacing UNVERIFIED. */
export const flashpoint: MissionDef = {
  key: 'flashpoint', order: 6, chapter: 'Mission Pack 2', title: 'Flashpoint', subtitle: 'Antiga Prime · Find the evidence',
  playerFaction: 'terran', enemyFaction: 'zerg', mapId: 'nco_flashpoint', difficulty: 'normal',
  startingMinerals: 600, startingGas: 150, aiOff: true, customWin: true,
  startingUnits: [{ type: 'marine', count: 6 }, { type: 'siege_tank', count: 2 }],
  briefing: 'Nova searches New Andasar for places that trigger her memories. Each recovered memory reveals the strain of zerg the Defenders lured here; destroy its structures and it stops attacking. Then reach the operations centre.',
  objectives: [
    { id: 'memory', text: 'Search coordinates with Nova', kind: 'primary', target: 5 },
    { id: 'ops', text: 'Reach the operations centre', kind: 'primary', hidden: true },
    { id: 'weapon', text: 'Recover experimental weapon', kind: 'bonus' }
  ],
  spec: 'docs/campaign/nova-covert-ops.md',
  gaps: ['Strain structures are not separately spawned: each memory site simply removes that unit type from the waves', 'Terrazine microdose flashback cutscenes omitted'],
  script(rt) {
    spawnNova(rt, [30, 30]); rt.focus(24, 24);
    const pool: UnitType[] = ['zergling', 'roach', 'hydralisk', 'baneling', 'ultralisk', 'mutalisk', 'broodlord'];
    const sites: { at: [number, number]; strain: UnitType; say: string }[] = [
      { at: [44, 44], strain: 'baneling', say: 'Memory: baneling swarms. Their nests are marked.' },
      { at: [84, 44], strain: 'broodlord', say: 'Memory: brood lords. Their spire is marked.' },
      { at: [44, 84], strain: 'ultralisk', say: 'Memory: ultralisks. Their cavern is marked.' },
      { at: [64, 64], strain: 'mutalisk', say: 'Memory: mutalisks. Their spire is marked.' },
      { at: [100, 30], strain: 'hydralisk', say: 'Memory: lurker spawn. Their den is marked.' }];
    sites.forEach(s => rt.onTick(() => {
      if ((s as any).done || !rt.near(s.at[0], s.at[1], 4, 'player').length) return;
      (s as any).done = true; rt.add('memory'); rt.say(s.say); const i = pool.indexOf(s.strain); if (i >= 0) pool.splice(i, 1);
    }));
    rt.onTick(() => { if (rt.status('memory') === 'done') rt.reveal('ops'); });
    rt.every(32, () => {
      const m = rt.elapsed / 60, p = pool.filter(t => t !== 'zergling');
      const units = [{ type: 'zergling' as UnitType, n: 8 }, ...(p.length ? [{ type: p[Math.floor(Math.random() * p.length)]!, n: 3 + Math.floor(m / 3) }] : [])];
      wave(rt, units, m < 4 ? [64, 124] : [[8, 120], [120, 8], [120, 120]][Math.floor(Math.random() * 3)] as [number, number], [26, 26]);
    }, 40);
    reach(rt, 'weapon', [64, 64], 5);
    reach(rt, 'ops', [106, 106], 5, () => rt.status('ops') === 'active');
  }
};
