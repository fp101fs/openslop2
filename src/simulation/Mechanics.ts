import { Entity } from './Entity';
import type { Unit } from './Unit';
import { Building } from './Building';
import type { PlayerId, PlayerUpgrades, Vector2D } from '../types';
import { isTownHallType, BUILDING_CONFIGS, UNIT_CONFIGS, UNIT_MORPHS } from '../config';

// ---------------------------------------------------------------------------
// Active abilities (SC2-style: energy, cooldowns, toggles, ground / ally targets)
// ---------------------------------------------------------------------------

export type AbilityTarget = 'none' | 'ground' | 'ally' | 'mineral';

export interface AbilityDef {
  id: string;
  name: string;
  icon: string;
  hotkey: string;
  desc: string;
  energy: number;        // energy cost (cloak: activation cost)
  cd: number;            // cooldown seconds
  target: AbilityTarget;
  range: number;         // cast range (0 = unlimited)
  casters: string[];     // entity types that own the ability
  minerals?: number;     // resource cost (structure abilities)
  gas?: number;
  /** Only listed on the command card while this holds (e.g. Lift Off vs Land). */
  show?: (e: any) => boolean;
}

export const ABILITIES: Record<string, AbilityDef> = {
  cloak: {
    id: 'cloak', name: 'Cloak', icon: '👻', hotkey: 'C', desc: 'Become invisible to enemies without detection. Drains energy.',
    energy: 25, cd: 1, target: 'none', range: 0, casters: ['wraith', 'ghost']
  },
  snipe: {
    id: 'snipe', name: 'Snipe', icon: '🎯', hotkey: 'Q', desc: 'Deal 125 damage to a ground or air unit at long range (not structures).',
    energy: 25, cd: 0.5, target: 'ally', range: 10, casters: ['nova']
  },
  emp_round: {
    id: 'emp_round', name: 'EMP Round', icon: '⚡', hotkey: 'E', desc: 'Fire an EMP: removes up to 100 shields and 100 energy from every unit and structure in radius 1.5 (friend and foe) and reveals cloaked units for a few seconds.',
    energy: 75, cd: 1, target: 'ground', range: 10, casters: ['ghost']
  },
  steady_targeting: {
    id: 'steady_targeting', name: 'Steady Targeting', icon: '🎯', hotkey: 'R', desc: 'Aim for 1.43 s, then deal 130 (+40 vs Psionic) damage to a biological unit, ignoring armor (patch 5.0.17). Cancelled if the Ghost takes damage or the target gets more than 14 away; the energy is refunded if it fails.',
    energy: 50, cd: 0.5, target: 'ally', range: 10, casters: ['ghost']
  },
  flashbang: { id: 'flashbang', name: 'Flashbang Grenades', icon: '✨', hotkey: 'W', desc: 'Stun and slow enemy units in the area for 5 s.', energy: 25, cd: 5, target: 'ground', range: 7, casters: ['nova'] },
  stim_infusion: { id: 'stim_infusion', name: 'Stim Infusion', icon: '💉', hotkey: 'W', desc: '+50% speed for 10 s and heals 200 life.', energy: 0, cd: 25, target: 'none', range: 0, casters: ['nova'] },
  holo_decoy: { id: 'holo_decoy', name: 'Holo Decoy', icon: '👥', hotkey: 'W', desc: 'Deploy a decoy copy for 45 s.', energy: 50, cd: 20, target: 'ground', range: 6, casters: ['nova'] },
  ionic_force_field: { id: 'ionic_force_field', name: 'Ionic Force Field', icon: '🛡️', hotkey: 'W', desc: 'Absorb 500 damage for 10 s.', energy: 25, cd: 30, target: 'none', range: 0, casters: ['nova'] },
  nova_blink: { id: 'nova_blink', name: 'Blink', icon: '🌀', hotkey: 'C', desc: 'Teleport nearby; cloaked for 10 s afterwards.', energy: 0, cd: 8, target: 'ground', range: 8, casters: ['nova'] },
  plasma_shot: { id: 'plasma_shot', name: 'Plasma Shot', icon: '🔥', hotkey: 'Q', desc: '100 damage to enemies in the area and a slowing plasma trail.', energy: 75, cd: 1, target: 'ground', range: 8, casters: ['nova'] },
  fury_of_one: { id: 'fury_of_one', name: 'Fury of One', icon: '⚔️', hotkey: 'Q', desc: 'Strike random enemies within 5, 11 times for 45 each.', energy: 100, cd: 1, target: 'ground', range: 6, casters: ['nova'] },
  artifact_nova: {
    id: 'artifact_nova', name: 'Energy Nova', icon: '☄️', hotkey: 'N', desc: 'Unleash the Artifact: every Zerg unit in a huge radius dies (Kerrigan and the Leviathan take 1000 damage). Costs 12.5% of the charge.',
    energy: 0, cd: 3, target: 'none', range: 0, casters: ['missile_turret'], show: (e: any) => !!e.isArtifact
  },
  dominate: {
    id: 'dominate', name: 'Domination', icon: '🧠', hotkey: 'D', desc: 'Indoctrination Visor: take permanent control of an enemy unit (cooldown starts when cancelled).',
    energy: 25, cd: 30, target: 'ally', range: 8, casters: ['nova']
  },
  pulse_grenade: {
    id: 'pulse_grenade', name: 'Pulse Grenades', icon: '💣', hotkey: 'W', desc: 'Up to 100 damage to enemy ground units in the area. Never hurts friendlies.',
    energy: 50, cd: 5, target: 'ground', range: 7, casters: ['nova']
  },
  nuke: {
    id: 'nuke', name: 'Tactical Nuke', icon: '☢️', hotkey: 'N', desc: 'Call down a nuclear strike. Ghost: lands after 14 s, 300 damage (+200 vs structures), range 12. Nova (campaign): 5 s, 750 (+200 vs structures), range 10. 100% / 50% / 25% damage in rings out to radius 8; ignores armor; hits friend and foe.',
    energy: 0, cd: 60, target: 'ground', range: 12, casters: ['nova', 'ghost']
  },
  scan: {
    id: 'scan', name: 'Scanner Sweep', icon: '📡', hotkey: 'R', desc: 'Reveal an area (radius 13) and detect cloaked / burrowed units for 12s.',
    energy: 50, cd: 1, target: 'ground', range: 0, casters: ['orbital_command']
  },
  mule: {
    id: 'mule', name: 'Call Down MULE', icon: '📦', hotkey: 'E', desc: 'Drop a MULE on a mineral patch. Mines 25 per trip for 64s.',
    energy: 50, cd: 1, target: 'mineral', range: 0, casters: ['orbital_command']
  },
  orbital: {
    id: 'orbital', name: 'Orbital Command', icon: '🛰️', hotkey: 'O', desc: 'Upgrade to an Orbital Command (25s, needs a Barracks): MULEs, Scanner Sweep, 50 starting energy.',
    energy: 0, cd: 1, target: 'none', range: 0, casters: ['command_center'], minerals: 150,
    show: (b: any) => !b.isAirborne && b.morphT <= 0
  },
  planetary: {
    id: 'planetary', name: 'Planetary Fortress', icon: '🏰', hotkey: 'P', desc: 'Upgrade to a Planetary Fortress (36s, needs an Engineering Bay): 3 armor and a ground cannon with splash. Cannot lift off or use MULEs.',
    energy: 0, cd: 1, target: 'none', range: 0, casters: ['command_center'], minerals: 150, gas: 150,
    show: (b: any) => !b.isAirborne && b.morphT <= 0
  },
  auto_turret: {
    id: 'auto_turret', name: 'Auto-Turret', icon: '🔫', hotkey: 'T', desc: 'Deploy an Auto-Turret (10s, 150 HP, 18 damage, hits ground and air).',
    energy: 50, cd: 1, target: 'ground', range: 4, casters: ['raven']
  },
  creep_tumor: {
    id: 'creep_tumor', name: 'Creep Tumor', icon: '🟣', hotkey: 'C', desc: 'Plant a burrowed Creep Tumor on creep. It spreads creep and can seed one more tumor.',
    energy: 25, cd: 1, target: 'ground', range: 6, casters: ['queen']
  },
  spread_tumor: {
    id: 'spread_tumor', name: 'Spread Creep Tumor', icon: '🌱', hotkey: 'T', desc: 'Seed a new Creep Tumor on creep up to 10 away (once).',
    energy: 0, cd: 1, target: 'ground', range: 10, casters: ['creep_tumor'], show: (b: any) => b.isConstructed && !b.tumorSpent
  },
  nydus_worm: {
    id: 'nydus_worm', name: 'Summon Nydus Worm', icon: '🪱', hotkey: 'W', desc: 'Summon a Nydus Worm anywhere you can see (75/75). Send ground units into any Nydus structure (right-click it), then select a Nydus and Unload All to bring them out there.',
    energy: 0, cd: 1, target: 'ground', range: 0, casters: ['nydus_network'], minerals: 75, gas: 75, show: (b: any) => b.isConstructed
  },
  lair: {
    id: 'lair', name: 'Evolve to Lair', icon: '🥚', hotkey: 'L', desc: 'Evolve this Hatchery into a Lair (150/100, 57s). Needs a Spawning Pool. Unlocks Hydralisk Den, Spire, Infestation Pit, Nydus Network, Overseers and level 2 upgrades.',
    energy: 0, cd: 1, target: 'none', range: 0, casters: ['hatchery'], minerals: 150, gas: 100,
    show: (b: any) => b.isConstructed && b.tier === 0 && b.morphT <= 0
  },
  hive: {
    id: 'hive', name: 'Evolve to Hive', icon: '🐝', hotkey: 'H', desc: 'Evolve this Lair into a Hive (200/150, 71s). Needs an Infestation Pit. Unlocks Ultralisk Cavern, Greater Spire, Vipers and level 3 upgrades.',
    energy: 0, cd: 1, target: 'none', range: 0, casters: ['hatchery'], minerals: 200, gas: 150,
    show: (b: any) => b.isConstructed && b.tier === 1 && b.morphT <= 0
  },
  greater_spire: {
    id: 'greater_spire', name: 'Greater Spire', icon: '🏯', hotkey: 'G', desc: 'Evolve into a Greater Spire (71s, needs a Hive): unlocks Brood Lords.',
    energy: 0, cd: 1, target: 'none', range: 0, casters: ['spire'], minerals: 100, gas: 150,
    show: (b: any) => b.isConstructed && b.morphT <= 0
  },
  lift: {
    id: 'lift', name: 'Lift Off', icon: '🛫', hotkey: 'L', desc: 'Take off (production queue must be empty). Fly with right-click, then Land.',
    energy: 0, cd: 1, target: 'none', range: 0, casters: ['command_center', 'orbital_command', 'barracks', 'factory', 'starport'],
    show: (b: any) => b.liftState === 'grounded' && b.isConstructed && b.morphT <= 0
  },
  land: {
    id: 'land', name: 'Land', icon: '🛬', hotkey: 'L', desc: 'Land at the chosen location. Next to a free add-on spot it reconnects to a Tech Lab / Reactor there.',
    energy: 0, cd: 1, target: 'ground', range: 0, casters: ['command_center', 'orbital_command', 'barracks', 'factory', 'starport'],
    show: (b: any) => b.isAirborne
  },
  techlab: {
    id: 'techlab', name: 'Build Tech Lab', icon: '🔬', hotkey: 'T', desc: 'Attach a Tech Lab (18s). Unlocks Marauders, Siege Tanks, Thors and Banshees. Blocks production while building.',
    energy: 0, cd: 1, target: 'none', range: 0, casters: ['barracks', 'factory', 'starport'], minerals: 50, gas: 25,
    show: (b: any) => b.liftState === 'grounded' && b.isConstructed
  },
  reactor: {
    id: 'reactor', name: 'Build Reactor', icon: '⚛️', hotkey: 'R', desc: 'Attach a Reactor (36s). Produces two units at once. Blocks production while building.',
    energy: 0, cd: 1, target: 'none', range: 0, casters: ['barracks', 'factory', 'starport'], minerals: 50, gas: 50,
    show: (b: any) => b.liftState === 'grounded' && b.isConstructed
  },
  burrow: {
    id: 'burrow', name: 'Burrow', icon: '🕳️', hotkey: 'B', desc: 'Dig in: hidden from enemies without detection, cannot move or attack. Press again to emerge.',
    energy: 0, cd: 1, target: 'none', range: 0, casters: ['roach', 'zergling', 'hydralisk', 'lurker', 'widow_mine']
  },
  inject: {
    id: 'inject', name: 'Inject Larva', icon: '🥚', hotkey: 'E', desc: 'After 29s the target Hatchery spawns 3 extra Larva.',
    energy: 25, cd: 1, target: 'ally', range: 7, casters: ['queen']
  },
  transfuse: {
    id: 'transfuse', name: 'Transfuse', icon: '💚', hotkey: 'T', desc: 'Instantly restore 75 health to a friendly unit or structure.',
    energy: 50, cd: 1, target: 'ally', range: 7, casters: ['queen']
  },
  blink: {
    id: 'blink', name: 'Blink', icon: '✨', hotkey: 'B', desc: 'Teleport up to 8 tiles instantly.',
    energy: 0, cd: 7, target: 'ground', range: 8, casters: ['stalker']
  },
  chrono: {
    id: 'chrono', name: 'Chrono Boost', icon: '⏩', hotkey: 'C', desc: 'Speed up a friendly structure\'s production by 50% for 20s.',
    energy: 50, cd: 1, target: 'ally', range: 0, casters: ['nexus']
  },
  archon_merge: {
    id: 'archon_merge', name: 'Archon Warp', icon: '🔮', hotkey: 'T', desc: 'Select two High / Dark Templar and merge them into an Archon (12s).',
    energy: 0, cd: 0, target: 'none', range: 0, casters: ['high_templar', 'dark_templar'], show: (u: any) => !u.morph
  },
  feedback: {
    id: 'feedback', name: 'Feedback', icon: '⚡', hotkey: 'F', desc: 'Drain all energy from an enemy unit and deal 0.5 damage per energy drained.',
    energy: 50, cd: 1, target: 'ally', range: 10, casters: ['high_templar']
  },
  psionic_storm: {
    id: 'psionic_storm', name: 'Psionic Storm', icon: '🌩️', hotkey: 'T', desc: 'Lightning storm: 110 damage over 6s (patch 5.0.15 hotfix) to every unit in the area (friendly fire). Research at the Templar Archives.',
    energy: 75, cd: 1, target: 'ground', range: 8, casters: ['high_templar']
  },
  fungal: {
    id: 'fungal', name: 'Fungal Growth', icon: '🍄', hotkey: 'F', desc: '30 damage over 2.85s to enemy units in radius 2.25, rooting them in place.',
    energy: 75, cd: 1, target: 'ground', range: 10, casters: ['infestor']
  },
  guardian: {
    id: 'guardian', name: 'Guardian Shield', icon: '🛡️', hotkey: 'G', desc: 'Nearby allies take 2 less damage for 11s.',
    energy: 75, cd: 1, target: 'none', range: 0, casters: ['sentry']
  }
};

// Warp Gate warp-ins (one ability per Gateway unit; they share a cooldown on the gate)
export const WARP_COOLDOWN: Record<string, number> = { zealot: 20, sentry: 23, stalker: 23, adept: 20, high_templar: 32, dark_templar: 32 };
for (const [t, cd] of Object.entries(WARP_COOLDOWN)) {
  const c = (UNIT_CONFIGS as any)[t];
  ABILITIES['warp_' + t] = { id: 'warp_' + t, name: 'Warp In ' + c.name, icon: c.icon, hotkey: c.hotkey, desc: `Warp in a ${c.name} at a Pylon power field (${c.costMinerals}/${c.costGas}, ${cd}s gate cooldown).`, energy: 0, cd, target: 'ground', range: 0, casters: ['gateway'], minerals: c.costMinerals, gas: c.costGas, show: (b: any) => b.warpGate && b.isConstructed };
}

// Unit morphs are abilities too (one per UNIT_MORPHS entry, id `morph_<unit>`)
for (const m of UNIT_MORPHS) {
  ABILITIES['morph_' + m.to] = { id: 'morph_' + m.to, name: m.name, icon: m.icon, hotkey: m.hotkey, desc: m.desc, energy: 0, cd: 0, target: 'none', range: 0, casters: [m.from], minerals: m.minerals, gas: m.gas, show: (u: any) => !u.morph && !u.burrowed };
}

const isLarvaKindLocal = (t: string) => t === 'larva' || t === 'egg';

export function abilitiesOf(e: Entity): AbilityDef[] {
  return Object.values(ABILITIES).filter(a => a.casters.includes(e.type as string) && (!a.show || a.show(e)));
}

export interface CastTarget {
  pos?: Vector2D;
  entity?: Entity | null;
  nodeId?: string | null;
}

/** Why an ability can't be used right now (null = OK). */
export function abilityBlocked(world: any, caster: Entity, def: AbilityDef): string | null {
  if (caster.isDead) return 'Caster is dead';
  const unit = caster as Unit;
  if (def.id === 'burrow' && (caster as any).burrowTransition) return 'Already burrowing / unburrowing';
  if (def.id === 'burrow' && caster.burrowed) return null; // unburrow is free
  if (def.id === 'cloak' && caster.cloaked) return null;   // decloak is free
  if (def.id === 'psionic_storm' && !world.getUpgrades(caster.playerId).techs?.psionic_storm) return 'Research Psionic Storm at the Templar Archives first';
  if (def.id === 'archon_merge') {
    const mate = (world.selectedEntities as any[]).find(e => e !== caster && e.playerId === caster.playerId && ['high_templar', 'dark_templar'].includes(e.type) && !e.isDead && !e.morph);
    if (!mate && caster.playerId === 'player') return 'Select two High / Dark Templar to merge';
  }
  if (def.id === 'blink' && !world.getUpgrades(caster.playerId).techs?.blink_tech) return 'Research Blink at the Twilight Council first';
  const lo = (caster as any).loadoutAbilities as Set<string> | null | undefined;
  if (lo && ['snipe', 'pulse_grenade', 'dominate', 'cloak', 'nova_blink', 'flashbang', 'stim_infusion', 'holo_decoy', 'ionic_force_field', 'plasma_shot', 'fury_of_one'].includes(def.id) && !lo.has(def.id)) return `${def.name} is not equipped`;
  if (caster.abilityCd[def.id] > 0) return `${def.name} on cooldown (${Math.ceil(caster.abilityCd[def.id]!)}s)`;
  if (caster.energy < def.energy) return `Not enough energy (${Math.floor(caster.energy)}/${def.energy})`;
  if ('isConstructed' in caster && !(caster as Building).isConstructed) return 'Under construction';
  if ('isTransforming' in unit && unit.isTransforming) return 'Busy';
  if (def.id.startsWith('warp_')) {
    const t = def.id.slice(5);
    if (!(caster as Building).warpGate) return 'Research Warp Gate at the Cybernetics Core first';
    const lock = world.unitLockReason(caster.playerId, t);
    if (lock) return lock;
    const r = world.resources[caster.playerId];
    if (r.supply + (UNIT_CONFIGS as any)[t].supplyCost > r.maxSupply) return 'Additional supply required!';
  }
  if (def.id.startsWith('morph_')) {
    const m = UNIT_MORPHS.find(x => 'morph_' + x.to === def.id)!;
    if ((caster as Unit).morph) return 'Already morphing';
    if (!world.hasConstructed(caster.playerId, m.need)) return `Requires ${BUILDING_CONFIGS[m.need].name}`;
    const r = world.resources[caster.playerId];
    if (r.supply + Math.max(0, UNIT_CONFIGS[m.to].supplyCost - UNIT_CONFIGS[m.from].supplyCost) > r.maxSupply) return 'Not enough supply';
  }
  const b = caster as Building;
  if (def.minerals || def.gas) {
    const res = world.resources[caster.playerId];
    if (res.minerals < (def.minerals ?? 0)) return `Not enough minerals (${def.minerals})`;
    if (res.gas < (def.gas ?? 0)) return `Not enough Vespene gas (${def.gas})`;
  }
  if ('liftState' in caster) {
    // a structure morph already under way can't be bought again (it would pay twice and restart the timer)
    if (['orbital', 'planetary', 'lair', 'hive', 'greater_spire', 'techlab', 'reactor'].includes(def.id) && b.morphT > 0) return 'Already morphing';
    if (def.id === 'lift') {
      if (b.queue.length > 0) return 'Cancel production before lifting off';
      if (b.addonBuildingId) return 'An add-on is under construction';
    }
    if (def.id === 'greater_spire') {
      if (!world.hasConstructed(caster.playerId, 'hive')) return 'Requires Hive';
    }
    if (def.id === 'lair') {
      if (!world.hasConstructed(caster.playerId, 'spawning_pool')) return 'Requires Spawning Pool';
      if (b.queue.length > 0) return 'Cancel production first';
    }
    if (def.id === 'hive') {
      if (!world.hasConstructed(caster.playerId, 'infestation_pit')) return 'Requires Infestation Pit';
      if (b.queue.length > 0) return 'Cancel production first';
    }
    if (def.id === 'planetary') {
      if (!world.hasConstructed(caster.playerId, 'engineering_bay')) return 'Requires Engineering Bay';
      if (b.queue.length > 0) return 'Cancel production first';
    }
    if (def.id === 'orbital') {
      if (!world.hasConstructed(caster.playerId, 'barracks')) return 'Requires Barracks';
      if (b.queue.length > 0) return 'Cancel production first';
    }
    if ((def.id === 'techlab' || def.id === 'reactor')) {
      if (b.queue.length > 0) return 'Cancel production first';
      if (b.addon(world) || b.addonBuildingId) return 'Already has an add-on';
    }
  }
  return null;
}

/**
 * Executes an ability for `caster`. Returns null on success or a human readable failure reason.
 * Host / single-player only (abilities are not synced for online guests).
 */
export function castAbility(world: any, caster: Entity, id: string, target: CastTarget = {}): string | null {
  // online: the local player's casts go through the network and run on their scheduled tick (net/commands.ts)
  if (world.shouldRoute?.(caster)) { world.net.sendCast(caster.id, id, target); return null; }
  // Kills from ability damage are credited to the casting unit (delayed effects re-enter the scope below).
  return Entity.withSource(caster, () => castAbilityInner(world, caster, id, target));
}

function castAbilityInner(world: any, caster: Entity, id: string, target: CastTarget = {}): string | null {
  const def = ABILITIES[id];
  if (!def || !def.casters.includes(caster.type as string)) return 'Unknown ability';
  if (world.isNetGuest) return 'Abilities are host-only in online matches';
  const blocked = abilityBlocked(world, caster, def);
  if (blocked) return blocked;
  const pid: PlayerId = caster.playerId;
  const pos3 = caster.getPosition3D();

  if (id.startsWith('warp_')) {
    if (!target.pos) return 'Pick a location';
    const t = id.slice(5);
    const p = target.pos;
    const powered = world.buildings.some((b: Building) => b.playerId === pid && b.isConstructed && !b.isDead && (b.type === 'pylon' || b.type === 'nexus') && Math.hypot(b.pos.x - p.x, b.pos.y - p.y) <= 6.5);
    if (!powered) return 'Warp in within a Pylon power field';
    const spot = world.pathfinding.findNearestWalkable({ x: p.x, y: p.y }, 1.5);
    if (Math.hypot(spot.x - p.x, spot.y - p.y) > 1.5) return 'Cannot warp in there';
    const r = world.resources[pid]; r.minerals -= def.minerals!; r.gas -= def.gas!; r.supply += (UNIT_CONFIGS as any)[t].supplyCost;
    for (const k of Object.keys(WARP_COOLDOWN)) caster.abilityCd['warp_' + k] = WARP_COOLDOWN[t]!;
    world.particles.spawnMuzzleFlash({ x: spot.x, y: caster.height + 0.5, z: spot.y }, 0x7dd3fc, 2.2);
    world.later(5, () => { const u = world.spawnUnit(t, pid, spot); world.particles.spawnMuzzleFlash(u.getPosition3D(), 0xffffff, 1.6); });
    return null;
  }
  if (id.startsWith('morph_')) return world.startUnitMorph(caster as Unit, id.slice(6));

  switch (id) {
    case 'archon_merge': {
      const u = caster as Unit;
      // single player: the partner comes from the selection; online the selection is one computer's view, so both pick from all units
      const pool = caster.playerId === 'player' && !world.net ? (world.selectedEntities as any[]) : world.units;
      const mate = pool.find((e: any) => e !== caster && e.playerId === pid && ['high_templar', 'dark_templar'].includes(e.type) && !e.isDead && !e.morph
        && Math.hypot(e.pos.x - caster.pos.x, e.pos.y - caster.pos.y) < 40) as Unit | undefined;
      if (!mate) return 'Need a second templar';
      mate.silent = true; mate.isDead = true;               // the partner is absorbed (its 2 supply now belongs to the Archon)
      if (mate.isSelected) world.selectedEntities = world.selectedEntities.filter((e: any) => e !== mate);
      u.currentCommand = null; u.commandQueue = [];
      u.morph = { to: 'archon', t: 12, total: 12, minerals: 0, gas: 0, supply: 0 };
      u.pos.x = (u.pos.x + mate.pos.x) / 2; u.pos.y = (u.pos.y + mate.pos.y) / 2;
      world.particles.spawnMuzzleFlash(pos3, 0xc4b5fd, 2.0);
      return null;
    }
    case 'feedback': {
      const t = target.entity as any;
      if (!t || t.isDead || t.playerId === pid || 'isConstructed' in t) return 'Target an enemy unit';
      if (!(t.energy > 0) || !t.maxEnergy) return 'Target has no energy';
      if (Math.hypot(t.pos.x - caster.pos.x, t.pos.y - caster.pos.y) > def.range + 1) return 'Too far away';
      caster.energy -= def.energy;
      const dmg = t.energy * 0.5; t.energy = 0;
      t.takeDamage(dmg);
      world.particles.spawnMuzzleFlash(t.getPosition3D(), 0x38bdf8, 1.6);
      return null;
    }
    case 'psionic_storm': {
      if (!target.pos) return 'Pick a location';
      if (Math.hypot(target.pos.x - caster.pos.x, target.pos.y - caster.pos.y) > def.range + 1) return 'Too far away';
      caster.energy -= def.energy;
      const c = { x: target.pos.x, y: target.pos.y };
      for (let i = 0; i < 12; i++) world.later(0.1 + i * 0.5, () => Entity.withSource(caster, () => {
        world.particles.spawnMuzzleFlash({ x: c.x, y: caster.height + 1, z: c.y }, 0x60a5fa, 3.2);
        world.units.forEach((u: Unit) => { if (!u.isDead && !isLarvaKindLocal(u.type) && Math.hypot(u.pos.x - c.x, u.pos.y - c.y) <= 2) u.takeDamage(110 / 12); });
      }));
      return null;
    }
    case 'fungal': {
      if (!target.pos) return 'Pick a location';
      if (Math.hypot(target.pos.x - caster.pos.x, target.pos.y - caster.pos.y) > def.range + 1) return 'Too far away';
      caster.energy -= def.energy;
      const c = { x: target.pos.x, y: target.pos.y };
      const hit = (world.units as Unit[]).filter(u => !u.isDead && u.playerId !== pid && !isLarvaKindLocal(u.type) && Math.hypot(u.pos.x - c.x, u.pos.y - c.y) <= 2.25);
      world.particles.spawnMuzzleFlash({ x: c.x, y: caster.height + 0.5, z: c.y }, 0x84cc16, 3.4);
      for (const u of hit) { u.rootTimer = 2.85; }
      for (let i = 0; i < 6; i++) world.later(0.1 + i * 0.475, () => Entity.withSource(caster, () => {
        for (const u of hit) if (!u.isDead) u.takeDamage(30 / 6);
      }));
      return null;
    }
    case 'cloak': {
      caster.cloaked = !caster.cloaked;
      if (caster.cloaked) { caster.energy -= def.energy; if (pid === 'player') world.sound.at(caster.pos.x, caster.pos.y).playCloak(); }
      caster.abilityCd.cloak = 1;
      world.particles.spawnMuzzleFlash(pos3, 0x93c5fd, 0.8);
      return null;
    }
    case 'burrow': {
      const u = caster as Unit;
      if (u.type === 'widow_mine') { // Widow Mines take time: 2.14s to burrow (0.71s with Drilling Claws), 0.71s to unburrow (0.355s)
        const claws = !!world.getUpgrades(pid).techs?.drilling_claws;
        const to = !caster.burrowed;
        u.burrowTransition = { to, t: to ? (claws ? 0.71 : 2.14) : (claws ? 0.355 : 0.71) };
        if (to) { u.currentCommand = null; u.commandQueue = []; u.targetEntityId = null; world.mineBurrowAlert?.(u); }
        caster.abilityCd.burrow = 1;
        world.particles.spawnMuzzleFlash(pos3, 0x92400e, 0.6);
        return null;
      }
      caster.burrowed = !caster.burrowed;
      if (caster.burrowed) { u.currentCommand = null; u.commandQueue = []; u.targetEntityId = null; }
      caster.abilityCd.burrow = 1;
      world.particles.spawnMuzzleFlash(pos3, 0x92400e, 0.6);
      return null;
    }
    case 'orbital': {
      const b = caster as Building;
      const r = world.resources[pid]; r.minerals -= def.minerals!;
      b.morphT = b.morphTotal = 25; b.morphTo = 'orbital_command'; b.morphCost = { minerals: def.minerals!, gas: 0 };
      return null;
    }
    case 'planetary': {
      const b = caster as Building;
      const r = world.resources[pid]; r.minerals -= def.minerals!; r.gas -= def.gas!;
      b.morphT = b.morphTotal = 36; b.morphTo = 'planetary_fortress'; b.morphCost = { minerals: def.minerals!, gas: def.gas! };
      return null;
    }
    case 'auto_turret': {
      if (!target.pos) return 'Pick a location';
      if (Math.hypot(target.pos.x - caster.pos.x, target.pos.y - caster.pos.y) > def.range + 1) return 'Too far away';
      caster.energy -= def.energy;
      const tur = world.spawnUnit('auto_turret', pid, { x: target.pos.x, y: target.pos.y });
      tur.lifespan = 10;
      world.particles.spawnMuzzleFlash(tur.getPosition3D(), 0x93c5fd, 1.2);
      return null;
    }
    case 'creep_tumor':
    case 'spread_tumor': {
      if (!target.pos) return 'Pick a location';
      if (Math.hypot(target.pos.x - caster.pos.x, target.pos.y - caster.pos.y) > def.range + 1) return 'Too far away';
      if (!world.creep?.hasCreep(target.pos.x, target.pos.y)) return 'Must be placed on creep';
      const spot = world.resolvePlacement('creep_tumor', target.pos);
      if (!spot.ok) return spot.msg || 'Cannot place a tumor there';
      if (id === 'creep_tumor') caster.energy -= def.energy; else (caster as any).tumorSpent = true;
      const tum = world.spawnBuilding('creep_tumor', pid, spot.pos, false);
      tum.burrowed = true;
      world.particles.spawnMuzzleFlash(tum.getPosition3D(), 0xc084fc, 1.0);
      return null;
    }
    case 'nydus_worm': {
      if (!target.pos) return 'Pick a location';
      if (world.fogLimitsTargeting(pid) && !world.fog.isVisible(target.pos.x, target.pos.y)) return 'Need vision of the target location';
      const spot = world.resolvePlacement('nydus_worm', target.pos);
      if (!spot.ok) return spot.msg || 'Cannot summon a Nydus Worm there';
      const r = world.resources[pid]; r.minerals -= def.minerals!; r.gas -= def.gas!;
      world.spawnBuilding('nydus_worm', pid, spot.pos, false);
      return null;
    }
    case 'lair': case 'hive': {
      const b = caster as Building;
      const r = world.resources[pid]; r.minerals -= def.minerals!; r.gas -= def.gas!;
      b.morphT = b.morphTotal = def.id === 'lair' ? 57 : 71; b.morphTo = def.id as any; b.morphCost = { minerals: def.minerals!, gas: def.gas! };
      return null;
    }
    case 'greater_spire': {
      const b = caster as Building;
      const r = world.resources[pid]; r.minerals -= def.minerals!; r.gas -= def.gas!;
      b.morphT = b.morphTotal = 71; b.morphTo = 'greater_spire'; b.morphCost = { minerals: def.minerals!, gas: def.gas! };
      return null;
    }
    case 'lift': {
      (caster as Building).liftOff(world);
      return null;
    }
    case 'land': {
      const b = caster as Building;
      if (!target.pos) return 'Pick a location';
      const spot = world.resolvePlacement(b.type, target.pos);
      if (!spot.ok) return spot.msg || 'Cannot land there';
      b.flyTo(spot.pos, true);
      return null;
    }
    case 'techlab':
    case 'reactor': {
      const b = caster as Building;
      const { x: ax, y: ay } = Building.addonSpot(b.pos);
      if (!world.pathfinding.isAreaWalkable(ax - 1, ay - 1, 2, 2)) {
        // say what is in the way and flash the add-on footprint in red so the player can see which cell is blocked
        let why = 'terrain';
        outer: for (const cx of [ax - 0.5, ax + 0.5]) for (const cy of [ay - 0.5, ay + 0.5]) {
          if (world.pathfinding.isWalkable(cx, cy)) continue;
          const bld = world.buildings.find((o: Building) => o !== b && !o.isDead && Math.abs(o.pos.x - cx) <= o.width / 2 && Math.abs(o.pos.y - cy) <= o.heightTiles / 2);
          if (bld) why = BUILDING_CONFIGS[(bld as Building).type].name;
          else if (world.resourceNodes.some((r: any) => Math.hypot(r.pos.x - cx, r.pos.y - cy) < 1.6)) why = 'a resource node';
          break outer;
        }
        world.decals.setPlacementGhost({ x: ax, y: ay }, 2, 2, false, 0);
        setTimeout(() => world.decals.clearPlacementGhost(), 1800);
        return `No room for an add-on here (blocked by ${why})`;
      }
      const r = world.resources[pid]; r.minerals -= def.minerals!; r.gas -= def.gas!;
      const ad = world.spawnBuilding(id, pid, { x: ax, y: ay }, false);
      b.addonBuildingId = ad.id;
      return null;
    }
    case 'snipe': {
      const t = target.entity as any;
      if (!t || t.isDead || t.playerId === pid || 'isConstructed' in t) return 'Target an enemy unit';
      caster.energy -= def.energy;
      world.particles.spawnMuzzleFlash(pos3, 0xfef08a, 1.0);
      world.sound.at(caster.pos.x, caster.pos.y).playGhostSnipe();
      world.later(0.3, () => Entity.withSource(caster, () => { if (!t.isDead) { t.takeDamage(125); world.particles.spawnMuzzleFlash(t.getPosition3D(), 0xff5533, 1.6); } }));
      return null;
    }
    case 'emp_round': {
      if (!target.pos) return 'Pick a location';
      if (Math.hypot(target.pos.x - caster.pos.x, target.pos.y - caster.pos.y) > def.range + 1) return 'Too far away';
      caster.energy -= def.energy;
      const c = { x: target.pos.x, y: target.pos.y };
      world.particles.spawnMuzzleFlash({ x: c.x, y: caster.height + 1, z: c.y }, 0x60a5fa, 3.0);
      const hit = (e: any) => {
        if (e.isDead || Math.hypot(e.pos.x - c.x, e.pos.y - c.y) > 1.5) return;
        if (e.shield > 0) e.shield = Math.max(0, e.shield - 100);
        if (e.energy > 0) e.energy = Math.max(0, e.energy - 100);
        if (e.cloaked) e.revealTimer = 5;   // (?) reveal duration not in the sources
      };
      world.units.forEach(hit); world.buildings.forEach(hit);
      return null;
    }
    case 'steady_targeting': {
      const t = target.entity as any;
      if (!t || t.isDead || t.playerId === pid || 'isConstructed' in t) return 'Target an enemy unit';
      if (!t.attrs?.includes('biological')) return 'Target must be biological';
      if (Math.hypot(t.pos.x - caster.pos.x, t.pos.y - caster.pos.y) > def.range + 1) return 'Too far away';
      caster.energy -= def.energy;
      caster.sinceDamaged = 0;
      world.particles.spawnMuzzleFlash(pos3, 0xfef08a, 1.0);
      world.later(1.43, () => Entity.withSource(caster, () => {
        const interrupted = caster.isDead || t.isDead || caster.sinceDamaged < 1.3
          || Math.hypot(t.pos.x - caster.pos.x, t.pos.y - caster.pos.y) > 14;
        if (interrupted) { if (!caster.isDead) caster.energy = Math.min(caster.maxEnergy ?? caster.energy + def.energy, caster.energy + def.energy); return; }
        world.sound.at(caster.pos.x, caster.pos.y).playGhostSnipe();
        t.takeDamage(130 + (t.attrs.includes('psionic') ? 40 : 0), undefined, false, true); // ignores armor
        world.particles.spawnMuzzleFlash(t.getPosition3D(), 0xff5533, 1.6);
      }));
      return null;
    }
    case 'flashbang': {
      if (!target.pos) return 'Pick a location'; caster.energy -= def.energy;
      world.particles.spawnMuzzleFlash({ x: target.pos.x, y: caster.height + 1, z: target.pos.y }, 0xffffff, 3.2);
      world.units.forEach((u: Unit) => { if (!u.isDead && u.playerId !== pid && Math.hypot(u.pos.x - target.pos!.x, u.pos.y - target.pos!.y) <= 3.5) { u.isSlowed = true; u.slowTimer = 5; } });
      return null;
    }
    case 'stim_infusion': { caster.energy -= def.energy; (caster as Unit).speed *= 1.5; (caster as any).attackSpeed *= 1.5; caster.health = Math.min(caster.maxHealth, caster.health + 200);
      world.later(10, () => { (caster as Unit).speed /= 1.5; (caster as any).attackSpeed /= 1.5; }); world.particles.spawnMuzzleFlash(pos3, 0xfca5a5, 1.2); return null; }
    case 'ionic_force_field': { caster.energy -= def.energy; caster.shield = (caster.shield ?? 0) + 500; caster.maxShield = Math.max(caster.maxShield ?? 0, caster.shield);
      world.later(10, () => { caster.shield = Math.max(0, (caster.shield ?? 0) - 500); }); world.particles.spawnMuzzleFlash(pos3, 0x7dd3fc, 1.6); return null; }
    case 'holo_decoy': { if (!target.pos) return 'Pick a location'; caster.energy -= def.energy; const d = world.spawnUnit('nova', pid, { x: target.pos.x, y: target.pos.y }); d.maxHealth = d.health = 150; d.lifespan = 45; (d as any).noCloak = true; return null; }
    case 'nova_blink': { if (!target.pos) return 'Pick a location'; caster.pos.x = target.pos.x; caster.pos.y = target.pos.y; world.particles.spawnMuzzleFlash(pos3, 0xc4b5fd, 1.4); return null; }
    case 'plasma_shot': {
      if (!target.pos) return 'Pick a location'; caster.energy -= def.energy; world.particles.spawnMuzzleFlash({ x: target.pos.x, y: caster.height + 1, z: target.pos.y }, 0xfb7185, 2.4);
      world.units.forEach((u: Unit) => { if (!u.isDead && u.playerId !== pid && Math.hypot(u.pos.x - target.pos!.x, u.pos.y - target.pos!.y) <= 2.2) { u.takeDamage(100); u.isSlowed = true; u.slowTimer = 4; } }); return null;
    }
    case 'fury_of_one': {
      if (!target.pos) return 'Pick a location'; caster.energy -= def.energy; const foes = world.units.filter((u: Unit) => !u.isDead && u.playerId !== pid && Math.hypot(u.pos.x - target.pos!.x, u.pos.y - target.pos!.y) <= 5);
      if (!foes.length) return 'No targets'; for (let i = 0; i < 11; i++) { const f = foes[i % foes.length]!; if (!f.isDead) f.takeDamage(45); } world.particles.spawnMuzzleFlash(pos3, 0xfacc15, 2.2); return null;
    }
    case 'artifact_nova': {
      const rt = world.mission; if (!rt || (rt.state.charge ?? 0) < 12.5) return 'The Artifact is still charging (needs 12.5%).';
      rt.state.loss = (rt.state.loss ?? 0) + 12.5; rt.state.used = (rt.state.used ?? 0) + 1;
      world.particles.spawnMuzzleFlash(pos3, 0xffe27a, 14);
      for (const u of world.units as Unit[]) if (!u.isDead && u.playerId !== pid && Math.hypot(u.pos.x - caster.pos.x, u.pos.y - caster.pos.y) < 48) u.takeDamage(u.maxHealth > 1100 ? 1000 : 99999);
      return null;
    }
    case 'dominate': {
      const t = target.entity as any;
      if (!t || t.isDead || t.playerId === pid || 'isConstructed' in t || (t.type === 'nova')) return 'Target an enemy unit';
      caster.energy -= def.energy; t.playerId = pid; t.currentCommand = null; t.targetEntityId = null;
      world.particles.spawnMuzzleFlash(t.getPosition3D(), 0xc084fc, 2.0);
      return null;
    }
    case 'pulse_grenade': {
      if (!target.pos) return 'Pick a location';
      caster.energy -= def.energy;
      world.particles.spawnMuzzleFlash({ x: target.pos.x, y: caster.height + 1, z: target.pos.y }, 0xa78bfa, 3.0);
      world.units.forEach((u: Unit) => { if (!u.isDead && u.playerId !== pid && !u.isFlying && Math.hypot(u.pos.x - target.pos!.x, u.pos.y - target.pos!.y) <= 2.5) u.takeDamage(100); });
      return null;
    }
    case 'nuke': {
      if (!target.pos) return 'Pick a location';
      const p = { x: target.pos.x, y: target.pos.y };
      // Liquipedia: multiplayer Ghost = 14 s / 300 (+200 structures) / range 12; campaign Nova = 5 s / 750 (+200) / range 10.
      const nova = caster.type === 'nova';
      const delay = nova ? 5 : 14, unitDmg = nova ? 750 : 300, structBonus = 200, castRange = nova ? 10 : 12;
      if (Math.hypot(p.x - caster.pos.x, p.y - caster.pos.y) > castRange + 1) return 'Too far away';
      // Full damage in the inner ring, 50% in the next, 25% out to the outer edge (ring radii 4/6/8)
      const tier = (d: number) => (d <= 4 ? 1 : d <= 6 ? 0.5 : d <= 8 ? 0.25 : 0);
      world.scans.push({ x: p.x, y: p.y, r: 8, t: delay, owner: pid });
      world.sound.playAdjutant?.('nuke', 'Nuclear launch detected.');
      world.later(delay, () => Entity.withSource(caster, () => {
        world.particles.spawnMuzzleFlash({ x: p.x, y: 1, z: p.y }, 0xfff1a8, 9);
        // Nuke damage ignores armor and hits friend and foe equally
        world.units.forEach((u: Unit) => { const f = tier(Math.hypot(u.pos.x - p.x, u.pos.y - p.y)); if (!u.isDead && f > 0) u.takeDamage(unitDmg * f, undefined, false, true); });
        world.buildings.forEach((b: any) => { const f = tier(Math.hypot(b.pos.x - p.x, b.pos.y - p.y)); if (!b.isDead && f > 0) b.takeDamage((unitDmg + structBonus) * f, undefined, false, true); });
      }));
      return null;
    }
    case 'scan': {
      if (!target.pos) return 'Pick a location';
      caster.energy -= def.energy;
      world.scans.push({ x: target.pos.x, y: target.pos.y, r: 13, t: 12.3, owner: pid });
      world.particles.spawnMuzzleFlash({ x: target.pos.x, y: caster.height + 1, z: target.pos.y }, 0x7dd3fc, 3.2);
      if (pid === 'player') world.sound.playAdjutant?.('scan', 'Scanner sweep.');
      return null;
    }
    case 'mule': {
      const node = target.nodeId ? world.findResourceNode(target.nodeId) : null;
      if (!node || node.type !== 'minerals') return 'Target a mineral patch';
      caster.energy -= def.energy;
      const mule = world.spawnUnit('mule', pid, { x: node.pos.x + 1.2, y: node.pos.y + 1.2 });
      mule.lifespan = 64;
      mule.setCommand({ type: 'gather', targetEntityId: node.id });
      world.particles.spawnMuzzleFlash(mule.getPosition3D(), 0xfbbf24, 1.2);
      return null;
    }
    case 'inject': {
      const t = target.entity as Building | null | undefined;
      if (!t || !('larva' in t) || t.playerId !== pid || t.type !== 'hatchery' || !t.isConstructed) return 'Target one of your Hatcheries';
      if (Math.hypot(t.pos.x - caster.pos.x, t.pos.y - caster.pos.y) > def.range + t.radius) return 'Too far away';
      caster.energy -= def.energy;
      t.injects.push(29);
      world.particles.spawnHealBeam(pos3, t.getPosition3D());
      return null;
    }
    case 'transfuse': {
      const t = target.entity;
      if (!t || t === caster || t.playerId !== pid || t.isDead) return 'Target a friendly unit or structure';
      if (Math.hypot(t.pos.x - caster.pos.x, t.pos.y - caster.pos.y) > def.range + t.radius) return 'Too far away';
      if (t.health >= t.maxHealth) return 'Target is at full health';
      caster.energy -= def.energy;
      t.heal(75);
      world.particles.spawnHealBeam(pos3, t.getPosition3D());
      world.sound.playHealBeam?.();
      return null;
    }
    case 'blink': {
      if (!target.pos) return 'Pick a location';
      const dx = target.pos.x - caster.pos.x, dy = target.pos.y - caster.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, def.range / d);
      let dest = { x: caster.pos.x + dx * k, y: caster.pos.y + dy * k };
      if (!world.pathfinding.isWalkable(dest.x, dest.y)) dest = world.pathfinding.findNearestWalkable(dest, 3);
      world.particles.spawnMuzzleFlash(pos3, 0x67e8f9, 1.1);
      caster.pos.x = dest.x; caster.pos.y = dest.y;
      const u = caster as Unit;
      u.currentCommand = null;
      caster.abilityCd.blink = def.cd;
      world.particles.spawnMuzzleFlash({ x: dest.x, y: caster.height + 0.8, z: dest.y }, 0x67e8f9, 1.1);
      return null;
    }
    case 'chrono': {
      const t = target.entity as Building | null | undefined;
      if (!t || !('queue' in t) || t.playerId !== pid) return 'Target one of your structures';
      caster.energy -= def.energy;
      t.chronoTimer = 20;
      world.particles.spawnStimAura?.(t.getPosition3D());
      return null;
    }
    case 'guardian': {
      caster.energy -= def.energy;
      world.units.forEach((u: Unit) => {
        if (u.playerId === pid && Math.hypot(u.pos.x - caster.pos.x, u.pos.y - caster.pos.y) <= 4.5) u.guardianTimer = 11;
      });
      world.particles.spawnMuzzleFlash(pos3, 0x38bdf8, 2.4);
      return null;
    }
  }
  return 'Not implemented';
}

// ---------------------------------------------------------------------------
// Detection / stealth
// ---------------------------------------------------------------------------

const DETECTOR_BUILDINGS: Record<string, number> = { missile_turret: 11, photon_cannon: 11, spore_crawler: 11, spine_crawler: 0 };

const DETECTOR_UNITS: Record<string, number> = { overseer: 11, raven: 11, observer: 11 };

/** True when `e` is cloaked/burrowed and `observer` has no detector covering it. */
export function isHiddenFrom(world: any, e: Entity, observer: PlayerId): boolean {
  if (!e.cloaked && !e.burrowed) return false;
  if (e.playerId === observer) return false;
  // A burrowed Widow Mine is revealed while Sentinel Missile reloads, unless its owner has Drilling Claws
  if (e.burrowed && !e.cloaked && (e as any).type === 'widow_mine' && (e as any).attackCooldown > 0 && !world.getUpgrades(e.playerId).techs?.drilling_claws) return false;
  if ((e as any).revealTimer > 0 && !e.burrowed) return false;   // EMP-revealed (burrowed units stay hidden)
  for (const s of world.scans) {
    if (s.owner === observer && Math.hypot(s.x - e.pos.x, s.y - e.pos.y) <= s.r) return false;
  }
  for (const u of world.units) {
    const dr = DETECTOR_UNITS[u.type];
    if (dr && u.playerId === observer && !u.isDead && !u.morph && Math.hypot(u.pos.x - e.pos.x, u.pos.y - e.pos.y) <= dr) return false;
  }
  for (const b of world.buildings) {
    if (b.playerId !== observer || !b.isConstructed) continue;
    const r = DETECTOR_BUILDINGS[b.type];
    if (r && Math.hypot(b.pos.x - e.pos.x, b.pos.y - e.pos.y) <= r) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Upgrade classes (infantry / vehicle / ship) - SC2 splits attack & armor upgrades by class
// ---------------------------------------------------------------------------

export type UpgradeClass = 'infantry' | 'vehicle' | 'ship';
const VEHICLES = new Set(['siege_tank', 'siege_tank_sieged', 'thor', 'thor_ap', 'goliath', 'hellion', 'scv', 'mule', 'roach', 'archon']);

export function upgradeClassOf(type: string, isFlying: boolean): UpgradeClass {
  if (isFlying || type === 'viking_assault') return 'ship'; // SC2: the Viking always uses Ship Weapons / Plating, even landed
  if (type === 'siege_tank' || type === 'siege_tank_sieged' || type === 'thor' || type === 'thor_ap' || type === 'goliath' || type === 'hellion') return 'vehicle';
  return 'infantry';
}
void VEHICLES;

const ZERG_MELEE = new Set(['zergling', 'baneling', 'ultralisk']);
export function weaponLevelFor(u: PlayerUpgrades, cls: UpgradeClass, type?: string): number {
  if (cls === 'infantry' && type && (UNIT_CONFIGS as any)[type]?.race === 'zerg') return (ZERG_MELEE.has(type) ? u.meleeLevel : u.missileLevel) ?? 0;
  return cls === 'vehicle' ? u.vehicleWeaponsLevel : cls === 'ship' ? u.shipWeaponsLevel : u.weaponsLevel;
}
export function armorLevelFor(u: PlayerUpgrades, cls: UpgradeClass): number {
  return cls === 'vehicle' ? u.vehicleArmorLevel : cls === 'ship' ? u.shipArmorLevel : u.armorLevel;
}

export function isCaster(type: string): boolean {
  return Object.values(ABILITIES).some(a => a.casters.includes(type));
}

/** Larva rules (Zerg production is gated by larva; Queens inject more). */
export const LARVA_MAX = 3;
export const LARVA_REGEN = 11; // seconds per larva while below the cap
export function usesLarva(unitType: string): boolean {
  return ['drone', 'zergling', 'roach', 'hydralisk', 'mutalisk', 'corruptor', 'ultralisk', 'viper', 'overlord', 'swarm_host', 'infestor'].includes(unitType);
}

export function isTownHall(b: Building): boolean { return isTownHallType(b.type); }

/** Attack alert for `local` when an enemy Widow Mine starts burrowing with their units or structures in its range (already-burrowed mines never alert). */
export function mineBurrowAlertFor(world: any, mine: Entity, local: PlayerId) {
  if (mine.playerId === local) return;
  const r = (mine as Unit).attackRange;
  const near = (e: Entity) => !e.isDead && Math.hypot(e.pos.x - mine.pos.x, e.pos.y - mine.pos.y) <= r;
  if (world.units.some((u: Unit) => u.playerId === local && u.type !== 'mule' && near(u)) || world.buildings.some((b: Building) => b.playerId === local && near(b)))
    world.sound.playAdjutant('army_attack', 'Our forces are under attack.');
}
