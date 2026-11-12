import type { MissionDef } from '../../../types';
import { place, mustSurvive, waves, wave } from '../../../helpers';
import { spawnNova } from '../../../helpers';

/** Mission 8. Lane defence vs the Tal'darim Death Fleet. Run length (~13 min, one player's 12:51 clear) and lane schedule are UNVERIFIED. */
export const darkSkies: MissionDef = {
  key: 'dark_skies', order: 8, chapter: 'Mission Pack 3', title: 'Dark Skies', subtitle: 'Vardona · Hold out against the Tal\'darim',
  playerFaction: 'terran', enemyFaction: 'protoss', mapId: 'nco_dark_skies', difficulty: 'normal',
  startingMinerals: 800, startingGas: 300, noEnemyBase: true, aiOff: true, customWin: true,
  startingUnits: [{ type: 'siege_tank', count: 4 }, { type: 'liberator', count: 3 }, { type: 'marine', count: 8 }],
  briefing: 'The Death Fleet hits Vardona City down seven lanes. Hold the defence lines with allied Defenders of Man, call Gorgon strafing runs, and break the mothership.',
  objectives: [
    { id: 'fleet', text: 'Defeat the Death Fleet', kind: 'primary' },
    { id: 'facility', text: 'Protect the science facility', kind: 'bonus', passive: true }
  ],
  spec: 'docs/campaign/nova-covert-ops.md',
  gaps: ['Gorgon strafing run is an instant area strike on the command card, not a flying battlecruiser', 'Lane open times, wave sizes and mission length are estimates'],
  script(rt) {
    spawnNova(rt, [30, 64]); rt.focus(30, 64);
    // allied Defenders of Man line + the science facility in the centre-front lane
    const lines: [number, number][] = [[58, 38], [58, 52], [58, 64], [58, 76], [58, 90]];
    place(rt, 'player', lines.flatMap(l => [{ type: 'bunker' as const, at: [l[0], l[1] - 1.5] as [number, number] }, { type: 'bunker' as const, at: [l[0], l[1] + 1.5] as [number, number] }]));
    const fac = place(rt, 'player', [{ type: 'engineering_bay', at: [58, 64] }])[0]!;
    mustSurvive(rt, 'facility', () => fac);
    const spawns: [number, number][] = [[120, 38], [120, 64], [120, 90]];
    const extra: [number, number][] = [[120, 52], [120, 76], [120, 26], [120, 102]];
    rt.after(5 * 60, () => { spawns.push(extra[0]!, extra[1]!); rt.say('Two more attack lanes have opened.'); });
    rt.after(9 * 60, () => { spawns.push(extra[2]!, extra[3]!); rt.say('The last lanes are open.'); });
    waves(rt, { start: 30, every: 35, from: spawns, to: [34, 64], tiers: [
      { atMin: 0, units: [{ type: 'zealot', n: 8 }, { type: 'stalker', n: 4 }] },
      { atMin: 4, units: [{ type: 'stalker', n: 8 }, { type: 'archon', n: 1 }, { type: 'void_ray', n: 2 }] },
      { atMin: 8, units: [{ type: 'archon', n: 3 }, { type: 'void_ray', n: 4 }, { type: 'stalker', n: 10 }] }] });
    rt.after(10 * 60, () => { rt.say('The Tal\'darim mothership has arrived.'); const m = rt.spawn('void_ray', 'enemy', 124, 64)[0]!; m.maxHealth = m.health = 2500; rt.state.m = m; m.setCommand({ type: 'attack_move', targetPos: { x: 34, y: 64 } }); });
    rt.onTick(() => { const m = rt.state.m; if (m && m.isDead && rt.elapsed > 10 * 60) rt.complete('fleet'); });
    void wave;
  }
};
