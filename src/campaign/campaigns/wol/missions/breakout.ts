import { mission } from '../common';
import { boss, place, destroyAll, wave, mustSurvive } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 14a. Breakout (Tosh) - one cloaked hero, Raynor's waves along a fixed path. Tosh is a Nova-type hero stand-in. */
export const breakout = mission({
  key: 'breakout', order: 14, chapter: 'Covert', title: 'Breakout', subtitle: 'Destroy the main prison base',
  enemyFaction: 'terran', mapId: 'wol_breakout', noPlayerBase: true, startingMinerals: 0,
  unlock: d => d.has('welcome_to_the_jungle') && [...d].length - [...d].indexOf('welcome_to_the_jungle') - 1 >= 2,
  briefing: 'Tosh breaks his fellow Spectres out of a Dominion prison world while Raynor\'s waves push along the road.',
  objectives: [
    { id: 'prison', text: 'Destroy the main prison base', kind: 'primary' },
    { id: 'tosh', text: 'Tosh must survive', kind: 'primary', passive: true },
    { id: 'cellA', text: 'Kill guards at Cell Block A', kind: 'bonus' },
    { id: 'cellB', text: 'Kill guards at Cell Block B', kind: 'bonus' }
  ],
  gaps: ['Tosh uses Nova\'s kit (Snipe/Pulse) instead of Mind Blast/Psi Shield/Consumption', 'Raynor waves are timed pushes without outposts'],
  script(rt) {
    const tosh = boss(rt, 'nova', 'player', [16, 64], 450); rt.focus(16, 64); mustSurvive(rt, 'tosh', () => tosh);
    rt.every(75, () => wave(rt, [{ type: 'marine', n: 8 }, { type: 'medic', n: 2 }, { type: 'marauder', n: 3 }], [14, 64], [100, 64], 'player'), 60);
    const turrets = place(rt, 'enemy', ([[34, 60], [64, 58], [90, 64], [100, 56]] as Pt[]).map(at => ({ type: 'missile_turret' as const, at })));
    place(rt, 'enemy', [{ type: 'bunker', at: [40, 66] }, { type: 'bunker', at: [92, 70] }, { type: 'factory', at: [48, 60] }]);
    wave(rt, [{ type: 'siege_tank', n: 1 }, { type: 'marine', n: 3 }], [36, 62], [36, 62], 'enemy', true);
    wave(rt, [{ type: 'siege_tank', n: 2 }, { type: 'thor', n: 1 }, { type: 'marine', n: 6 }], [66, 66], [66, 66], 'enemy', true);
    const A = wave(rt, [{ type: 'marine', n: 4 }, { type: 'marauder', n: 2 }], [30, 44], [30, 44], 'enemy', true);
    const B = wave(rt, [{ type: 'marine', n: 6 }, { type: 'thor', n: 1 }, { type: 'siege_tank', n: 2 }], [64, 90], [64, 90], 'enemy', true);
    destroyAll(rt, 'cellA', A); destroyAll(rt, 'cellB', B);
    const base = place(rt, 'enemy', [{ type: 'command_center', at: [112, 64] }, { type: 'barracks', at: [108, 56] }, { type: 'factory', at: [108, 72] }, { type: 'starport', at: [112, 80] }, { type: 'bunker', at: [104, 64] }]);
    wave(rt, [{ type: 'thor', n: 2 }, { type: 'siege_tank', n: 2 }, { type: 'marine', n: 10 }, { type: 'battlecruiser', n: 1 }], [106, 64], [106, 64], 'enemy', true);
    destroyAll(rt, 'prison', base); void turrets;
  }
});
