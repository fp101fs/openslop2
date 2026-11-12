import { mission, setSecret } from '../common';
import { boss, place, wave, mustSurvive } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 18. Media Blitz - Odin surprise attack, then upload to three broadcast towers (clockwise) while the other two Dominion arms attack. */
export const mediaBlitz = mission({
  key: 'media_blitz', order: 18, chapter: 'Rebellion', title: 'Media Blitz', subtitle: 'Broadcast the truth',
  enemyFaction: 'terran', mapId: 'wol_media_blitz', noPlayerBase: false, startingMinerals: 500, startingGas: 200,
  unlock: d => d.has('engine_of_destruction'), startingUnits: [{ type: 'marine', count: 4 }, { type: 'thor', count: 1 }],
  briefing: 'Surprise attack as the Odin, then rebuild and upload Raynor\'s message to three Dominion broadcast towers.',
  objectives: [
    { id: 'blitz', text: 'Destroy the Dominion during the Surprise Attack', kind: 'primary' },
    { id: 't1', text: 'Access Broadcast Tower 1', kind: 'primary' },
    { id: 't2', text: 'Access Broadcast Tower 2', kind: 'primary' },
    { id: 't3', text: 'Access Broadcast Tower 3', kind: 'primary' }
  ],
  gaps: ['Surprise Attack length (150 s) and upload time (90 s) are estimates', 'The Odin is a Thor stand-in'],
  script(rt) {
    const odin = boss(rt, 'thor', 'player', [64, 62], 5000); rt.focus(64, 62); void mustSurvive;
    const left = place(rt, 'enemy', [{ type: 'command_center', at: [20, 64] }, { type: 'starport', at: [14, 58] }, { type: 'starport', at: [14, 70] }, { type: 'starport', at: [26, 58] }, { type: 'starport', at: [26, 70] }, { type: 'barracks', at: [20, 52] }, { type: 'factory', at: [20, 76] }]);
    const top = place(rt, 'enemy', [{ type: 'command_center', at: [64, 20] }, { type: 'factory', at: [58, 14] }, { type: 'factory', at: [70, 14] }, { type: 'bunker', at: [64, 28] }]);
    const right = place(rt, 'enemy', [{ type: 'command_center', at: [108, 64] }, { type: 'barracks', at: [104, 56] }, { type: 'barracks', at: [104, 72] }, { type: 'bunker', at: [100, 64] }]);
    wave(rt, [{ type: 'marine', n: 12 }, { type: 'hellion', n: 4 }], [60, 58], [60, 58], 'enemy', true);
    place(rt, 'enemy', [{ type: 'engineering_bay', at: [108, 112] }]);
    const sci = rt.world.buildings.filter(b => b.playerId === 'enemy' && b.type === 'engineering_bay' && b.pos.y > 100);
    rt.onTick(() => { if (sci.length && sci.every(b => b.isDead)) { setSecret(); sci.length = 0; rt.say('Documents recovered: a secret research platform.'); } });
    rt.after(150, () => { rt.complete('blitz'); rt.say('The surprise attack is over. Build your forces.'); odin.pos.x = 62; odin.pos.y = 70; });
    const towers: { id: string; at: Pt; from: Pt }[] = [{ id: 't1', at: [20, 64], from: [64, 20] }, { id: 't2', at: [64, 20], from: [108, 64] }, { id: 't3', at: [108, 64], from: [20, 64] }];
    const prog: Record<string, number> = { t1: 0, t2: 0, t3: 0 };
    rt.onTick(dt => { if (rt.status('blitz') !== 'done') return; const t = towers.find(x => rt.status(x.id) === 'active'); if (!t) return;
      if (rt.near(t.at[0], t.at[1], 6, 'player').length) { prog[t.id]! += dt; if (prog[t.id]! >= 90) { rt.complete(t.id); rt.say('Upload complete.'); } } });
    rt.every(50, () => { if (rt.status('blitz') !== 'done') return; const t = towers.find(x => rt.status(x.id) === 'active'); if (t) wave(rt, [{ type: 'marine', n: 8 }, { type: 'siege_tank', n: 2 }, { type: 'vulture' as const, n: 4 }], t.from, t.at); }, 200);
    rt.every(110, () => { if (rt.status('blitz') === 'done') wave(rt, [{ type: 'marine', n: 8 }, { type: 'hellion', n: 3 }], [108, 64], [64, 62]); }, 240);
    void left; void top; void right;
  }
});
