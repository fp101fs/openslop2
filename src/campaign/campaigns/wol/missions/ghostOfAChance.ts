import { mission } from '../common';
import { boss, place, wave, mustSurvive } from '../../../helpers';
import type { Pt } from '../../../helpers';
import { after } from '../common';

/** 14b. Ghost of a Chance (Nova) - three stealth sections (units do not carry over); 10 Spectres to kill. */
export const ghostOfAChance = mission({
  key: 'ghost_of_a_chance', order: 14, chapter: 'Covert', title: 'Ghost of a Chance', subtitle: 'Destroy the Spectre training camp',
  enemyFaction: 'terran', mapId: 'wol_ghost_of_a_chance', noPlayerBase: true, startingMinerals: 0,
  unlock: d => d.has('welcome_to_the_jungle') && after(d, 'welcome_to_the_jungle') >= 2,
  briefing: 'Nova leads three infiltration sections to wreck Tosh\'s Spectre camp. Dominate machines and snipe Spectres.',
  objectives: [
    { id: 'jorium', text: 'Destroy the Jorium Stockpile', kind: 'primary' },
    { id: 'tank', text: 'Destroy the Terrazine Tank', kind: 'primary', hidden: true },
    { id: 'psi', text: 'Destroy the Psi-Indoctrinator', kind: 'primary', hidden: true },
    { id: 'nova', text: 'Nova must survive', kind: 'primary', passive: true },
    { id: 'spectres', text: 'Kill Spectres', kind: 'bonus', target: 10 }
  ],
  gaps: ['Spectres are enemy Ghosts; nuke silos and section transitions are simplified to teleports'],
  script(rt) {
    let nova = boss(rt, 'nova', 'player', [16, 100], 450); rt.focus(16, 100); mustSurvive(rt, 'nova', () => nova);
    rt.spawn('marine', 'player', 20, 98, 8); rt.spawn('medic', 'player', 22, 98, 2);
    const spectres: any[] = [];
    const sp = (at: Pt) => { const s = boss(rt, 'ghost', 'enemy', at, 120); spectres.push(s); return s; };
    // section 1: jorium stockpile guarded by Battlecruisers + turrets
    place(rt, 'enemy', [{ type: 'missile_turret', at: [50, 80] }, { type: 'missile_turret', at: [76, 66] }]);
    wave(rt, [{ type: 'marine', n: 6 }, { type: 'siege_tank', n: 1 }], [44, 84], [44, 84], 'enemy', true); sp([60, 74]); sp([62, 74]);
    const jorium = place(rt, 'enemy', [{ type: 'refinery', at: [104, 38] }])[0]!; wave(rt, [{ type: 'battlecruiser', n: 2 }], [100, 44], [100, 44], 'enemy', true);
    const moveTo = (at: Pt) => { nova.pos.x = at[0]; nova.pos.y = at[1]; rt.focus(at[0], at[1]); };
    const clear = () => rt.world.removeWhere(e => e.playerId === 'player' && e !== nova);
    rt.onTick(() => { if (jorium.isDead && !rt.state.s2) { rt.state.s2 = true; rt.complete('jorium'); rt.reveal('tank'); rt.say('Section 2: Nova alone.'); clear(); moveTo([20, 40]);
      rt.after(25, () => { rt.spawn('reaper', 'player', 22, 44, 8); rt.spawn('siege_tank', 'player', 24, 40, 2); rt.spawn('raven', 'player', 20, 36, 1); });
      wave(rt, [{ type: 'marine', n: 8 }], [40, 40], [40, 40], 'enemy', true); sp([54, 36]); sp([70, 44]); sp([36, 20]); place(rt, 'enemy', [{ type: 'missile_turret', at: [60, 44] }]);
      const tankObj = place(rt, 'enemy', [{ type: 'refinery', at: [100, 28] }])[0]!; rt.state.tankObj = tankObj; wave(rt, [{ type: 'marine', n: 8 }, { type: 'marauder', n: 3 }], [98, 32], [98, 32], 'enemy', true); } });
    rt.onTick(() => { const t = rt.state.tankObj; if (t && t.isDead && !rt.state.s3) { rt.state.s3 = true; rt.complete('tank'); rt.reveal('psi'); rt.say('Section 3: the Psi-Indoctrinator.'); clear(); moveTo([110, 40]);
      rt.after(5, () => { rt.spawn('wraith', 'player', 108, 44, 4); rt.spawn('banshee', 'player', 112, 44, 4); });
      for (let i = 0; i < 5; i++) sp([60 + i * 6, 70 + (i % 2) * 10]); wave(rt, [{ type: 'siege_tank', n: 2 }, { type: 'marine', n: 8 }, { type: 'thor', n: 1 }], [30, 90], [30, 90], 'enemy', true);
      rt.state.psiObj = place(rt, 'enemy', [{ type: 'nexus', at: [20, 110] }])[0]; } });
    rt.onTick(() => { rt.progress('spectres', spectres.filter(s => s.isDead).length); const p = rt.state.psiObj; if (p && p.isDead) rt.complete('psi'); });
    void after;
  }
});
