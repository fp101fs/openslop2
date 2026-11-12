import { mission } from '../common';
import { boss, place, destroyAll, waves, wave } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 21. A Sinister Turn - Protoss base build: power the abandoned base, free three Preservers while Maar attacks. */
export const aSinisterTurn = mission({
  key: 'a_sinister_turn', order: 21, chapter: 'Prophecy', title: 'A Sinister Turn', subtitle: 'Wake the Preservers',
  playerFaction: 'protoss', enemyFaction: 'protoss', mapId: 'wol_a_sinister_turn', noPlayerBase: false, startingMinerals: 600, startingGas: 100,
  unlock: d => d.has('whispers_of_doom'),
  briefing: 'Power the abandoned base with Pylons, then free three Preservers from stasis prisons while the hybrid Maar assaults you.',
  objectives: [
    { id: 'power', text: 'Power up the abandoned base (6 buildings)', kind: 'primary', target: 6 },
    { id: 'preservers', text: 'Free the 3 Preservers', kind: 'primary', target: 3 },
    { id: 'structures', text: 'Power up abandoned structures', kind: 'bonus', target: 3 }
  ],
  gaps: ['Powering is approximated by counting your finished Pylons near the abandoned buildings', 'Maar uses stand-in stats (800/1000/1400 shields+hp as hit points) and no spells'],
  script(rt) {
    const buildings = place(rt, 'player', ([[56, 92], [60, 104], [72, 100], [76, 90], [50, 100], [68, 84]] as Pt[]).map(at => ({ type: 'gateway' as const, at })));
    void buildings;
    rt.onTick(() => { const pylons = rt.world.buildings.filter(b => b.playerId === 'player' && b.type === 'pylon' && b.isConstructed).length; rt.progress('power', Math.min(6, 1 + pylons * 2)); rt.progress('structures', Math.min(3, pylons)); });
    const prisons = place(rt, 'enemy', ([[56, 20], [64, 18], [72, 20]] as Pt[]).map(at => ({ type: 'photon_cannon' as const, at })));
    prisons.forEach(p => { p.maxHealth = p.health = 1500; });
    let k = 0; rt.onTick(() => { const d = prisons.filter(p => p.isDead).length; if (d > k) { k = d; rt.progress('preservers', d); rt.say('A Preserver is free. Maar returns!'); } });
    place(rt, 'enemy', [{ type: 'nexus', at: [64, 24] }, { type: 'gateway', at: [52, 26] }, { type: 'stargate', at: [76, 26] }, { type: 'photon_cannon', at: [60, 32] }]);
    let maar = 0; const spawnMaar = () => { const hp = [1600, 2000, 2800][Math.min(maar, 2)]!; const m = boss(rt, 'archon', 'enemy', [64, 40], hp); m.setCommand({ type: 'attack_move', targetPos: { x: 64, y: 100 } }); maar++; rt.state.maar = m; rt.say('Maar attacks!'); };
    rt.every(150, () => { const m = rt.state.maar; if (!m || m.isDead) spawnMaar(); }, 120);
    waves(rt, { start: 80, every: 70, from: [[20, 64], [108, 64]], to: [64, 100], tiers: [{ atMin: 0, units: [{ type: 'zealot', n: 5 }, { type: 'stalker', n: 3 }] }, { atMin: 7, units: [{ type: 'stalker', n: 6 }, { type: 'void_ray', n: 2 }, { type: 'archon', n: 1 }] }] });
    void destroyAll; void wave;
  }
});
