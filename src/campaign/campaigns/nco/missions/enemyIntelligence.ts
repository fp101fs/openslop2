import type { MissionDef } from '../../../types';
import { wave, place, reach, mustSurvive } from '../../../helpers';
import { spawnNova } from '../../../helpers';

/** Mission 3. Two phases: base-build + garrison 5 buildings, then Nova infiltrates the Defenders of Man base. */
export const enemyIntelligence: MissionDef = {
  key: 'enemy_intelligence', order: 3, chapter: 'Mission Pack 1', title: 'Enemy Intelligence', subtitle: 'Tarsonis · Infiltrate the Defenders of Man base',
  playerFaction: 'terran', enemyFaction: 'zerg', mapId: 'nco_enemy_intelligence', difficulty: 'normal',
  startingMinerals: 500, startingGas: 100, noEnemyBase: true, aiOff: true, customWin: true,
  startingUnits: [{ type: 'marine', count: 6 }, { type: 'marauder', count: 3 }, { type: 'reaper', count: 2 }],
  briefing: 'Phase one: secure the ruined buildings around the landing zone by garrisoning units inside them. Phase two: Nova alone infiltrates the Defenders of Man base and reaches the command room.',
  objectives: [
    { id: 'garrison', text: 'Garrison units inside buildings', kind: 'primary', target: 5 },
    { id: 'hub', text: 'Reach Communication Hub', kind: 'primary', hidden: true },
    { id: 'room', text: 'Reach Command Room', kind: 'primary', hidden: true },
    { id: 'survive', text: 'Nova must survive (second phase only)', kind: 'primary', passive: true, hidden: true },
    { id: 'rescue', text: 'Rescue survivors', kind: 'bonus', target: 1 }
  ],
  spec: 'docs/campaign/nova-covert-ops.md',
  gaps: ['Infested pustules in front of garrisons are not modelled; garrisons are empty bunkers', 'Monomolecular-blade dash and flashbang stealth section simplified', 'Phase-1 supply cap (Less Is More) not enforced'],
  script(rt) {
    rt.focus(24, 24);
    const spots: [number, number][] = [[40, 36], [66, 40], [30, 60], [60, 66], [84, 74]];
    const garrisons = place(rt, 'player', spots.map(at => ({ type: 'bunker' as const, at })));
    rt.onTick(() => {
      if (rt.status('garrison') !== 'active') return;
      rt.progress('garrison', garrisons.filter(b => !b.isDead && (b as any).cargo?.length > 0).length);
    });
    // zerg pressure: north first, then east, then west
    rt.every(50, () => {
      const m = rt.elapsed / 60;
      const from: [number, number] = m < 3 ? [64, 120] : m < 7 ? [120, 70] : [8, 70];
      wave(rt, [{ type: 'zergling', n: 6 }, { type: 'roach', n: 2 + Math.floor(m / 3) }, ...(m > 6 ? [{ type: 'ultralisk' as const, n: 1 }] : [])], from, [24, 24]);
    }, 60);
    // phase 2: Nova descends into the base
    rt.onTick(() => {
      if (rt.state.p2 || rt.status('garrison') !== 'done') return;
      rt.state.p2 = true; rt.reveal('hub'); rt.reveal('room'); rt.reveal('survive');
      rt.world.removeWhere(e => e.playerId === 'player' && e.type !== 'bunker');
      const nova = spawnNova(rt, [100, 88], { jumpsuit: false }); rt.focus(100, 88); rt.state.nova = nova;
      rt.say('Nova: the Defenders know I am here. Move.');
      mustSurvive(rt, 'survive', () => nova);
      for (const at of [[100, 96], [92, 100], [108, 100], [100, 110]] as [number, number][]) wave(rt, [{ type: 'ghost', n: 1 }, { type: 'marine', n: 2 }], at, at, 'enemy', true);
      rt.after(20, () => wave(rt, [{ type: 'zergling', n: 12 }], [64, 126], [100, 104]));
    });
    reach(rt, 'hub', [100, 104], 4, () => rt.status('hub') === 'active');
    reach(rt, 'room', [106, 116], 4, () => rt.status('hub') === 'done');
    reach(rt, 'rescue', [26, 78], 5);
  }
};
