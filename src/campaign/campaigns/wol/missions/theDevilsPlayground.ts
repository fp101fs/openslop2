import { mission } from '../common';
import { boss, rescue, mineGoal, waves } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 12. The Devil's Playground - mine 8000 minerals while the lava rises; low-ground units burn. */
export const theDevilsPlayground = mission({
  key: 'the_devils_playground', order: 12, chapter: 'Covert', title: 'The Devil\'s Playground', subtitle: 'Mine 8000 minerals',
  enemyFaction: 'zerg', mapId: 'wol_the_devils_playground', noPlayerBase: false, startingMinerals: 300,
  unlock: d => d.size >= 4, startingUnits: [{ type: 'marine', count: 4 }],
  briefing: 'Tosh needs 8000 minerals from a volcanic planet. The lava rises periodically: get your workers to high ground.',
  objectives: [
    { id: 'mine', text: 'Mine 8000 minerals', kind: 'primary', target: 8000 },
    { id: 'miners', text: 'Locate Tosh\'s miners', kind: 'bonus' },
    { id: 'brutalisk', text: 'Kill the Brutalisk', kind: 'bonus' }
  ],
  gaps: ['Lava is simulated as damage to low-ground units; the 26 Reaper crew members are collapsed into one Command Center + SCV find'],
  script(rt) {
    mineGoal(rt, 'mine', 8000);
    // lava: every 150 s a 20 s flood damages everything standing on low ground (height < 1)
    let flood = 0;
    rt.every(150, () => { rt.say('Lava is rising! Get to high ground.'); flood = 20; }, 120);
    rt.onTick(dt => { if (flood <= 0) return; flood -= dt; for (const u of rt.world.units) if (!u.isDead && u.playerId === 'player' && u.height < 0.9) u.takeDamage(30 * dt); });
    rescue(rt, 'miners', [30, 56] as Pt, [{ type: 'scv', n: 5 }], 5);
    const brut = boss(rt, 'ultralisk', 'enemy', [24, 108], 1500); rt.onTick(() => { if (brut.isDead) rt.complete('brutalisk'); });
    waves(rt, { start: 90, every: 70, from: [[108, 40], [64, 24], [108, 100]], to: [24, 64], tiers: [{ atMin: 0, units: [{ type: 'zergling', n: 8 }, { type: 'hydralisk', n: 2 }] }, { atMin: 8, units: [{ type: 'roach', n: 6 }, { type: 'mutalisk', n: 4 }] }] });
  }
});
