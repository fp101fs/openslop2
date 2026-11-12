/**
 * Computer opponent build plans: what each race builds, in what order, and what army it aims for.
 *
 * Tech level (1-3) is how deep into the tree a unit / structure sits. A difficulty uses tech up to `techCap(tier)`:
 *   Recruit (easy) -> level 1, Normal -> level 2, Hard and above -> level 3 (the full multiplayer roster).
 * Harder AIs also reach each step sooner (`paceOf`), run more production structures and gas, and saturate more workers.
 */
import type { BuildingType, UnitType } from '../types';

export type Race = 'terran' | 'zerg' | 'protoss';
export type Tag = 'aa' | 'armor' | 'light' | 'splash' | 'detector' | 'support' | 'caster';

/** Highest tech level a difficulty tier (0 = Recruit ... 5 = Cheater) builds. */
export const techCap = (tier: number): 1 | 2 | 3 => (tier <= 0 ? 1 : tier === 1 ? 2 : 3);
/** Multiplier on every step's base time: Recruit takes its time, Cheater rushes the tree. */
export const paceOf = (tier: number): number => [1.9, 1.35, 1, 0.9, 0.82, 0.72][Math.max(0, Math.min(5, tier))]!;
/** Worker target ceiling per tier. */
export const workerCap = (tier: number): number => [18, 30, 44, 54, 62, 70][Math.max(0, Math.min(5, tier))]!;

/**
 * How a unit comes into being:
 *  queue  - trained in a production structure's queue (Barracks, Robotics Facility, Hatchery for Queens, Nexus...)
 *  larva  - morphed from a Hatchery's larva
 *  morph  - morphed in place from another unit (`from`)
 *  warp   - Gateway unit: trained in the queue, warped in at a Pylon once Warp Gate is researched
 *  merge  - Archon: two High / Dark Templar merge
 */
export type Via = 'queue' | 'larva' | 'morph' | 'warp' | 'merge';

export interface UnitPlan {
  unit: UnitType;
  level: 1 | 2 | 3;
  via: Via;
  /** Share of the army by unit count (production picks the unit furthest below its share). */
  weight: number;
  /** Maximum alive at once (support / capital units); scaled up 50% at Elite+. */
  cap?: number;
  tags?: Tag[];
  /** For morphs: the unit it morphs from. */
  from?: UnitType;
}

export interface TechStep {
  /** A structure, or a structure morph: orbital / planetary / lair / hive / greater_spire. */
  b: BuildingType | 'orbital' | 'lair' | 'hive' | 'greater_spire';
  level: 1 | 2 | 3;
  /** How many to own (default 1); `perBase` = that many per town hall. */
  n?: number;
  perBase?: boolean;
  /** Earliest game second at Hard pace (scaled by paceOf). */
  at: number;
  /** Lowest difficulty tier that takes this step (extra production structures, static defense). */
  minTier?: number;
}

// --------------------------------------------------------------------------------------------- Terran
export const TERRAN_UNITS: UnitPlan[] = [
  { unit: 'marine', level: 1, via: 'queue', weight: 6, tags: ['aa', 'light'] },
  { unit: 'marauder', level: 1, via: 'queue', weight: 3, tags: ['armor'] },
  { unit: 'reaper', level: 1, via: 'queue', weight: 1, cap: 2, tags: ['light'] },
  { unit: 'hellion', level: 1, via: 'queue', weight: 2, cap: 6, tags: ['light', 'splash'] },
  { unit: 'widow_mine', level: 1, via: 'queue', weight: 1, cap: 4, tags: ['aa', 'splash'] },
  { unit: 'siege_tank', level: 2, via: 'queue', weight: 2, cap: 6, tags: ['armor', 'splash'] },
  { unit: 'cyclone', level: 2, via: 'queue', weight: 1, cap: 4, tags: ['aa', 'armor'] },
  { unit: 'hellbat', level: 2, via: 'queue', weight: 1, cap: 4, tags: ['light', 'splash'] },
  { unit: 'viking', level: 2, via: 'queue', weight: 1, cap: 8, tags: ['aa'] },
  { unit: 'medivac', level: 2, via: 'queue', weight: 1, cap: 4, tags: ['support'] },
  { unit: 'liberator', level: 2, via: 'queue', weight: 1, cap: 4, tags: ['aa', 'splash'] },
  { unit: 'banshee', level: 2, via: 'queue', weight: 1.5, cap: 3 },
  { unit: 'raven', level: 2, via: 'queue', weight: 0.5, cap: 1, tags: ['detector', 'support'] },
  { unit: 'thor', level: 3, via: 'queue', weight: 1, cap: 4, tags: ['aa', 'armor'] },
  { unit: 'ghost', level: 3, via: 'queue', weight: 1, cap: 4, tags: ['caster'] },
  { unit: 'battlecruiser', level: 3, via: 'queue', weight: 1, cap: 3, tags: ['aa', 'armor'] },
];

export const TERRAN_TECH: TechStep[] = [
  { b: 'barracks', level: 1, at: 35 },
  { b: 'orbital', level: 1, at: 80 },
  { b: 'factory', level: 1, at: 110 },
  { b: 'barracks', level: 1, n: 2, at: 150, minTier: 1 },
  { b: 'starport', level: 2, at: 170 },
  { b: 'engineering_bay', level: 1, at: 190 },
  { b: 'bunker', level: 1, n: 1, perBase: true, at: 200, minTier: 1 },
  { b: 'missile_turret', level: 1, n: 1, perBase: true, at: 240 },
  { b: 'armory', level: 2, at: 260 },
  { b: 'sensor_tower', level: 2, at: 330 },
  { b: 'starport', level: 2, n: 2, at: 340, minTier: 2 },
  { b: 'ghost_academy', level: 3, at: 360 },
  { b: 'barracks', level: 1, n: 3, at: 380, minTier: 3 },
  { b: 'fusion_core', level: 3, at: 400 },
  { b: 'factory', level: 2, n: 2, at: 440, minTier: 3 },
];

/** Add-on for the k-th Barracks / Factory / Starport (0-based): units that need a Tech Lab get one first. */
export function terranAddonFor(type: string, k: number): 'techlab' | 'reactor' {
  if (type === 'factory') return k === 0 ? 'techlab' : 'reactor';
  return k % 2 === 0 ? 'techlab' : 'reactor';
}

// --------------------------------------------------------------------------------------------- Zerg
export const ZERG_UNITS: UnitPlan[] = [
  { unit: 'zergling', level: 1, via: 'larva', weight: 6, tags: ['light'] },
  { unit: 'roach', level: 1, via: 'larva', weight: 4, tags: ['armor'] },
  { unit: 'baneling', level: 1, via: 'morph', from: 'zergling', weight: 2, cap: 8, tags: ['splash'] },
  { unit: 'ravager', level: 1, via: 'morph', from: 'roach', weight: 1, cap: 4, tags: ['armor'] },
  { unit: 'hydralisk', level: 2, via: 'larva', weight: 4, tags: ['aa'] },
  { unit: 'mutalisk', level: 2, via: 'larva', weight: 2, cap: 8, tags: ['aa', 'light'] },
  { unit: 'corruptor', level: 2, via: 'larva', weight: 1, cap: 6, tags: ['aa'] },
  { unit: 'lurker', level: 2, via: 'morph', from: 'hydralisk', weight: 1, cap: 4, tags: ['splash'] },
  { unit: 'overseer', level: 2, via: 'morph', from: 'overlord', weight: 0.5, cap: 1, tags: ['detector'] },
  { unit: 'infestor', level: 2, via: 'larva', weight: 0.7, cap: 2, tags: ['caster'] },
  { unit: 'swarm_host', level: 2, via: 'larva', weight: 0.7, cap: 3 },
  { unit: 'ultralisk', level: 3, via: 'larva', weight: 1, cap: 4, tags: ['armor'] },
  { unit: 'broodlord', level: 3, via: 'morph', from: 'corruptor', weight: 1, cap: 4, tags: ['armor'] },
  { unit: 'viper', level: 3, via: 'larva', weight: 0.5, cap: 2, tags: ['support'] },
];

export const ZERG_TECH: TechStep[] = [
  { b: 'spawning_pool', level: 1, at: 45 },
  { b: 'roach_warren', level: 1, at: 110 },
  { b: 'lair', level: 1, at: 130 },
  { b: 'baneling_nest', level: 1, at: 150 },
  { b: 'evolution_chamber', level: 1, at: 190 },
  { b: 'spore_crawler', level: 1, n: 1, perBase: true, at: 220 },
  { b: 'hydralisk_den', level: 2, at: 200 },
  { b: 'spine_crawler', level: 1, n: 1, perBase: true, at: 240, minTier: 1 },
  { b: 'spire', level: 2, at: 250 },
  { b: 'infestation_pit', level: 2, at: 280 },
  { b: 'lurker_den', level: 2, at: 300 },
  { b: 'nydus_network', level: 2, at: 380, minTier: 2 },
  { b: 'hive', level: 3, at: 340 },
  { b: 'ultralisk_cavern', level: 3, at: 420 },
  { b: 'greater_spire', level: 3, at: 450 },
];

// --------------------------------------------------------------------------------------------- Protoss
export const PROTOSS_UNITS: UnitPlan[] = [
  { unit: 'zealot', level: 1, via: 'warp', weight: 4, tags: ['light'] },
  { unit: 'stalker', level: 1, via: 'warp', weight: 4, tags: ['aa', 'armor'] },
  { unit: 'adept', level: 1, via: 'warp', weight: 2, cap: 6, tags: ['light'] },
  { unit: 'sentry', level: 1, via: 'warp', weight: 1, cap: 2, tags: ['support'] },
  { unit: 'immortal', level: 2, via: 'queue', weight: 2, cap: 5, tags: ['armor'] },
  { unit: 'observer', level: 2, via: 'queue', weight: 0.5, cap: 1, tags: ['detector'] },
  { unit: 'warp_prism', level: 2, via: 'queue', weight: 0.3, cap: 1, tags: ['support'] },
  { unit: 'void_ray', level: 2, via: 'queue', weight: 2, cap: 6, tags: ['aa', 'armor'] },
  { unit: 'phoenix', level: 2, via: 'queue', weight: 1, cap: 4, tags: ['aa', 'light'] },
  { unit: 'oracle', level: 2, via: 'queue', weight: 0.5, cap: 1, tags: ['light'] },
  { unit: 'high_templar', level: 2, via: 'warp', weight: 1, cap: 3, tags: ['caster', 'splash'] },
  { unit: 'dark_templar', level: 2, via: 'warp', weight: 1, cap: 3 },
  { unit: 'archon', level: 2, via: 'merge', weight: 1, cap: 4, tags: ['aa', 'splash'] },
  { unit: 'colossus', level: 3, via: 'queue', weight: 1, cap: 4, tags: ['splash', 'light'] },
  { unit: 'disruptor', level: 3, via: 'queue', weight: 0.7, cap: 2, tags: ['splash'] },
  { unit: 'carrier', level: 3, via: 'queue', weight: 1, cap: 4, tags: ['aa', 'armor'] },
  { unit: 'tempest', level: 3, via: 'queue', weight: 0.7, cap: 2, tags: ['aa', 'armor'] },
  { unit: 'mothership', level: 3, via: 'queue', weight: 1, cap: 1, tags: ['support'] },
];

export const PROTOSS_TECH: TechStep[] = [
  { b: 'gateway', level: 1, at: 35 },
  { b: 'cybernetics_core', level: 1, at: 80 },
  { b: 'gateway', level: 1, n: 2, at: 140, minTier: 1 },
  { b: 'robotics_facility', level: 2, at: 160 },
  { b: 'forge', level: 1, at: 180 },
  { b: 'twilight_council', level: 2, at: 200 },
  { b: 'shield_battery', level: 1, n: 1, perBase: true, at: 200 },
  { b: 'photon_cannon', level: 1, n: 1, perBase: true, at: 230 },
  { b: 'stargate', level: 2, at: 230 },
  { b: 'templar_archives', level: 2, at: 290 },
  { b: 'dark_shrine', level: 2, at: 310 },
  { b: 'gateway', level: 1, n: 3, at: 300, minTier: 2 },
  { b: 'robotics_bay', level: 3, at: 330 },
  { b: 'fleet_beacon', level: 3, at: 370 },
  { b: 'gateway', level: 1, n: 4, at: 420, minTier: 3 },
  { b: 'stargate', level: 2, n: 2, at: 450, minTier: 3 },
];

export const UNIT_PLANS: Record<Race, UnitPlan[]> = { terran: TERRAN_UNITS, zerg: ZERG_UNITS, protoss: PROTOSS_UNITS };
export const TECH_PLANS: Record<Race, TechStep[]> = { terran: TERRAN_TECH, zerg: ZERG_TECH, protoss: PROTOSS_TECH };

/** Research in priority order (one-shot techs relevant to the plan first, then the level lines). */
export const RESEARCH_PLANS: Record<Race, { id: string; level: 1 | 2 | 3 }[]> = {
  terran: [
    { id: 'combat_shields', level: 1 }, { id: 'weapons', level: 1 }, { id: 'armor', level: 1 }, { id: 'vehicle_weapons', level: 2 },
    { id: 'smart_servos', level: 2 }, { id: 'drilling_claws', level: 2 }, { id: 'ship_weapons', level: 2 }, { id: 'vehicle_armor', level: 2 }, { id: 'ship_armor', level: 3 },
  ],
  zerg: [
    { id: 'metabolic_boost', level: 1 }, { id: 'missile_attacks', level: 1 }, { id: 'melee_attacks', level: 1 }, { id: 'armor', level: 1 },
    { id: 'centrifugal_hooks', level: 1 }, { id: 'grooved_spines', level: 2 }, { id: 'ship_weapons', level: 2 }, { id: 'ship_armor', level: 2 },
    { id: 'chitinous_plating', level: 3 }, { id: 'seismic_spines', level: 3 },
  ],
  protoss: [
    { id: 'warp_gate', level: 1 }, { id: 'weapons', level: 1 }, { id: 'charge', level: 2 }, { id: 'armor', level: 1 }, { id: 'blink_tech', level: 2 },
    { id: 'psionic_storm', level: 2 }, { id: 'resonating_glaives', level: 2 }, { id: 'shield_upgrade', level: 2 }, { id: 'ship_weapons', level: 2 },
    { id: 'thermal_lance', level: 3 }, { id: 'ship_armor', level: 3 },
  ],
};
