import { mission } from '../common';
import { place, rescue, waves, wave } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 3. Zero Hour - hold out 20:00 against escalating Zerg waves (unending in the last minute). Three rebel squads appear at 3:30 / 8:00 / 12:30. */
export const zeroHour = mission({
  key: 'zero_hour', order: 3, chapter: 'Mar Sara', title: 'Zero Hour', subtitle: 'Hold out until extraction',
  enemyFaction: 'zerg', mapId: 'wol_zero_hour', startingMinerals: 500,
  startingBuildings: [{ type: 'bunker', dx: -6, dy: -8 }, { type: 'bunker', dx: -9, dy: -6 }, { type: 'bunker', dx: 8, dy: -10 }, { type: 'bunker', dx: -10, dy: 8 }],
  startingUnits: [{ type: 'marine', count: 8 }],
  briefing: 'The Zerg have returned. Hold the high-ground base for 20 minutes until the Hyperion arrives.',
  objectives: [
    { id: 'hold', text: 'Hold out for evacuation (20 minutes)', kind: 'primary' },
    { id: 'rebels', text: 'Rescue the rebel squads', kind: 'bonus', target: 3, hidden: true }
  ],
  gaps: ['Hard/Brutal drop pods with creep tumors are omitted', 'Hatcheries are decor; rebuilding is not scripted'],
  script(rt) {
    const T = 20 * 60;
    rt.state.hatch = place(rt, 'enemy', [[24, 24], [28, 20], [64, 24], [60, 28], [104, 24], [24, 64], [24, 104], [28, 100]].map(at => ({ type: 'hatchery' as const, at: at as Pt })));
    rt.after(T, () => rt.complete('hold'));
    // countdown HUD message each minute
    rt.every(60, () => { const left = Math.max(0, Math.round((T - rt.elapsed) / 60)); if (left > 0) rt.say(`Evacuation in ${left} minute${left === 1 ? '' : 's'}.`, 4); });
    waves(rt, { start: 90, every: 45, from: [[24, 24], [64, 24], [24, 64], [104, 24]], to: [104, 104], tiers: [
      { atMin: 0, units: [{ type: 'zergling', n: 10 }, { type: 'roach', n: 2 }] },
      { atMin: 5, units: [{ type: 'roach', n: 6 }, { type: 'hydralisk', n: 4 }, { type: 'baneling', n: 4 }] },
      { atMin: 11, units: [{ type: 'roach', n: 10 }, { type: 'hydralisk', n: 8 }, { type: 'baneling', n: 8 }, { type: 'mutalisk', n: 3 }] }] });
    rt.after(T - 60, () => rt.every(12, () => wave(rt, [{ type: 'zergling', n: 14 }, { type: 'roach', n: 6 }, { type: 'baneling', n: 6 }], [24, 24], [104, 104]), 1));
    const sites: { at: Pt; t: number }[] = [{ at: [84, 92], t: 3.5 * 60 }, { at: [64, 64], t: 8 * 60 }, { at: [30, 70], t: 12.5 * 60 }];
    rt.after(sites[0]!.t, () => rt.reveal('rebels'));
    for (const s of sites) rt.after(s.t, () => { rt.say('Rebels sighted. Rescue them.'); rescue(rt, 'rebels', s.at, [{ type: 'marine', n: 4 }, { type: 'medic', n: 1 }]); wave(rt, [{ type: 'zergling', n: 4 }, { type: 'hydralisk', n: 2 }], [s.at[0] + 2, s.at[1] + 2], [s.at[0] + 2, s.at[1] + 2], 'enemy', true); });
    rt.onTick(() => { if (!rt.world.buildings.some(b => b.playerId === 'player')) rt.fail('hold'); });
  }
});
