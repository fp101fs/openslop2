import { mission } from '../common';
import { boss, place, waves, mustSurvive } from '../../../helpers';
import type { Pt } from '../../../helpers';

/** 8. The Dig - protect the Laser Drill while it burns through the Xel'Naga Temple Door. Waves intensify as the door weakens. */
export const theDig = mission({
  key: 'the_dig', order: 8, chapter: 'Artifact', title: 'The Dig', subtitle: 'Recover the Xel\'Naga Artifact',
  enemyFaction: 'protoss', mapId: 'wol_the_dig', startingMinerals: 600, startingGas: 100,
  unlock: d => d.has('smash_and_grab') && d.size >= 8, startingUnits: [{ type: 'marine', count: 6 }, { type: 'siege_tank', count: 3 }, { type: 'medic', count: 2 }],
  briefing: 'Hold the encampment while the Laser Drill burns through the temple door. The more damage the door takes, the harder the Tal\'darim attack.',
  objectives: [
    { id: 'drill', text: 'Recover the Laser Drill', kind: 'primary' },
    { id: 'door', text: 'Destroy the Xel\'Naga Temple Door', kind: 'primary', hidden: true },
    { id: 'drillAlive', text: 'The Laser Drill must survive', kind: 'primary', passive: true, hidden: true },
    { id: 'relics', text: 'Find 3 Protoss Relics', kind: 'bonus', target: 3, hidden: true }
  ],
  gaps: ['Laser Drill is a stand-in turret that auto-fires on units and pauses on the door'],
  script(rt) {
    const camp: Pt = [30, 100];
    rt.after(15, () => { rt.reveal('drill'); rt.say('Secure the encampment.'); });
    rt.after(60, () => rt.complete('drill'));
    const drill = place(rt, 'player', [{ type: 'missile_turret', at: [44, 92] }])[0]!;
    const door = place(rt, 'enemy', [{ type: 'nexus', at: [104, 24] }])[0]!; door.maxHealth = door.health = 5000;
    place(rt, 'enemy', [{ type: 'pylon', at: [100, 30] }, { type: 'photon_cannon', at: [96, 34] }, { type: 'gateway', at: [88, 40] }]);
    rt.onTick(() => { if (rt.status('drill') === 'done' && !rt.state.go) { rt.state.go = true; rt.reveal('door'); rt.reveal('drillAlive'); rt.reveal('relics'); mustSurvive(rt, 'drillAlive', () => drill); rt.say('The drill is online. Burn the door.'); } });
    rt.every(2, () => { if (!rt.state.go || drill.isDead) return; const door2 = door; const foe = rt.world.units.filter(u => u.playerId === 'enemy' && !u.isDead && Math.hypot(u.pos.x - drill.pos.x, u.pos.y - drill.pos.y) < 16).sort((a, b) => b.maxHealth - a.maxHealth)[0];
      if (foe && rt.state.shoot) { foe.takeDamage(120); rt.world.particles.spawnMuzzleFlash(foe.getPosition3D(), 0xff3322, 1.4); } else if (rt.elapsed > 90) door2.takeDamage(40); }, 2);
    rt.state.shoot = true;                                   // guide: drill fires on units first, door when idle
    rt.onTick(() => { if (door.isDead) rt.complete('door'); });
    const frac = () => Math.max(0, door.health / door.maxHealth);
    waves(rt, { start: 80, every: 55, from: [[100, 36], [90, 100]], to: camp, tiers: [
      { atMin: 0, units: [{ type: 'zealot', n: 6 }, { type: 'stalker', n: 3 }] },
      { atMin: 5, units: [{ type: 'stalker', n: 8 }, { type: 'archon', n: 2 }, { type: 'void_ray', n: 2 }] },
      { atMin: 10, units: [{ type: 'archon', n: 4 }, { type: 'stalker', n: 10 }, { type: 'void_ray', n: 3 }] }] });
    rt.onTick(() => { if (frac() < 0.5 && !rt.state.surge) { rt.state.surge = true; rt.say('The Tal\'darim attack without pause!'); rt.every(14, () => wave2(rt)); } });
    const sites: Pt[] = [[60, 50], [80, 70], [90, 40]]; const got = new Set<number>();
    rt.onTick(() => sites.forEach((s, i) => { if (!got.has(i) && rt.state.go && rt.near(s[0], s[1], 3, 'player').length) { got.add(i); rt.progress('relics', got.size); } }));
    function wave2(r: typeof rt) { r.spawn('zealot', 'enemy', 100, 36, 6).forEach(u => u.setCommand({ type: 'attack_move', targetPos: { x: camp[0], y: camp[1] } })); void boss; }
  }
});
