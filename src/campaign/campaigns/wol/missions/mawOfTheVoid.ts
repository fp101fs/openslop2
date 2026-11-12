import { mission } from '../common';
import { boss, place, destroyAll, waves, rescue } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 11. Maw of the Void - Rip-Field Generators damage everything but shielded Protoss and (slowly) Battlecruisers; destroy the Xel'Naga Vault. */
export const mawOfTheVoid = mission({
  key: 'maw_of_the_void', order: 11, chapter: 'Artifact', title: 'Maw of the Void', subtitle: 'Recover the Xel\'Naga Artifact',
  enemyFaction: 'protoss', mapId: 'wol_maw_of_the_void', startingMinerals: 400, startingGas: 200,
  unlock: d => d.has('supernova'), startingUnits: [{ type: 'battlecruiser', count: 3 }],
  briefing: 'A derelict Xel\'Naga ship hides the last artifact piece behind Rip-Field Generators. Only Battlecruisers can survive inside the fields.',
  objectives: [
    { id: 'zone', text: 'Clear the landing zone', kind: 'primary' },
    { id: 'vault', text: 'Destroy the Xel\'Naga Vault', kind: 'primary', hidden: true },
    { id: 'prisoners', text: 'Rescue Protoss prisoners (Dark Templar)', kind: 'bonus', target: 4 }
  ],
  gaps: ['Mothership teleport/Vortex omitted; Dark Templar prisoners are Ghosts'],
  script(rt) {
    const gens: { at: Pt; ent: any }[] = ([[64, 30], [64, 98], [30, 64], [98, 64]] as Pt[]).map(at => ({ at, ent: place(rt, 'enemy', [{ type: 'pylon', at }])[0]! }));
    place(rt, 'enemy', gens.flatMap(g => [{ type: 'photon_cannon' as const, at: [g.at[0] + 3, g.at[1] + 3] as Pt }]));
    const guards = rt.spawn('stalker', 'enemy', 100, 36, 4);
    rt.onTick(() => { if (rt.status('zone') === 'active' && guards.every(g => g.isDead)) { rt.complete('zone'); rt.reveal('vault'); rt.say('Landing zone clear. Bring the base down.'); } });
    // Rip-Fields: 8 dmg/s to non-BC player units (BC take 2), none to shielded Protoss
    rt.every(1, () => { for (const g of gens) { if (g.ent.isDead) continue; for (const u of rt.near(g.at[0], g.at[1], 11, 'player')) u.takeDamage(u.type === 'battlecruiser' ? 2 : 8); } });
    const vault = place(rt, 'enemy', [{ type: 'nexus', at: [104, 24] }])[0]!; vault.maxHealth = vault.health = 2200;
    destroyAll(rt, 'vault', [vault]);
    rt.after(7 * 60, () => { const m = boss(rt, 'void_ray', 'enemy', [104, 30], 4500); m.setCommand({ type: 'attack_move', targetPos: { x: 64, y: 64 } }); rt.say('A Mothership has warped in.'); });
    waves(rt, { start: 120, every: 90, from: [[104, 104], [64, 64]], to: [24, 104], tiers: [{ atMin: 0, units: [{ type: 'zealot', n: 6 }, { type: 'stalker', n: 4 }, { type: 'archon', n: 1 }] }, { atMin: 8, units: [{ type: 'void_ray', n: 4 }, { type: 'archon', n: 2 }] }] });
    for (const at of [[44, 44], [84, 44], [44, 84], [84, 84]] as Pt[]) rescue(rt, 'prisoners', at, [{ type: 'ghost', n: 3 }], 5);
  }
});
