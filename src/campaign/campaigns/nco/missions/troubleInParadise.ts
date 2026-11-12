import type { MissionDef } from '../../../types';
import { wave, place, mustSurvive, countKills, waves } from '../../../helpers';
import { spawnNova } from '../../../helpers';

/** Mission 4. Hatcheries on a timer, then 4 shield projectors, then the Tal'darim mothership. Timer lengths are UNVERIFIED. */
export const troubleInParadise: MissionDef = {
  key: 'trouble_in_paradise', order: 4, chapter: 'Mission Pack 2', title: 'Trouble in Paradise', subtitle: 'Tyrador IX · Defeat the Zerg',
  playerFaction: 'terran', enemyFaction: 'zerg', mapId: 'nco_trouble_in_paradise', difficulty: 'normal',
  startingMinerals: 600, startingGas: 200, noEnemyBase: true, aiOff: true, customWin: true,
  startingUnits: [{ type: 'banshee', count: 4 }, { type: 'marine', count: 4 }],
  briefing: 'Zerg swarm the resort world. Raze the hatcheries before reinforcements arrive, then break the shield projectors protecting the Tal\'darim mothership and destroy it before it levels the civilian shelter.',
  objectives: [
    { id: 'hatch', text: 'Destroy hatcheries before zerg arrive', kind: 'primary', target: 3 },
    { id: 'survive', text: 'Nova must survive (first phase only)', kind: 'primary', passive: true },
    { id: 'proj', text: 'Destroy shield projectors', kind: 'primary', target: 4, hidden: true },
    { id: 'shelter', text: 'Civilian shelter must survive', kind: 'primary', passive: true, hidden: true },
    { id: 'mother', text: 'Destroy Tal\'darim mothership', kind: 'primary', hidden: true },
    { id: 'rest', text: 'Destroy remaining zerg hatcheries', kind: 'bonus', target: 6 },
    { id: 'beacon', text: 'Destroy Tal\'darim fleet beacon', kind: 'bonus', hidden: true }
  ],
  spec: 'docs/campaign/nova-covert-ops.md',
  gaps: ['Reinforcement timer (8 min) and 3-of-6 primary count are estimates', 'Mothership is a stand-in unit; interceptor/line attacks missing'],
  script(rt) {
    const nova = spawnNova(rt, [26, 96]); rt.focus(26, 96);
    const phase1Nova = mustSurvive; phase1Nova(rt, 'survive', () => (rt.state.p2 ? undefined : nova));
    const hatches = place(rt, 'enemy', [[56, 50], [70, 36], [88, 52], [50, 80], [76, 84], [96, 70]].map(at => ({ type: 'hatchery' as const, at: at as [number, number] })));
    place(rt, 'enemy', [{ type: 'spine_crawler', at: [54, 54] }, { type: 'spine_crawler', at: [72, 40] }, { type: 'spine_crawler', at: [90, 56] }]);
    rt.state.killed = 0;
    rt.onTick(() => { rt.state.killed = hatches.filter(h => h.isDead).length; if (!rt.state.p2) rt.progress('hatch', Math.min(3, rt.state.killed)); rt.progress('rest', rt.state.killed); });
    // reinforcements arrive after 8 min or when phase 1 is done
    const startP2 = () => {
      if (rt.state.p2) return; rt.state.p2 = true; rt.reveal('proj'); rt.reveal('shelter'); rt.reveal('mother');
      rt.say('Warp signatures detected. Tal\'darim Death Fleet incoming.');
      const shelter = place(rt, 'player', [{ type: 'command_center', at: [34, 100] }])[0]!;
      mustSurvive(rt, 'shelter', () => shelter);
      const projectors = place(rt, 'enemy', [[90, 24], [110, 44], [100, 96], [64, 64]].map(at => ({ type: 'pylon' as const, at: at as [number, number] })));
      place(rt, 'enemy', [90, 24, 110, 44, 100, 96, 64, 64].flatMap((_, i, a) => i % 2 ? [] : [{ type: 'photon_cannon' as const, at: [a[i]! + 3, a[i + 1]! + 3] as [number, number] }]));
      countKills(rt, 'proj', projectors);
      const mother = rt.spawn('void_ray', 'enemy', 104, 24)[0]!; mother.maxHealth = mother.health = 3000;
      rt.onTick(() => {
        if (mother.isDead) { rt.complete('mother'); return; }
        if (rt.status('proj') !== 'done') mother.health = mother.maxHealth;      // shielded until all projectors fall
        else if (!rt.state.charge) { rt.state.charge = true; mother.setCommand({ type: 'attack_move', targetPos: { x: 34, y: 100 } }); rt.say('The mothership is powering up!'); }
      });
      const beacon = place(rt, 'enemy', [{ type: 'nexus', at: [116, 108] }])[0]!;
      rt.reveal('beacon'); rt.onTick(() => { if (beacon.isDead) rt.complete('beacon'); });
      waves(rt, { start: 30, every: 45, from: [[110, 30], [100, 100]], to: [34, 100], tiers: [{ atMin: 0, units: [{ type: 'zealot', n: 6 }, { type: 'stalker', n: 3 }] }, { atMin: 4, units: [{ type: 'stalker', n: 6 }, { type: 'void_ray', n: 2 }] }] });
    };
    rt.after(8 * 60, () => { wave(rt, [{ type: 'zergling', n: 20 }, { type: 'roach', n: 8 }], [64, 126], [26, 96]); startP2(); });
    rt.onTick(() => { if (rt.status('hatch') === 'done') startP2(); });
  }
};
