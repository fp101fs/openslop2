import { mission } from '../common';
import { boss, waves } from '../../../helpers';
import { diffScale } from '../../../helpers';

/** 23. In Utter Darkness - kill 2500 (Hard 2000, Normal 1500) Zerg units; defend until the last Protoss falls. Heroes arrive at 5 points. */
export const inUtterDarkness = mission({
  key: 'in_utter_darkness', order: 23, chapter: 'Prophecy', title: 'In Utter Darkness', subtitle: 'Defend until the last Protoss falls',
  playerFaction: 'protoss', enemyFaction: 'zerg', mapId: 'wol_in_utter_darkness', noPlayerBase: false, startingMinerals: 1200, startingGas: 400,
  unlock: d => d.has('echoes_of_the_future'),
  briefing: 'The Zerg swarm the last Protoss stronghold. Kill as many as you can; the swarm will eventually win.',
  objectives: [
    { id: 'kills', text: 'Kill enemy forces', kind: 'primary', target: 1500 },
    { id: 'defend', text: 'Defend until the last Protoss falls', kind: 'primary', hidden: true },
    { id: 'archive', text: 'Protect the Protoss Archive (25:00)', kind: 'bonus' }
  ],
  gaps: ['Hero air fleets are summoned as stand-ins; Archive submerging omitted; the 2500/2000/1500 goal follows the difficulty'],
  script(rt) {
    const goal = diffScale(rt) >= 1.7 ? 2500 : diffScale(rt) >= 1.35 ? 2000 : 1500;
    (rt.objectives.get('kills')!.def as any).target = goal;
    const seen = new Set<any>(); let kills = 0;
    rt.onTick(() => { for (const u of rt.world.units) if (u.isDead && u.playerId === 'enemy' && !seen.has(u)) { seen.add(u); kills++; rt.progress('kills', Math.min(goal, kills)); } });
    rt.onTick(() => { if (rt.status('kills') === 'done') rt.reveal('defend'); });
    waves(rt, { start: 30, every: 22, from: [[64, 12], [12, 64], [116, 64], [64, 116]], to: [64, 64], tiers: [
      { atMin: 0, units: [{ type: 'zergling', n: 12 }, { type: 'roach', n: 4 }] },
      { atMin: 6, units: [{ type: 'roach', n: 10 }, { type: 'hydralisk', n: 8 }, { type: 'mutalisk', n: 4 }] },
      { atMin: 14, units: [{ type: 'ultralisk', n: 3 }, { type: 'broodlord', n: 3 }, { type: 'hydralisk', n: 14 }, { type: 'mutalisk', n: 8 }] },
      { atMin: 26, units: [{ type: 'ultralisk', n: 6 }, { type: 'broodlord', n: 6 }, { type: 'mutalisk', n: 14 }] }] });
    const heroes: [number, string, () => void][] = [[5, 'Urun and his Phoenix wing', () => rt.spawn('void_ray', 'player', 64, 70, 5)], [10, 'Mohandar and his Void Ray fleet', () => rt.spawn('void_ray', 'player', 60, 70, 7)], [16, 'Selendis and her Carrier fleet', () => rt.spawn('void_ray', 'player', 68, 70, 8)], [22, 'Artanis arrives in the Mothership', () => boss(rt, 'archon', 'player', [64, 72], 4000)]];
    for (const [min, say, fn] of heroes) rt.after(min * 60, () => { rt.say(say); fn(); });
    rt.after(25 * 60, () => rt.complete('archive'));
    // the swarm ends it: when every Protoss structure and unit is gone, or after 40 minutes, the mission ends with victory if the kill goal was reached
    rt.onTick(() => { if (rt.status('kills') === 'done' && rt.elapsed > 40 * 60) rt.complete('defend'); });
    rt.onTick(() => { if (rt.status('kills') === 'done' && !rt.world.buildings.some(b => b.playerId === 'player') && !rt.world.units.some(u => u.playerId === 'player' && !u.isDead)) rt.complete('defend'); });
  }
});
