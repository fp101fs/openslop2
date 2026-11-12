import { mission } from '../common';
import { boss, place, waves } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 25b. Shatter the Sky - destroy 4 Cooling Towers; each gives 45 s to evacuate its platform; the Leviathan appears after tower 2. */
export const shatterTheSky = mission({
  key: 'shatter_the_sky', order: 25, chapter: 'Final', title: 'Shatter the Sky', subtitle: 'Destroy the Coolant Towers',
  enemyFaction: 'zerg', mapId: 'wol_shatter_the_sky', noPlayerBase: false, startingMinerals: 600, startingGas: 200,
  unlock: d => d.has('gates_of_hell'), startingUnits: [{ type: 'battlecruiser', count: 1 }, { type: 'marine', count: 8 }],
  briefing: 'Take out the Zerg air support at its source: four Cooling Towers on four platforms, each primed to blow 45 seconds after the tower falls.',
  objectives: [
    { id: 'towers', text: 'Destroy the Coolant Towers', kind: 'primary', target: 4 },
    { id: 'leviathan', text: 'Kill the Zerg Leviathan', kind: 'bonus', hidden: true }
  ],
  gaps: ['Tower platform explosions are an area burst 45 s after each tower dies (the fourth ends the mission at once)'],
  script(rt) {
    const sites: Pt[] = [[24, 108], [108, 108], [20, 20], [64, 64]];
    const towers = sites.map(s => place(rt, 'enemy', [{ type: 'hydralisk_den', at: s }, { type: 'spine_crawler', at: [s[0] + 4, s[1] + 3] }, { type: 'spine_crawler', at: [s[0] - 4, s[1] + 3] }, { type: 'hatchery', at: [s[0] + 8, s[1] - 6] }])[0]!);
    let done = 0; const handled = new Set<any>();
    rt.onTick(() => { for (const t of towers) if (t.isDead && !handled.has(t)) { handled.add(t); done++; rt.progress('towers', done);
      if (done < 4) { rt.say('Evacuate the platform! It blows in 45 seconds.'); const c = t.pos; rt.after(45, () => { for (const u of rt.world.units) if (!u.isDead && Math.hypot(u.pos.x - c.x, u.pos.y - c.y) < 18) u.takeDamage(9999); for (const b of rt.world.buildings) if (!b.isDead && Math.hypot(b.pos.x - c.x, b.pos.y - c.y) < 18) b.takeDamage(9999); }); }
      if (done === 2) { rt.reveal('leviathan'); rt.say('The Leviathan has appeared!'); const lev = boss(rt, 'broodlord', 'enemy', [64, 40], 3000); rt.state.lev = lev; rt.every(20, () => { if (!lev.isDead) rt.spawn('mutalisk', 'enemy', lev.pos.x, lev.pos.y, 3); }, 10); } } });
    rt.onTick(() => { const l = rt.state.lev; if (l && l.isDead) rt.complete('leviathan'); });
    waves(rt, { start: 80, every: 55, from: [[24, 108], [20, 20], [64, 64]], to: [108, 20], tiers: [{ atMin: 0, units: [{ type: 'zergling', n: 10 }, { type: 'hydralisk', n: 4 }] }, { atMin: 8, units: [{ type: 'ultralisk', n: 2 }, { type: 'mutalisk', n: 6 }, { type: 'broodlord', n: 2 }] }] });
  }
});
