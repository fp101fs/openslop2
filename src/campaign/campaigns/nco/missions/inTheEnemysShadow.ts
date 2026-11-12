import type { MissionDef } from '../../../types';
import { wave, place, reach, mustSurvive } from '../../../helpers';
import { spawnNova } from '../../../helpers';

/** Mission 7. Nova-only infiltration. Stone has 450 HP and collapses at 50 (Fandom). */
export const inTheEnemysShadow: MissionDef = {
  key: 'in_the_enemys_shadow', order: 7, chapter: 'Mission Pack 3', title: 'In the Enemy\'s Shadow', subtitle: 'Vardona · Apprehend General Davis',
  playerFaction: 'terran', enemyFaction: 'terran', mapId: 'nco_in_the_enemys_shadow', difficulty: 'normal',
  startingMinerals: 0, startingGas: 0, noEnemyBase: true, noPlayerBase: true, aiOff: true, customWin: true,
  briefing: 'Infiltrate Davis\'s compound through the sewers, unlock both security doors, defeat Stone and bring Davis in alive.',
  objectives: [
    { id: 'infiltrate', text: 'Infiltrate the facility', kind: 'primary' },
    { id: 'locks', text: 'Deactivate door locks', kind: 'primary', target: 2, hidden: true },
    { id: 'stone', text: 'Defeat Stone', kind: 'primary', hidden: true },
    { id: 'davis', text: 'Arrest General Davis', kind: 'primary', hidden: true },
    { id: 'survive', text: 'Nova must survive', kind: 'primary', passive: true },
    { id: 'signal', text: 'Investigate energy signal', kind: 'bonus' },
    { id: 'gear', text: 'Obtain tactical gear', kind: 'bonus' },
    { id: 'weapon', text: 'Obtain advanced weaponry', kind: 'bonus' }
  ],
  spec: 'docs/campaign/nova-covert-ops.md',
  gaps: ['Laser traps, sensor/sonar drones and the Domination mechanic are simplified to generic enemies and the Dominate ability', 'Secret Blazefire Gunblade objective omitted'],
  script(rt) {
    const nova = spawnNova(rt, [14, 64]); rt.focus(14, 64);
    mustSurvive(rt, 'survive', () => nova);
    // sewer: light patrols, then the compound
    for (const at of [[36, 64], [48, 64], [64, 52], [64, 78]] as [number, number][]) wave(rt, [{ type: 'marine', n: 2 }], at, at, 'enemy', true);
    place(rt, 'enemy', [{ type: 'missile_turret', at: [58, 64] }, { type: 'missile_turret', at: [66, 40] }]);
    rt.spawn('thor', 'player', 30, 60);                                       // the sewer Thor to dominate/escort
    reach(rt, 'infiltrate', [92, 64], 5);
    rt.onTick(() => { if (rt.status('infiltrate') === 'done') rt.reveal('locks'); });
    for (const at of [[100, 50], [96, 78], [104, 58]] as [number, number][]) wave(rt, [{ type: 'ghost', n: 1 }, { type: 'marauder', n: 1 }], at, at, 'enemy', true);
    const locks: [number, number][] = [[64, 28], [64, 100]];
    locks.forEach((l, i) => rt.onTick(() => { if (rt.status('locks') !== 'active' || (rt.state['l' + i])) return; if (rt.near(l[0], l[1], 3, 'player').length) { rt.state['l' + i] = true; rt.add('locks'); rt.say('Door lock disabled.'); } }));
    rt.onTick(() => { if (rt.status('locks') === 'done' && !rt.state.stone) {
      rt.state.stone = true; rt.reveal('stone'); rt.reveal('davis'); rt.say('Stone: you betrayed us, Nova.');
      const s = rt.spawn('ghost', 'enemy', 106, 66)[0]!; s.maxHealth = s.health = 450; rt.state.s = s; s.energy = 200;
    } });
    rt.onTick(() => { const s = rt.state.s; if (s && rt.status('stone') === 'active' && (s.isDead || s.health < 50)) { rt.world.removeWhere(e => e === s); rt.complete('stone'); rt.say('Stone collapses. Davis is alone.'); rt.spawn('ghost', 'enemy', 112, 64)[0]!.maxHealth = 300; rt.state.d = true; } });
    reach(rt, 'davis', [112, 64], 3, () => rt.status('stone') === 'done');
    reach(rt, 'signal', [14, 70], 4); reach(rt, 'gear', [64, 100], 3); reach(rt, 'weapon', [64, 36], 3);
  }
};
