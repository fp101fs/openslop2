import { mission } from '../common';
import { boss, place, reach, mustSurvive, wave } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 17. Engine of Destruction - escort Tychus to the Odin, then guard the base while the Odin razes 5 Dominion bases. */
export const engineOfDestruction = mission({
  key: 'engine_of_destruction', order: 17, chapter: 'Rebellion', title: 'Engine of Destruction', subtitle: 'Steal the Odin',
  enemyFaction: 'terran', mapId: 'wol_engine_of_destruction', noPlayerBase: false, startingMinerals: 400,
  unlock: d => d.has('cutthroat'), startingUnits: [{ type: 'marine', count: 6 }, { type: 'medic', count: 2 }],
  briefing: 'Escort Tychus to the Odin, then defend your base while the walker razes five Dominion bases. Keep the Odin alive.',
  objectives: [
    { id: 'escort', text: 'Escort Tychus to the Odin', kind: 'primary' },
    { id: 'tychus', text: 'Tychus must survive', kind: 'primary', passive: true },
    { id: 'bases', text: 'Destroy all Dominion bases', kind: 'primary', target: 5, hidden: true },
    { id: 'odin', text: 'Odin must survive', kind: 'primary', passive: true, hidden: true },
    { id: 'loki', text: 'Find and destroy the Loki', kind: 'bonus' },
    { id: 'tissue', text: 'Find Devourer tissue samples', kind: 'bonus', target: 3 }
  ],
  gaps: ['The Odin is a Thor with 6000 hp that auto-walks base to base; the ending nuke is a message'],
  script(rt) {
    const tychus = boss(rt, 'marauder', 'player', [20, 100], 500); mustSurvive(rt, 'tychus', () => tychus); rt.focus(20, 100);
    place(rt, 'enemy', [{ type: 'bunker', at: [28, 96] }]);
    reach(rt, 'escort', [30, 100], 5);
    const odin = boss(rt, 'thor', 'player', [32, 100], 6000);
    const clusters: Pt[] = [[24, 60], [64, 30], [100, 70], [64, 90], [108, 20]];
    const bases = clusters.map((c, i) => place(rt, 'enemy', [{ type: 'command_center', at: c }, { type: 'barracks', at: [c[0] + 5, c[1] + 3] }, { type: 'factory', at: [c[0] - 5, c[1] + 3] }, { type: 'bunker', at: [c[0], c[1] - 6] }]));
    bases.forEach((b, i) => { const n = 5 + i * 2; wave(rt, [{ type: 'marine', n }, ...(i > 1 ? [{ type: 'siege_tank' as const, n: 2 }] : []), ...(i === 4 ? [{ type: 'battlecruiser' as const, n: 3 }] : [])], clusters[i]!, clusters[i]!, 'enemy', true); });
    let cur = 0, wait = 0;
    rt.onTick(dt => { if (rt.status('escort') !== 'done') return; if (!rt.state.go) { rt.state.go = true; rt.reveal('bases'); rt.reveal('odin'); mustSurvive(rt, 'odin', () => odin); rt.say('Tychus takes the Odin!'); }
      if (cur >= clusters.length) return; const b = bases[cur]!;
      if (b.every(x => x.isDead)) { rt.progress('bases', ++cur); wait = 50; rt.say(cur < 5 ? 'The Odin rests. Dominion forces counterattack!' : 'The Odin launches its nuke.'); if (cur < 5) wave(rt, [{ type: 'vulture', n: 6 + cur }, ...(cur > 2 ? [{ type: 'reaper' as const, n: 8 }] : [])], clusters[cur]!, [64, 100]); return; }
      if (wait > 0) { wait -= dt; return; }
      if (!odin.isDead) odin.setCommand({ type: 'attack_move', targetPos: { x: clusters[cur]![0], y: clusters[cur]![1] } }); });
    const loki = boss(rt, 'battlecruiser', 'enemy', [64, 98], 2000); rt.onTick(() => { if (loki.isDead) rt.complete('loki'); });
    const tis: Pt[] = [[30, 96], [24, 64], [100, 74]]; const g = new Set<number>();
    rt.onTick(() => tis.forEach((s, i) => { if (!g.has(i) && rt.near(s[0], s[1], 3, 'player').length) { g.add(i); rt.progress('tissue', g.size); } }));
  }
});
