import { mission } from '../common';
import { place, destroyAll, wave, waves } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 10. Supernova - clear the landing zone and destroy the Artifact Vault before the wall of fire reaches it. */
export const supernova = mission({
  key: 'supernova', order: 10, chapter: 'Artifact', title: 'Supernova', subtitle: 'Seize the Xel\'Naga Artifact',
  enemyFaction: 'protoss', mapId: 'wol_supernova', startingMinerals: 300, startingGas: 100,
  unlock: d => d.has('the_moebius_factor') && d.size >= 14, startingUnits: [{ type: 'banshee', count: 4 }],
  briefing: 'A star is going supernova. A wall of fire sweeps the planet; find the artifact and escape.',
  objectives: [
    { id: 'zone', text: 'Clear the landing zone', kind: 'primary' },
    { id: 'vault', text: 'Destroy the Artifact Vault', kind: 'primary', hidden: true },
    { id: 'relics', text: 'Find the 4 Protoss Relics', kind: 'bonus', target: 4 }
  ],
  gaps: ['The wall of fire has no visual; it is announced by messages and kills everything it passes', 'Fire speed (~22 min to the vault) is an estimate'],
  script(rt) {
    const foes = wave(rt, [{ type: 'zealot', n: 3 }, { type: 'stalker', n: 3 }], [48, 84], [48, 84], 'enemy', true);
    rt.onTick(() => { if (rt.status('zone') === 'active' && foes.every(f => f.isDead)) { rt.complete('zone'); rt.reveal('vault'); rt.say('Landing zone secured.'); } });
    const vault = place(rt, 'enemy', [{ type: 'nexus', at: [100, 28] }])[0]!; vault.maxHealth = vault.health = 2500;
    place(rt, 'enemy', [{ type: 'photon_cannon', at: [96, 34] }, { type: 'photon_cannon', at: [104, 34] }, { type: 'pylon', at: [92, 28] }, { type: 'gateway', at: [60, 40] }, { type: 'photon_cannon', at: [62, 44] }]);
    destroyAll(rt, 'vault', [vault]);
    // wall of fire: front x advances from 0 to 128 over ~26 minutes; everything behind it burns (the vault only fails the mission if the fire lands the last hit)
    const SPEED = 128 / (26 * 60); let front = -2; rt.state.warn = false;
    rt.onTick(dt => { front += SPEED * dt; if (!rt.state.warn && front > 40) { rt.state.warn = true; rt.say('The wall of fire is closing in. Relocate!'); }
      for (const u of rt.world.units) if (!u.isDead && u.pos.x < front) u.takeDamage(9999);
      for (const b of rt.world.buildings) if (!b.isDead && b.pos.x < front && b.playerId === 'player') b.takeDamage(9999);
      if (!vault.isDead && vault.pos.x < front) { if (rt.status('vault') === 'active') rt.fail('vault'); } });
    waves(rt, { start: 150, every: 100, from: [[60, 40]], to: [40, 90], tiers: [{ atMin: 0, units: [{ type: 'zealot', n: 6 }, { type: 'stalker', n: 3 }] }, { atMin: 8, units: [{ type: 'stalker', n: 6 }, { type: 'archon', n: 1 }] }] });
    const sites: Pt[] = [[56, 88], [60, 100], [88, 54], [100, 40]]; const got = new Set<number>();
    rt.onTick(() => sites.forEach((s, i) => { if (!got.has(i) && rt.near(s[0], s[1], 3, 'player').length) { got.add(i); rt.progress('relics', got.size); } }));
  }
});
