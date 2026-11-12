import { mission } from '../common';
import { place, destroyAll, rescue, wave } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 2. The Outlaws - "Seize the Xel'Naga Artifact". Build up and destroy the Dominion dig base. */
export const theOutlaws = mission({
  key: 'the_outlaws', order: 2, chapter: 'Mar Sara', title: 'The Outlaws', subtitle: 'Seize the Xel\'Naga Artifact',
  enemyFaction: 'terran', mapId: 'wol_the_outlaws', startingMinerals: 400,
  startingUnits: [{ type: 'marine', count: 6 }],
  briefing: 'Raynor and Tychus raid a Dominion digsite. Rescue the outlaw base to the west, build up Marines and Medics, then raze the dig.',
  objectives: [
    { id: 'base', text: 'Destroy the Dominion base', kind: 'primary' },
    { id: 'outlaws', text: 'Rescue the rebels', kind: 'bonus', target: 1 }
  ],
  gaps: ['Medic needs a Tech Lab in the real mission; resource pallets are not scattered'],
  script(rt) {
    const list = place(rt, 'enemy', [
      { type: 'command_center', at: [104, 28] }, { type: 'barracks', at: [96, 38] }, { type: 'factory', at: [110, 40] }, { type: 'bunker', at: [92, 46] },
      { type: 'supply_depot', at: [112, 22] }, { type: 'missile_turret', at: [100, 44] }]);
    wave(rt, [{ type: 'marine', n: 8 }, { type: 'hellion', n: 2 }], [100, 34], [100, 34], 'enemy', true);
    destroyAll(rt, 'base', list);
    // the outlaws are attacked by waves until you reach their beacon
    rt.every(70, () => { if (rt.status('outlaws') === 'active') wave(rt, [{ type: 'marine', n: 5 }], [40, 60], [14, 60]); }, 40);
    rescue(rt, 'outlaws', [14, 60] as Pt, [{ type: 'marine', n: 6 }, { type: 'medic', n: 2 }], 5);
  }
});
