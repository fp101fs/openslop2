import { mission } from '../common';
import { place, destroyAll, waves } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 16. Cutthroat - raise 6000 minerals (mostly salvage) to hire Mira Han, or kill Orlan's Planetary Fortress first. */
export const cutthroat = mission({
  key: 'cutthroat', order: 16, chapter: 'Rebellion', title: 'Cutthroat', subtitle: 'Buy the merc contract before Orlan',
  enemyFaction: 'terran', mapId: 'wol_cutthroat', startingMinerals: 200,
  unlock: d => d.has('the_great_train_robbery'), startingUnits: [{ type: 'marine', count: 6 }, { type: 'vulture', count: 4 }],
  briefing: 'Han will fight for whoever pays 6000 minerals first. Strip Orlan\'s Command Centers, gather salvage and bring down his fortress.',
  objectives: [
    { id: 'hire', text: 'Gather 6000 minerals to hire Han\'s mercenaries', kind: 'primary', target: 6000 },
    { id: 'fortress', text: 'Destroy Orlan\'s Planetary Fortress', kind: 'primary' },
    { id: 'relics', text: 'Find the Protoss relic contraband', kind: 'bonus', target: 3 }
  ],
  gaps: ['Salvage crates give a lump of minerals; Orlan\'s income race is a timer, Han\'s mercenaries are a Siege Tank/Marauder grant', 'Spider Mines are not wired to Vultures'],
  script(rt) {
    const ccs = place(rt, 'enemy', [{ type: 'command_center', at: [64, 24] }, { type: 'command_center', at: [64, 104] }, { type: 'command_center', at: [30, 100] }]);
    const fort = place(rt, 'enemy', [{ type: 'planetary_fortress', at: [24, 64] }, { type: 'bunker', at: [34, 60] }, { type: 'barracks', at: [20, 72] }, { type: 'factory', at: [18, 56] }])[0]!;
    rt.world.spawnUnit('siege_tank', 'enemy', { x: 30, y: 66 }); rt.world.spawnUnit('siege_tank', 'enemy', { x: 30, y: 62 }); rt.world.spawnUnit('battlecruiser', 'enemy', { x: 26, y: 60 });
    // salvage crates give minerals (counted towards the contract)
    const crates: Pt[] = [[100, 50], [96, 80], [84, 40], [84, 90], [70, 52], [70, 78], [54, 32], [54, 96], [44, 64], [64, 64]]; const got = new Set<number>(); let total = 0;
    rt.onTick(() => { crates.forEach((c, i) => { if (!got.has(i) && rt.near(c[0], c[1], 3, 'player').length) { got.add(i); const v = 500; rt.world.resources.player.minerals += v; total += v; rt.say(`Salvage: +${v} minerals.`, 3); } });
      rt.progress('hire', Math.min(6000, Math.floor(rt.world.mined.player.minerals) + total)); });
    // Orlan's income: faster while his CCs live; if he reaches 6000 first he hires Han against you
    let orlan = 0; rt.onTick(dt => { orlan += dt * (4 + ccs.filter(c => !c.isDead).length * 3); if (orlan >= 6000 && !rt.state.orlanHired && rt.status('hire') === 'active') { rt.state.orlanHired = true; rt.say('Orlan has hired Han\'s mercenaries!'); } });
    destroyAll(rt, 'fortress', [fort]);
    rt.onTick(() => { if (rt.status('hire') === 'done' && !rt.state.han) { rt.state.han = true; rt.say('Mira Han\'s mercenaries are yours.'); rt.spawn('siege_tank', 'player', 100, 62, 3); rt.spawn('marauder', 'player', 102, 66, 6); } if (fort.isDead && rt.status('hire') === 'active') rt.complete('hire'); });
    waves(rt, { start: 180, every: 140, from: [[60, 24], [60, 104]], to: [108, 64], tiers: [{ atMin: 0, units: [{ type: 'marine', n: 6 }, { type: 'medic', n: 1 }] }, { atMin: 8, units: [{ type: 'marauder', n: 6 }, { type: 'siege_tank', n: 1 }] }] });
    const rl = new Set<number>(); const rs: Pt[] = [[100, 20], [30, 36], [64, 70]];
    rt.onTick(() => rs.forEach((s, i) => { if (!rl.has(i) && rt.near(s[0], s[1], 3, 'player').length) { rl.add(i); rt.progress('relics', rl.size); } }));
  }
});
