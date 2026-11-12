import { mission } from '../common';
import { boss, place, wave, mustSurvive, reach } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 25a. Belly of the Beast - four heroes, three fissures (protect each charge), kill the Queen, escape the rising lava. */
export const bellyOfTheBeast = mission({
  key: 'belly_of_the_beast', order: 25, chapter: 'Final', title: 'Belly of the Beast', subtitle: 'Plant seismic charges at each fissure',
  enemyFaction: 'zerg', mapId: 'wol_belly_of_the_beast', noPlayerBase: true, startingMinerals: 0,
  unlock: d => d.has('gates_of_hell'),
  briefing: 'Raynor, Tychus, Swann and Stetmann crawl the Nydus caverns: plant three seismic charges, kill the Queen and run.',
  objectives: [
    { id: 'charges', text: 'Plant Seismic Charges at each Fissure', kind: 'primary', target: 3 },
    { id: 'queen', text: 'Kill the Queen', kind: 'primary', hidden: true },
    { id: 'escape', text: 'Escape the cave', kind: 'primary', hidden: true },
    { id: 'heroes', text: 'Your heroes must survive', kind: 'primary', passive: true }
  ],
  gaps: ['Hero abilities (Penetrator Round, Grenade, Flaming Betty, Regeneration) are not implemented; heroes are strong Marines/Marauders'],
  script(rt) {
    const heroes = [boss(rt, 'marine', 'player', [14, 100], 500), boss(rt, 'marauder', 'player', [16, 100], 600), boss(rt, 'scv', 'player', [14, 98], 400), boss(rt, 'medic', 'player', [16, 98], 300)];
    rt.focus(14, 100); rt.onTick(() => { if (heroes.every(h => h.isDead)) rt.fail('heroes'); }); void mustSurvive;
    const fissures: Pt[] = [[60, 100], [90, 50], [112, 24]];
    let idx = 0, charge = -1;
    rt.onTick(dt => { if (idx >= fissures.length) return; const f = fissures[idx]!;
      if (charge < 0) { if (rt.near(f[0], f[1], 5, 'player').length) { charge = 0; rt.say('Seismic charge armed. Protect it!'); rt.state.cb = place(rt, 'player', [{ type: 'bunker', at: [f[0], f[1]] }])[0]!; (rt.state.cb as any).maxHealth = (rt.state.cb as any).health = 1000; } }
      else { charge += dt; if (rt.state.cb.isDead) rt.fail('charges'); if (charge >= 60) { rt.progress('charges', ++idx); charge = -1; rt.world.removeWhere(e => e === rt.state.cb); if (idx >= 3) rt.reveal('queen'); } } });
    rt.every(14, () => { if (charge >= 0 && idx < 3) { const f = fissures[idx]!; wave(rt, [{ type: 'zergling', n: 8 + idx * 4 }, { type: 'baneling', n: 3 + idx * 2 }, ...(charge > 45 ? [{ type: 'ultralisk' as const, n: 2 }] : [])], [f[0] - 14, f[1] - 14], f); } }, 10);
    for (const at of [[36, 100], [74, 76], [100, 40]] as Pt[]) wave(rt, [{ type: 'zergling', n: 10 }, { type: 'baneling', n: 4 }], at, at, 'enemy', true);
    rt.onTick(() => { if (rt.status('queen') === 'active' && !rt.state.q) { rt.state.q = boss(rt, 'queen', 'enemy', [108, 28], 4000); } const q = rt.state.q; if (q && q.isDead && rt.status('queen') === 'active') { rt.complete('queen'); rt.reveal('escape'); rt.say('Run! The lava is rising.'); rt.state.lava = true; rt.state.lt = 0; } });
    rt.onTick(dt => { if (!rt.state.lava) return; rt.state.lt += dt; if (rt.state.lt > 150) for (const u of rt.world.units) if (u.playerId === 'player' && !u.isDead) u.takeDamage(40 * dt); });
    reach(rt, 'escape', [14, 100], 5, () => rt.status('queen') === 'done');
  }
});
