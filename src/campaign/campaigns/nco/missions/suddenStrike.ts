import type { MissionDef } from '../../../types';
import { waves, place, reach, mustSurvive, surviveFor } from '../../../helpers';
import { spawnNova } from '../../../helpers';

/** Mission 2. Hold Horner's base. Length 22 min is UNVERIFIED (sources say 22-30). */
export const suddenStrike: MissionDef = {
  key: 'sudden_strike', order: 2, chapter: 'Mission Pack 1', title: 'Sudden Strike', subtitle: 'Borea · Hold out until the Dominion arrives',
  playerFaction: 'terran', enemyFaction: 'zerg', mapId: 'nco_sudden_strike', difficulty: 'normal',
  startingMinerals: 400, startingGas: 100, noEnemyBase: true, aiOff: true, customWin: true,
  startingUnits: [{ type: 'marine', count: 6 }, { type: 'reaper', count: 4 }, { type: 'marauder', count: 2 }],
  briefing: 'Feral zerg pour through four narrow canyon lanes toward Admiral Horner\'s base. Mine the lanes with Reapers, man the bunkers and hold until the Dominion arrives.',
  objectives: [
    { id: 'defend', text: 'Defend Horner\'s base', kind: 'primary' },
    { id: 'mrc', text: 'Secure Military Research Center', kind: 'bonus', hidden: true },
    { id: 'ewl', text: 'Secure Experimental Weapons Lab', kind: 'bonus', hidden: true }
  ],
  spec: 'docs/campaign/nova-covert-ops.md',
  gaps: ['Spider Mines for Reapers (unit tech) not implemented', 'Wave compositions/timings are estimates', 'Horner\'s AI base is the player base'],
  script(rt) {
    const nova = spawnNova(rt, [30, 96]); rt.focus(30, 96);
    const hq = rt.world.buildings.find(b => b.playerId === 'player' && b.type === 'command_center');
    mustSurvive(rt, 'defend', () => (hq ? hq : undefined));
    void nova;
    const lanes: [number, number][] = [[100, 20], [112, 60], [70, 112], [112, 100]];
    waves(rt, { start: 45, every: 40, from: lanes, to: [26, 100], tiers: [
      { atMin: 0, units: [{ type: 'zergling', n: 8 }, { type: 'roach', n: 2 }] },
      { atMin: 5, units: [{ type: 'roach', n: 6 }, { type: 'hydralisk', n: 3 }, { type: 'baneling', n: 4 }] },
      { atMin: 11, units: [{ type: 'ravager', n: 4 }, { type: 'hydralisk', n: 6 }, { type: 'ultralisk', n: 1 }] },
      { atMin: 17, units: [{ type: 'ultralisk', n: 3 }, { type: 'ravager', n: 5 }, { type: 'baneling', n: 8 }] }
    ] });
    // bonus labs appear halfway; only reapers can reach them
    const labs = place(rt, 'player', [{ type: 'engineering_bay', at: [14, 62] }, { type: 'factory', at: [96, 98] }]);
    rt.after(11 * 60, () => { rt.reveal('mrc'); rt.reveal('ewl'); rt.say('Swann: our research labs are under attack!'); });
    rt.onTick(() => { if (labs[0]!.isDead) rt.fail('mrc'); if (labs[1]!.isDead) rt.fail('ewl'); });
    reach(rt, 'mrc', [16, 64], 5, () => rt.status('mrc') === 'active');
    reach(rt, 'ewl', [94, 96], 5, () => rt.status('ewl') === 'active');
    surviveFor(rt, 'defend', 22 * 60);
  }
};
