import type { MissionDef } from '../../../types';
import { place, waves } from '../../../helpers';
import { spawnNova } from '../../../helpers';

/** Mission 9. Defend 5 Gorgons from the Xanthos. Xanthos is a stand-in (big-HP Thor) with 3 activations; times UNVERIFIED. */
export const endGame: MissionDef = {
  key: 'end_game', order: 9, chapter: 'Mission Pack 3', title: 'End Game', subtitle: 'Cerros Shipyards · Destroy the Xanthos',
  playerFaction: 'terran', enemyFaction: 'terran', mapId: 'nco_end_game', difficulty: 'normal',
  startingMinerals: 800, startingGas: 300, aiOff: true, customWin: true,
  startingUnits: [{ type: 'marine', count: 8 }, { type: 'siege_tank', count: 2 }, { type: 'battlecruiser', count: 1 }],
  briefing: 'General Davis has activated the Xanthos to crush the Gorgon fleet. Hold the shipyard, wear the machine down through its three activations, then finish Davis.',
  objectives: [
    { id: 'gorgons', text: 'Don\'t let Gorgons be destroyed', kind: 'primary', passive: true, target: 5 },
    { id: 'xanthos', text: 'Destroy the Xanthos', kind: 'primary' },
    { id: 'davis', text: 'Kill Davis', kind: 'primary', hidden: true }
  ],
  spec: 'docs/campaign/nova-covert-ops.md',
  gaps: ['Xanthos modules (flamethrower, rail gun, fighter bay, missile battery) and repair-bay phase are collapsed into HP thresholds', 'Hyperion is a timed allied Battlecruiser', 'Enemy ghost nukes are scripted warnings'],
  script(rt) {
    spawnNova(rt, [100, 96]); rt.focus(104, 104);
    const gorgons = place(rt, 'player', [[96, 60], [80, 50], [60, 70], [50, 90], [74, 84]].map(at => ({ type: 'bunker' as const, at: at as [number, number] })));
    rt.onTick(() => { if (gorgons.every(g => g.isDead)) rt.fail('gorgons'); });
    place(rt, 'enemy', [{ type: 'bunker', at: [30, 30] }, { type: 'missile_turret', at: [34, 26] }, { type: 'starport', at: [22, 22] }]);
    // enemy attack waves between activations
    waves(rt, { start: 120, every: 110, from: [[22, 22], [40, 20]], to: [104, 104], owner: 'enemy', tiers: [
      { atMin: 0, units: [{ type: 'marine', n: 8 }, { type: 'marauder', n: 3 }] }, { atMin: 8, units: [{ type: 'marauder', n: 6 }, { type: 'siege_tank', n: 2 }, { type: 'banshee', n: 2 }] }] });
    // the Xanthos: three activations
    const spawnX = (hp: number, n: number) => {
      const x = rt.spawn('thor', 'enemy', 24, 24)[0]!; x.maxHealth = x.health = hp; rt.state.x = x; rt.state.act = n;
      x.setCommand({ type: 'attack_move', targetPos: { x: 96, y: 60 } }); rt.say(`The Xanthos is online (activation ${n}).`); return x;
    };
    rt.after(150, () => spawnX(3500, 1));
    rt.onTick(() => {
      const x = rt.state.x; if (!x || rt.state.done) return;
      if (x.isDead) {
        if (rt.state.act < 3) { rt.after(40, () => spawnX(3500 + rt.state.act * 800, rt.state.act + 1)); rt.state.x = null; rt.say('The Xanthos retreats to its repair bay.'); }
        else { rt.state.done = true; rt.complete('xanthos'); rt.reveal('davis'); const d = rt.spawn('ghost', 'enemy', 60, 60)[0]!; d.maxHealth = d.health = 300; rt.state.d = d; rt.say('Davis: you would be no better than I am...'); }
      }
    });
    rt.onTick(() => { const d = rt.state.d; if (d && d.isDead) rt.complete('davis'); });
    // Hyperion support
    for (const t of [6, 12]) rt.after(t * 60, () => { const h = rt.spawn('battlecruiser', 'player', 104, 90)[0]!; rt.say('Horner: Hyperion on station.'); rt.after(90, () => { if (!h.isDead) rt.world.removeWhere(e => e === h); }); });
  }
};
