import { mission } from '../common';
import { boss, place, wave } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 5. Outbreak - destroy 144 infested structures; day ~3 min (move out), night ~5 min (Infested Terrans attack). */
export const outbreak = mission({
  key: 'outbreak', order: 5, chapter: 'Colonist', title: 'Outbreak', subtitle: 'Investigate the Meinhoff infestation',
  enemyFaction: 'zerg', mapId: 'wol_outbreak', startingMinerals: 500,
  startingUnits: [{ type: 'marine', count: 6 }, { type: 'medic', count: 2 }, { type: 'firebat', count: 2 }],
  briefing: 'An infestation has taken the colony. By day move out and cleanse structures; by night hold the base against Infested Terrans.',
  objectives: [
    { id: 'cleanse', text: 'Cleanse the infestation (structures)', kind: 'primary', target: 144 },
    { id: 'infestors', text: 'Kill the Infestors', kind: 'bonus', target: 2 }
  ],
  gaps: ['Infested Terrans are Zerglings; Infested Marines/Aberrations appear as Hydralisks/Ultralisks', 'Structures spawn broodlings but the night-spawn-on-damage rule is not implemented'],
  script(rt) {
    const DAY = 180, NIGHT = 300, CYCLE = DAY + NIGHT;
    const types = ['spine_crawler', 'extractor', 'spawning_pool', 'hydralisk_den'] as const;
    const pts: Pt[] = []; for (let i = 0; i < 144; i++) pts.push([10 + (i % 24) * 4.4 + (Math.floor(i / 24) % 2) * 2, 8 + Math.floor(i / 24) * 12 + ((i * 7) % 5)]);
    const structs = place(rt, 'enemy', pts.filter(p => Math.hypot(p[0] - 64, p[1] - 100) > 22).slice(0, 144).map((at, i) => ({ type: types[i % 4]!, at })));
    // pad to exactly 144 if the exclusion removed some
    while (structs.length < 144) structs.push(...place(rt, 'enemy', [{ type: 'extractor', at: [8 + structs.length % 20 * 5, 60 + (structs.length % 7) * 3] as Pt }]));
    const seen = new Set<any>();
    rt.onTick(() => { for (const s of structs) if (s.isDead && !seen.has(s)) { seen.add(s); rt.add('cleanse', 1); if ((rt as any).isNight()) wave(rt, [{ type: 'zergling', n: 3 }], [s.pos.x, s.pos.y], [s.pos.x, s.pos.y], 'enemy', true); } });
    (rt as any).isNight = () => (rt.elapsed % CYCLE) >= DAY;
    rt.every(CYCLE, () => rt.say('Night falls. Infested Terrans are coming.'), DAY);
    rt.every(CYCLE, () => rt.say('Day breaks. Move out.'), CYCLE);
    rt.every(14, () => { if (!(rt as any).isNight()) return; const n = Math.floor(rt.elapsed / CYCLE) + 1; wave(rt, [{ type: 'zergling', n: 8 + n * 3 }, ...(n > 1 ? [{ type: 'hydralisk' as const, n: n * 2 }] : []), ...(n > 3 ? [{ type: 'ultralisk' as const, n: 1 }] : [])], [[14, 60], [64, 20], [114, 60]][Math.floor(Math.random() * 3)] as Pt, [64, 100]); }, 30);
    const inf = [boss(rt, 'viper', 'enemy', [100, 30], 220), boss(rt, 'viper', 'enemy', [20, 40], 220)];
    rt.onTick(() => { rt.progress('infestors', inf.filter(i => i.isDead).length); });
  }
});
