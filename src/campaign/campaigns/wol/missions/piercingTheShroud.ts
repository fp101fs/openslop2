import { mission } from '../common';
import { boss, place, reach, wave, mustSurvive } from '../../../helpers';
import { hasSecret } from '../common';
import type { Pt } from '../../../helpers';

/** 19. Piercing the Shroud (secret) - dungeon crawl: investigate the lab, destroy the Fusion Generator, then escape the Hybrid. */
export const piercingTheShroud = mission({
  key: 'piercing_the_shroud', order: 19, chapter: 'Rebellion', title: 'Piercing the Shroud', subtitle: 'Secret research platform',
  enemyFaction: 'terran', mapId: 'wol_piercing_the_shroud', noPlayerBase: true, startingMinerals: 0,
  unlock: d => d.has('media_blitz') && hasSecret(), startingUnits: [{ type: 'marine', count: 5 }, { type: 'medic', count: 2 }],
  briefing: 'Raynor and a small squad explore a Dominion lab, destroy its fusion generator and flee from an invulnerable Hybrid.',
  objectives: [
    { id: 'lab', text: 'Investigate the Dominion Lab', kind: 'primary' },
    { id: 'fusion', text: 'Destroy the Fusion Generator', kind: 'primary', hidden: true },
    { id: 'escape', text: 'Escape from the facility', kind: 'primary', hidden: true },
    { id: 'raynor', text: 'Raynor must survive', kind: 'primary', passive: true },
    { id: 'relics', text: 'Find the Protoss relics', kind: 'bonus', target: 4 },
    { id: 'brutalisk', text: 'Kill the Brutalisk', kind: 'bonus' }
  ],
  gaps: ['Weapon pickups, ARES console and reinforcement choices are omitted; the Hybrid is an invulnerable chaser'],
  script(rt) {
    const raynor = boss(rt, 'marine', 'player', [14, 96], 450); rt.focus(14, 96); mustSurvive(rt, 'raynor', () => raynor);
    for (const at of [[34, 100], [50, 100], [70, 84], [70, 62]] as Pt[]) wave(rt, [{ type: 'marine', n: 3 }, { type: 'medic', n: 1 }], at, at, 'enemy', true);
    place(rt, 'enemy', [{ type: 'missile_turret', at: [58, 96] }, { type: 'missile_turret', at: [74, 56] }]);
    wave(rt, [{ type: 'thor', n: 1 }, { type: 'marine', n: 4 }], [70, 50], [70, 50], 'enemy', true);
    reach(rt, 'lab', [64, 100], 4);
    rt.onTick(() => { if (rt.status('lab') === 'done') rt.reveal('fusion'); });
    const brut = boss(rt, 'ultralisk', 'enemy', [94, 42], 1500); rt.onTick(() => { if (brut.isDead) rt.complete('brutalisk'); });
    const fusion = place(rt, 'enemy', [{ type: 'factory', at: [112, 24] }])[0]!; fusion.maxHealth = fusion.health = 900;
    rt.onTick(() => { if (fusion.isDead && rt.status('fusion') === 'active') { rt.complete('fusion'); rt.reveal('escape'); rt.say('Run! The Hybrid has been released.');
      const h = boss(rt, 'ultralisk', 'enemy', [100, 30], 99999); rt.state.h = h; } });
    rt.onTick(() => { const h = rt.state.h; if (h && !h.isDead) { h.health = h.maxHealth; h.setCommand({ type: 'move', targetPos: { x: raynor.pos.x, y: raynor.pos.y } }); } });
    reach(rt, 'escape', [14, 100], 5, () => rt.status('fusion') === 'done');
    const rl: Pt[] = [[60, 104], [96, 40], [40, 100], [80, 80]]; const g = new Set<number>();
    rt.onTick(() => rl.forEach((s, i) => { if (!g.has(i) && rt.near(s[0], s[1], 3, 'player').length) { g.add(i); rt.progress('relics', g.size); } }));
  }
});
