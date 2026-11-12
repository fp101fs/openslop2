import { mission, tookAir } from '../common';
import { boss, place, waves, wave } from '../../../helpers';
import { diffScale } from '../../../helpers';

/** 26. All-In - defend the Artifact until it is fully charged. Variant: Zerg AIR (after Belly of the Beast) or Nydus worms (after Shatter the Sky).
 *  Charge length (22 min) is UNVERIFIED. The Artifact's Energy Nova is the 'artifact_nova' ability on the Artifact structure. */
export const allIn = mission({
  key: 'all_in', order: 26, chapter: 'Final', title: 'All-In', subtitle: 'Defend the Artifact',
  enemyFaction: 'zerg', mapId: 'wol_all_in', noPlayerBase: false, startingMinerals: 1000, startingGas: 400,
  unlock: d => d.has('belly_of_the_beast') || d.has('shatter_the_sky'),
  startingBuildings: [{ type: 'bunker', dx: -9, dy: 4 }, { type: 'bunker', dx: 9, dy: 4 }],
  startingUnits: [{ type: 'siege_tank', count: 3 }, { type: 'marine', count: 10 }, { type: 'battlecruiser', count: 2 }],
  briefing: 'The Artifact is charging. Hold the ramps until it is ready; its Energy Nova is your panic button. Kerrigan will come for it.',
  objectives: [{ id: 'artifact', text: 'Defend the Artifact', kind: 'primary' }],
  gaps: ['Charge time, Kerrigan and Leviathan timings are estimates', 'Nydus worms are tough Spine Crawler stand-ins'],
  script(rt) {
    const air = tookAir(); const D = diffScale(rt); const TOTAL = 22 * 60;
    const art = place(rt, 'player', [{ type: 'missile_turret', at: [64, 108] }])[0]!; art.maxHealth = art.health = 6000; (art as any).isArtifact = true; rt.state.art = art; rt.state.used = 0;
    rt.onTick(() => { if (art.isDead) rt.fail('artifact'); });
    rt.state.loss = 0; (rt.objectives.get('artifact')!.def as any).target = 100;
    rt.onTick(() => { const c = Math.max(0, Math.min(100, (rt.elapsed / TOTAL) * 100 - rt.state.loss)); rt.state.charge = c; rt.progress('artifact', Math.floor(c)); });
    rt.every(60, () => rt.say(`Artifact charge: ${Math.round(rt.state.charge)}%`, 3), 60);
    const gate = [[20, 64], [108, 64]] as [number, number][];
    if (air) {
      waves(rt, { start: 60, every: 40, from: gate, to: [64, 96], tiers: [{ atMin: 0, units: [{ type: 'mutalisk', n: 6 }, { type: 'zergling', n: 10 }] }, { atMin: 7, units: [{ type: 'mutalisk', n: 10 }, { type: 'broodlord', n: 3 }, { type: 'hydralisk', n: 8 }] }, { atMin: 14, units: [{ type: 'broodlord', n: 5 }, { type: 'mutalisk', n: 14 }, { type: 'ultralisk', n: 2 }] }] });
      rt.after(TOTAL * 0.7, () => { rt.say('The Leviathan approaches!'); const lev = boss(rt, 'broodlord', 'enemy', [64, 30], 3000); lev.setCommand({ type: 'attack_move', targetPos: { x: 64, y: 100 } }); rt.every(15, () => { if (!lev.isDead) rt.spawn('mutalisk', 'enemy', lev.pos.x, lev.pos.y, 4); }, 8); });
    } else {
      waves(rt, { start: 60, every: 45, from: gate, to: [64, 96], tiers: [{ atMin: 0, units: [{ type: 'zergling', n: 12 }, { type: 'roach', n: 4 }] }, { atMin: 7, units: [{ type: 'roach', n: 10 }, { type: 'hydralisk', n: 8 }, { type: 'baneling', n: 8 }] }, { atMin: 14, units: [{ type: 'ultralisk', n: 4 }, { type: 'roach', n: 12 }] }] });
      rt.every(150, () => { for (let i = 0; i < 3; i++) { const nydus = place(rt, 'enemy', [{ type: 'spine_crawler', at: [30 + i * 30 + Math.random() * 10, 20 + Math.random() * 20] }])[0]!; nydus.maxHealth = nydus.health = D >= 1.7 ? 500 : D >= 1.35 ? 400 : 300;
        rt.every(12, () => { if (!nydus.isDead) rt.spawn('zergling', 'enemy', nydus.pos.x, nydus.pos.y, 6).forEach(u => u.setCommand({ type: 'attack_move', targetPos: { x: 64, y: 96 } })); }, 6); } }, 90);
    }
    // Kerrigan returns at 25 / 50 / 75 / 98 %
    [0.25, 0.5, 0.75, 0.98].forEach(f => rt.after(TOTAL * f, () => { const k = boss(rt, 'queen', 'enemy', [64, 20], D >= 1.7 ? 1500 : D >= 1.35 ? 1250 : 1000); k.setCommand({ type: 'attack_move', targetPos: { x: 64, y: 100 } }); rt.say('Kerrigan is attacking!'); }));
    void wave;
  }
});
