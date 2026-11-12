import { campaignUnits, type CampaignUnitType } from './campaign/units';
import { UnitType, UpgradeType, BuildingType, UnitStats, BuildingStats, FactionType, MapId, DifficultyLevel } from './types';

import { LAYOUT } from './maps';
import { LEVELS } from './levels';
export const MAP_SIZE = LAYOUT.size; // tiles per side (120 standard maps, 240 Lost Temple) - fixed per page load
export const TILE_SIZE = 1.0;
export const TICK_RATE = 60; // 60 updates per second
export const TIME_STEP = 1 / TICK_RATE;

const BASE_UNITS: Record<Exclude<UnitType, CampaignUnitType>, UnitStats> = {
  scv: {
    name: 'SCV',
    race: 'terran',
    costMinerals: 50,
    costGas: 0,
    buildTime: 12,
    supplyCost: 1,
    maxHealth: 45,
    armor: 0,
    armorType: 'mechanical',
    speed: 3.94,
    sightRange: 8,
    attackRange: 0.2,
    damage: 5,
    attackSpeed: 0.935,
    canTargetGround: true,
    attributes: ['light', 'biological', 'mechanical'],
    description: 'Basic Terran worker. Gathers resources, constructs structures, and repairs mechanical units.',
    icon: '🛠️',
    hotkey: 'S'
  },
  marine: {
    name: 'Marine',
    race: 'terran',
    costMinerals: 50,
    costGas: 0,
    buildTime: 18,
    supplyCost: 1,
    maxHealth: 45,
    armor: 0,
    armorType: 'light',
    speed: 3.15,
    sightRange: 9,
    attackRange: 5,
    damage: 6,
    attackSpeed: 1.639,
    canTargetAir: true,
    canTargetGround: true,
    attributes: ['light', 'biological'],
    upgradeDamage: 1,
    description: 'General-purpose infantry armed with C-14 Impaler Gauss rifle. Has Stimpack ability.',
    icon: '🔫',
    hotkey: 'A'
  },
  marauder: {
    name: 'Marauder',
    race: 'terran',
    costMinerals: 100,
    costGas: 25,
    buildTime: 21,
    supplyCost: 2,
    maxHealth: 125,
    armor: 1,
    armorType: 'armored',
    speed: 3.15,
    sightRange: 10,
    attackRange: 6,
    damage: 10,
    bonusDamage: { type: 'armored', amount: 10 },
    attackSpeed: 0.935,
    canTargetGround: true,
    attributes: ['armored', 'biological'],
    upgradeDamage: 1,
    upgradeBonus: 1,
    description: 'Heavy shock infantry. Dual grenade launchers deal bonus damage against armored units and slow targets.',
    icon: '💣',
    hotkey: 'D'
  },
  firebat: {
    name: 'Firebat',
    race: 'terran',
    costMinerals: 100,
    costGas: 25,
    buildTime: 30,
    supplyCost: 2,
    maxHealth: 100,
    armor: 1,
    armorType: 'armored',
    speed: 2.25,
    sightRange: 9,
    attackRange: 2,
    damage: 18, // no sourced Firebat stats exist: uses the verified Hellbat flamethrower (18 (+2), 1.43 cooldown, range 2, no base bonus)
    attackSpeed: 1 / 1.43,
    splashRadius: 1.4,
    canTargetGround: true,
    attributes: ['armored', 'biological'],
    upgradeDamage: 2,
    description: 'Heavy infantry (campaign unit). Perdition flamethrower scorches groups of ground units, with bonus damage against light targets.',
    icon: '🔥',
    hotkey: 'F'
  },
  medic: {
    name: 'Medic',
    race: 'terran',
    costMinerals: 75,
    costGas: 50,
    buildTime: 25,
    supplyCost: 2,
    maxHealth: 60,
    maxEnergy: 200,
    armor: 1,
    armorType: 'light',
    speed: 2.25,
    sightRange: 9,
    attackRange: 0,
    damage: 0,
    attackSpeed: 1,
    canTargetGround: false,
    attributes: ['light', 'biological'],
    description: 'Support trooper (campaign unit). Automatically heals nearby wounded biological units (1 energy per 3 HP).',
    icon: '⚕️',
    hotkey: 'E'
  },
  siege_tank: {
    name: 'Siege Tank',
    race: 'terran',
    costMinerals: 150,
    costGas: 125,
    buildTime: 32,
    supplyCost: 3,
    maxHealth: 175,
    armor: 1,
    armorType: 'armored',
    speed: 3.15,
    sightRange: 11,
    attackRange: 7,
    damage: 15,
    bonusDamage: { type: 'armored', amount: 10 },
    attackSpeed: 1.351,
    canTargetGround: true,
    attributes: ['armored', 'mechanical'],
    upgradeDamage: 2,
    upgradeBonus: 1,
    description: 'Dual-mode armored artillery. Mobile tank mode for skirmishing; transforms into stationary Siege Mode for long-range devastation.',
    icon: '🚜',
    hotkey: 'S'
  },
  siege_tank_sieged: {
    name: 'Siege Tank (Sieged)',
    race: 'terran',
    costMinerals: 150,
    costGas: 125,
    buildTime: 32,
    supplyCost: 3,
    maxHealth: 175,
    armor: 1,
    armorType: 'armored',
    speed: 0.0,
    sightRange: 11,
    attackRange: 13,
    damage: 40,
    bonusDamage: { type: 'armored', amount: 30 },
    attackSpeed: 0.467,
    splashRadius: 1.25,
    canTargetGround: true,
    attributes: ['armored', 'mechanical'],
    minRange: 2,
    splashTiers: [0.4687, 0.7812, 1.25],
    upgradeDamage: 4,
    upgradeBonus: 1,
    description: 'Stationary 120mm Shock Cannon. Massive range and area splash damage. Has minimum range of 2.5 tiles.',
    icon: '💥',
    hotkey: 'E'
  },
  medivac: {
    name: 'Medivac',
    race: 'terran',
    costMinerals: 100,
    costGas: 100,
    buildTime: 30,
    supplyCost: 2,
    maxHealth: 150,
    maxEnergy: 200,
    armor: 1,
    armorType: 'armored',
    speed: 3.5,
    sightRange: 11,
    attackRange: 0,
    damage: 0,
    attackSpeed: 1,
    isFlying: true,
    canTargetGround: false,
    attributes: ['armored', 'mechanical'],
    description: 'Armored VTOL dropship. Auto-heals friendly bio units; possesses tactical pulse beam & afterburner in direct flight control.',
    icon: '🚁',
    hotkey: 'M'
  },
  viking: {
    name: 'Viking',
    race: 'terran',
    costMinerals: 125, // Patch 5.0.15 (was 150)
    costGas: 75,
    buildTime: 30,
    supplyCost: 2,
    maxHealth: 135,
    armor: 0,
    armorType: 'armored',
    speed: 3.85,
    sightRange: 10,
    attackRange: 9,
    damage: 10,
    bonusDamage: { type: 'armored', amount: 4 },
    attackSpeed: 0.7, // cooldown 1.43
    attackCount: 2,
    isFlying: true,
    canTargetAir: true,
    canTargetGround: false,
    attributes: ['armored', 'mechanical'],
    upgradeDamage: 1,
    upgradeBonus: 0, // Lanzer Torpedoes: 10 (+1) x2, +4 vs Armored (bonus does not scale)
    description: 'Fighter Mode: long-range anti-air. Lanzer Torpedoes 10 (+4 vs armored) x2, range 9. Assault Mode (D) lands it as a ground walker.',
    icon: '🛩️',
    hotkey: 'K'
  },
  viking_assault: {
    name: 'Viking (Assault)',
    race: 'terran',
    costMinerals: 125,
    costGas: 75,
    buildTime: 30,
    supplyCost: 2,
    maxHealth: 135,
    armor: 0,
    armorType: 'armored',
    speed: 3.15,
    sightRange: 10,
    attackRange: 6,
    damage: 12,
    bonusDamage: { type: 'mechanical', amount: 8 },
    attackSpeed: 1 / 0.71, // Twin Gatling Cannon, cooldown 0.71
    canTargetAir: false,
    canTargetGround: true,
    attributes: ['armored', 'mechanical'],
    upgradeDamage: 1,
    upgradeBonus: 1, // 12 (+1), +8 (+1) vs Mechanical; always Ship Weapons
    description: 'Assault Mode: landed walker. Twin Gatling Cannon 12 (+8 vs mechanical), range 6. Fighter Mode (E) lifts off.',
    icon: '🦿',
    hotkey: 'E'
  },
  widow_mine: {
    name: 'Widow Mine',
    race: 'terran',
    costMinerals: 75,
    costGas: 25,
    buildTime: 21,
    supplyCost: 2,
    maxHealth: 90,
    armor: 0,
    armorType: 'light',
    speed: 3.94,
    sightRange: 7,
    attackRange: 5,
    damage: 125,
    attackSpeed: 0.0345,
    canTargetGround: true,
    canTargetAir: true,
    attributes: ['light', 'mechanical'],
    upgradeDamage: 1,
    description: 'Burrow (B, 2.14s) to arm it: after a 1.07s lock-on it fires a Sentinel Missile (125, +35 vs shields; 40, +25 vs shields splash in radius 1.5; ignores armor and upgrades; hits friendly units except Widow Mines) at anything in range 5, then reloads for 29s, revealed while reloading unless Drilling Claws is researched.',
    icon: '💣',
    hotkey: 'N'
  },
  wraith: {
    name: 'Wraith Fighter',
    race: 'terran',
    costMinerals: 150,
    costGas: 150,
    buildTime: 50,
    supplyCost: 2,
    maxHealth: 125,
    maxEnergy: 200,
    armor: 0,
    armorType: 'light',
    speed: 3.75,
    sightRange: 12,
    attackRange: 5,
    damage: 8,
    attackSpeed: 0.592,
    isFlying: true,
    canTargetAir: true,
    canTargetGround: true,
    attributes: ['armored', 'mechanical'],
    upgradeDamage: 1,
    airWeapon: { damage: 5, bonusDamage: { type: 'armored', amount: 5 }, attackCount: 2, attackSpeed: 0.8, attackRange: 5, upgradeDamage: 1 },
    description: 'Air superiority fighter jet. Armed with rapid-fire nose lasers and lock-on Gemini homing missiles. Excels at dogfighting & strafing runs.',
    icon: '✈️',
    hotkey: 'W'
  },
  banshee: {
    name: 'Banshee Gunship',
    race: 'terran',
    costMinerals: 150,
    costGas: 100,
    buildTime: 43,
    supplyCost: 3,
    maxHealth: 140,
    maxEnergy: 200,
    armor: 0,
    armorType: 'armored',
    speed: 3.85,
    sightRange: 10,
    attackRange: 6,
    damage: 12,
    attackSpeed: 1.124,
    isFlying: true,
    canTargetGround: true,
    attributes: ['light', 'mechanical'],
    attackCount: 2,
    upgradeDamage: 1,
    description: 'Tactical attack helicopter gunship. Fires Backlash rocket salvos and guided air-to-ground missiles.',
    icon: '🛩️',
    hotkey: 'B'
  },

  // Zerg Units
  hellion: {
    name: 'Hellion',
    race: 'terran',
    costMinerals: 100,
    costGas: 0,
    buildTime: 21,
    supplyCost: 2,
    maxHealth: 90,
    armor: 0,
    armorType: 'light',
    speed: 5.95,
    sightRange: 10,
    attackRange: 5,
    damage: 8,
    bonusDamage: { type: 'light', amount: 6 },
    attackSpeed: 0.559,
    splashRadius: 1.6,
    canTargetGround: true,
    attributes: ['light', 'mechanical'],
    upgradeDamage: 1,
    upgradeBonus: 1,
    description: 'Fast flame-thrower buggy. Line splash shreds light units and worker lines.',
    icon: '🔥',
    hotkey: 'H'
  },
  thor: {
    name: 'Thor',
    race: 'terran',
    costMinerals: 300,
    costGas: 200,
    buildTime: 43,
    supplyCost: 6,
    maxHealth: 400,
    armor: 1,
    armorType: 'massive',
    speed: 2.62,
    sightRange: 11,
    attackRange: 7,
    damage: 30,
    attackSpeed: 1.099,
    canTargetAir: true,
    canTargetGround: true,
    attributes: ['armored', 'mechanical', 'massive'],
    attackCount: 2,
    upgradeDamage: 3,
    airWeapon: { damage: 6, bonusDamage: { type: 'light', amount: 6 }, attackCount: 4, attackSpeed: 0.467, attackRange: 10, splashRadius: 0.5, upgradeDamage: 1, upgradeBonus: 1 },
    description: 'Explosive Payload: Javelin missiles 6 (+6 vs light) x4 splash vs air, range 10. High Impact Payload (E) swaps to single-target anti-armor cannons.',
    icon: '🦾',
    hotkey: 'T'
  },
  thor_ap: {
    name: 'Thor (High Impact)',
    race: 'terran',
    costMinerals: 300,
    costGas: 200,
    buildTime: 43,
    supplyCost: 6,
    maxHealth: 400,
    armor: 1,
    armorType: 'massive',
    speed: 2.62,
    sightRange: 11,
    attackRange: 7,
    damage: 30,
    attackSpeed: 1.099,
    canTargetAir: true,
    canTargetGround: true,
    attributes: ['armored', 'mechanical', 'massive'],
    attackCount: 2,
    upgradeDamage: 3,
    // 250mm Punisher Cannons: 25 (+3), +10 (+1) vs Massive, cooldown 0.91, range 11 (Patch 4.8.2)
    airWeapon: { damage: 25, bonusDamage: { type: 'massive', amount: 10 }, attackCount: 1, attackSpeed: 1 / 0.91, attackRange: 11, upgradeDamage: 3, upgradeBonus: 1 },
    description: 'High Impact Payload: 250mm Punisher Cannons 25 (+10 vs massive) single-target vs air, range 11. Explosive Payload (D) swaps back to splash missiles.',
    icon: '🦾',
    hotkey: 'D'
  },
  goliath: {
    name: 'Goliath',
    race: 'terran',
    costMinerals: 150,
    costGas: 50,
    buildTime: 40,
    supplyCost: 3,
    maxHealth: 125,
    armor: 1,
    armorType: 'armored',
    attributes: ['armored', 'mechanical'],
    speed: 2.69,
    sightRange: 9,
    attackRange: 6,
    damage: 18,
    attackSpeed: 0.667,
    upgradeDamage: 1,
    airWeapon: { damage: 8, bonusDamage: { type: 'armored', amount: 8 }, attackCount: 2, attackSpeed: 0.667, attackRange: 6, upgradeDamage: 2 },
    canTargetAir: true,
    canTargetGround: true,
    description: 'Bipedal combat walker (campaign unit, not in SC2 multiplayer). Twin autocannons for ground targets and Hellfire missile pods for air targets. Needs an Armory.',
    icon: '🤖',
    hotkey: 'G'
  },
  mule: {
    name: 'MULE',
    race: 'terran',
    costMinerals: 0,
    costGas: 0,
    buildTime: 0,
    supplyCost: 0,
    maxHealth: 60,
    armor: 0,
    armorType: 'mechanical',
    speed: 3.94,
    sightRange: 8,
    attackRange: 0,
    damage: 0,
    attackSpeed: 1,
    canTargetGround: false,
    attributes: ['light', 'mechanical'],
    description: 'Orbital-dropped mining drone. Harvests 25 minerals per trip for 64 seconds, then expires.',
    icon: '📦',
    hotkey: 'M'
  },
  queen: {
    name: 'Queen',
    race: 'zerg',
    costMinerals: 175,
    costGas: 0,
    buildTime: 36,
    supplyCost: 2,
    maxHealth: 175,
    armor: 1,
    armorType: 'biological',
    speed: 1.31,
    sightRange: 9,
    attackRange: 5,
    damage: 4,
    attackSpeed: 1.408,
    canTargetAir: true,
    canTargetGround: true,
    maxEnergy: 200,
    attributes: ['biological', 'psionic'],
    attackCount: 2,
    upgradeDamage: 1,
    airWeapon: { damage: 9, attackSpeed: 1.408, attackRange: 7, upgradeDamage: 1 },
    description: 'Hive support caster. Injects Larva into a Hatchery and Transfuses wounded allies.',
    icon: '👑',
    hotkey: 'Q'
  },
  sentry: {
    name: 'Sentry',
    race: 'protoss',
    costMinerals: 50,
    costGas: 100,
    buildTime: 23,
    supplyCost: 2,
    maxHealth: 40,
    armor: 1,
    armorType: 'light',
    speed: 3.5,
    sightRange: 10,
    attackRange: 5,
    damage: 6,
    attackSpeed: 1.408,
    canTargetAir: true,
    canTargetGround: true,
    maxEnergy: 200,
    attributes: ['mechanical', 'psionic'],
    upgradeDamage: 1,
    description: 'Support caster. Guardian Shield cuts ranged damage to nearby allies; Hallucination-grade scouting.',
    icon: '🛡️',
    hotkey: 'E'
  },
  drone: {
    name: 'Drone',
    race: 'zerg',
    costMinerals: 50,
    costGas: 0,
    buildTime: 12,
    supplyCost: 1,
    maxHealth: 40,
    armor: 0,
    armorType: 'light',
    speed: 3.94,
    sightRange: 8,
    attackRange: 0.2,
    damage: 5,
    attackSpeed: 0.935,
    canTargetGround: true,
    attributes: ['light', 'biological'],
    description: 'Zerg worker drone. Collects minerals and vespene gas, morphs into Zerg structures.',
    icon: '🐛',
    hotkey: 'D'
  },
  larva: {
    name: 'Larva',
    race: 'zerg',
    costMinerals: 0, costGas: 0, buildTime: 0, supplyCost: 0,
    maxHealth: 25, armor: 10, armorType: 'light', attributes: ['light', 'biological'],
    speed: 0, sightRange: 5, attackRange: 0, damage: 0, attackSpeed: 1, canTargetGround: false,
    description: 'Spawned by Hatcheries. Select it and morph it into any Zerg unit.',
    icon: '🐛', hotkey: ''
  },
  egg: {
    name: 'Egg',
    race: 'zerg',
    costMinerals: 0, costGas: 0, buildTime: 0, supplyCost: 0,
    maxHealth: 200, armor: 10, armorType: 'armored', attributes: ['armored', 'biological'],
    speed: 0, sightRange: 5, attackRange: 0, damage: 0, attackSpeed: 1, canTargetGround: false,
    description: 'A larva morphing into a unit. Cancel to get the full cost back and keep the larva.',
    icon: '🥚', hotkey: ''
  },
  zergling: {
    name: 'Zergling',
    race: 'zerg',
    costMinerals: 50, // 50 for a pair: one Larva hatches two Zerglings (see LARVA_YIELD in simulation/Larva.ts)
    costGas: 0,
    buildTime: 17,
    supplyCost: 0.5, // each; the pair costs 1
    maxHealth: 35,
    armor: 0,
    armorType: 'light',
    speed: 4.13,
    sightRange: 8,
    attackRange: 0.1,
    damage: 5,
    attackSpeed: 2.012,
    canTargetGround: true,
    attributes: ['light', 'biological'],
    upgradeDamage: 1,
    description: 'Fast, agile melee swarmer. Spawns in pairs. Gains immense speed on Zerg creep.',
    icon: '🦂',
    hotkey: 'Z'
  },
  roach: {
    name: 'Roach',
    race: 'zerg',
    costMinerals: 75,
    costGas: 25,
    buildTime: 19,
    supplyCost: 2,
    maxHealth: 145,
    armor: 1,
    armorType: 'armored',
    speed: 3.15,
    sightRange: 9,
    attackRange: 4,
    damage: 16,
    attackSpeed: 0.699,
    canTargetGround: true,
    attributes: ['armored', 'biological'],
    upgradeDamage: 2,
    description: 'Heavily armored assault bio-unit. Spits acid saliva and possesses rapid natural health regeneration.',
    icon: '🪲',
    hotkey: 'R'
  },
  hydralisk: {
    name: 'Hydralisk',
    race: 'zerg',
    costMinerals: 100,
    costGas: 50,
    buildTime: 24,
    supplyCost: 2,
    maxHealth: 90,
    armor: 0,
    armorType: 'light',
    speed: 3.15,
    sightRange: 9,
    attackRange: 5,
    damage: 12,
    attackSpeed: 1.695,
    canTargetAir: true,
    canTargetGround: true,
    attributes: ['light', 'biological'],
    upgradeDamage: 1,
    description: 'Deadly serpentine warrior. Fires needle spines capable of striking both ground and airborne targets.',
    icon: '🐍',
    hotkey: 'H'
  },
  mutalisk: {
    name: 'Mutalisk',
    race: 'zerg',
    costMinerals: 100,
    costGas: 100,
    buildTime: 24,
    supplyCost: 2,
    maxHealth: 120,
    armor: 0,
    armorType: 'light',
    speed: 5.6,
    sightRange: 11,
    attackRange: 3,
    damage: 9,
    attackSpeed: 0.917,
    isFlying: true,
    canTargetAir: true,
    canTargetGround: true,
    attributes: ['light', 'biological'],
    upgradeDamage: 1,
    description: 'Agile winged Zerg flyer. Fires bouncing Glaive Wurms at air and ground targets.',
    icon: '🦇',
    hotkey: 'T'
  },

  baneling: {
    name: 'Baneling',
    race: 'zerg',
    costMinerals: 25,
    costGas: 25,
    buildTime: 14,
    supplyCost: 1,
    maxHealth: 30,
    armor: 0,
    armorType: 'light',
    speed: 3.5,
    sightRange: 8,
    attackRange: 0.25,
    damage: 16,
    bonusDamage: { type: 'light', amount: 19 },
    attackSpeed: 1,
    splashRadius: 2.2,
    canTargetGround: true,
    attributes: ['light', 'biological'],
    upgradeDamage: 2,
    description: 'Volatile acid-filled suicide unit. Rolls into enemy ground forces and bursts, hitting everything nearby (bonus vs light).',
    icon: '🟢',
    hotkey: 'B'
  },
  ravager: {
    name: 'Ravager',
    race: 'zerg',
    costMinerals: 100,
    costGas: 100,
    buildTime: 16,
    supplyCost: 3,
    maxHealth: 120,
    armor: 1,
    armorType: 'light',
    speed: 3.85,
    sightRange: 9,
    attackRange: 6,
    damage: 16,
    attackSpeed: 1 / 1.14,
    canTargetGround: true,
    attributes: ['biological'],
    upgradeDamage: 2,
    description: 'Long-range siege bio-unit. Spits corrosive bile from beyond most defensive ranges.',
    icon: '☄️',
    hotkey: 'V'
  },
  ultralisk: {
    name: 'Ultralisk',
    race: 'zerg',
    costMinerals: 275,
    costGas: 200,
    buildTime: 39,
    supplyCost: 6,
    maxHealth: 500,
    armor: 2,
    armorType: 'armored',
    speed: 4.13,
    sightRange: 9,
    attackRange: 1,
    damage: 35,
    attackSpeed: 1 / 0.61,
    splashRadius: 2,
    canTargetGround: true,
    attributes: ['armored', 'biological', 'massive'],
    upgradeDamage: 3,
    description: 'Colossal armoured shock beast. Kaiser blades cleave through every ground unit around its target.',
    icon: '🦏',
    hotkey: 'U'
  },
  broodlord: {
    name: 'Brood Lord',
    race: 'zerg',
    costMinerals: 300,
    costGas: 250,
    buildTime: 34,
    supplyCost: 4,
    maxHealth: 225,
    armor: 1,
    armorType: 'armored',
    speed: 1.97,
    sightRange: 12,
    attackRange: 10,
    damage: 20,
    attackCount: 2,
    attackSpeed: 0.56,
    isFlying: true,
    canTargetGround: true,
    attributes: ['armored', 'biological', 'massive'],
    upgradeDamage: 2,
    description: 'Colossal aerial siege beast. Launches Broodlings from extreme range at ground targets only.',
    icon: '🦅',
    hotkey: 'L'
  },
  viper: {
    name: 'Viper',
    race: 'zerg',
    costMinerals: 100,
    costGas: 200,
    buildTime: 29,
    supplyCost: 3,
    maxHealth: 150,
    maxEnergy: 200,
    armor: 1,
    armorType: 'armored',
    speed: 4.13,
    sightRange: 11,
    attackRange: 0,
    damage: 0,
    attackSpeed: 1,
    isFlying: true,
    canTargetGround: false,
    attributes: ['armored', 'biological', 'psionic'],
    description: 'Agile aerial caster with no direct attack. (Abduct / Blinding Cloud are not implemented yet.)',
    icon: '🐍',
    hotkey: 'I'
  },

  // Protoss / Red Solaris Units
  probe: {
    name: 'Probe',
    race: 'protoss',
    costMinerals: 50,
    costGas: 0,
    buildTime: 12,
    supplyCost: 1,
    maxHealth: 20,
    armor: 0,
    armorType: 'mechanical',
    speed: 3.94,
    sightRange: 8,
    attackRange: 0.2,
    damage: 5,
    attackSpeed: 0.935,
    canTargetGround: true,
    attributes: ['light', 'mechanical'],
    description: 'Robotic Solaris worker probe. Harvests resources and warps in cybernetic structures.',
    icon: '💠',
    hotkey: 'S'
  },
  dark_templar: {
    name: 'Dark Templar',
    race: 'protoss',
    costMinerals: 125,
    costGas: 125,
    buildTime: 32,
    supplyCost: 2,
    maxHealth: 40,
    armor: 1,
    armorType: 'light',
    speed: 3.94,
    sightRange: 8,
    attackRange: 0.1,
    damage: 45,
    attackSpeed: 1.21,
    canTargetGround: true,
    attributes: ['light', 'biological', 'psionic'],
    upgradeDamage: 5,
    description: 'Permanently cloaked assassin. Only visible to detectors (Photon Cannons, Scans, Spore/Missile turrets).',
    icon: '🗡️',
    hotkey: 'K'
  },
  auto_turret: {
    name: 'Auto-Turret',
    race: 'terran',
    costMinerals: 0,
    costGas: 0,
    buildTime: 1,
    supplyCost: 0,
    maxHealth: 150,
    armor: 1,
    armorType: 'armored',
    speed: 0,
    sightRange: 7,
    attackRange: 6,
    damage: 18,
    attackSpeed: 1.75,
    canTargetGround: true,
    canTargetAir: true,
    attributes: ['armored', 'mechanical', 'structure'],
    upgradeDamage: 1,
    description: 'Raven-deployed turret. Immobile, lasts 10 seconds.',
    icon: '🔫',
    hotkey: 'X'
  },
  lurker: {
    name: 'Lurker',
    race: 'zerg',
    costMinerals: 150,   // Hydralisk (100/50) + 50/100 morph
    costGas: 150,
    buildTime: 18,       // morph time
    supplyCost: 3,
    maxHealth: 200,
    armor: 1,
    armorType: 'armored',
    speed: 4.13,
    sightRange: 10,
    attackRange: 8,
    damage: 20,
    bonusDamage: { type: 'armored', amount: 10 },
    attackSpeed: 1 / 1.43,
    splashRadius: 1.4,
    canTargetGround: true,
    canTargetAir: false,
    attributes: ['armored', 'biological'],
    upgradeDamage: 2,
    upgradeBonus: 1,
    description: 'Morphs from a Hydralisk (Lurker Den). Can only attack while burrowed (B): spines pierce a line of ground units out to range 8 (10 with Seismic Spines).',
    icon: '🦂',
    hotkey: 'K'
  },
  overseer: {
    name: 'Overseer',
    race: 'zerg',
    costMinerals: 150,   // Overlord + 50/50 morph
    costGas: 50,
    buildTime: 12,       // morph time
    supplyCost: 0,
    supplyProvided: 8,
    maxHealth: 200,
    armor: 1,
    armorType: 'armored',
    speed: 2.62,
    sightRange: 11,
    attackRange: 0,
    damage: 0,
    attackSpeed: 1,
    isFlying: true,
    canTargetGround: false,
    attributes: ['armored', 'biological'],
    description: 'Overlord morph (needs a Lair). Fast flying detector: reveals cloaked and burrowed units within range 11. Still provides 8 supply.',
    icon: '👁️',
    hotkey: 'V'
  },
  corruptor: {
    name: 'Corruptor',
    race: 'zerg',
    costMinerals: 150,
    costGas: 100,
    buildTime: 29,
    supplyCost: 2,
    maxHealth: 200,
    armor: 2,
    armorType: 'armored',
    speed: 4.725,
    sightRange: 10,
    attackRange: 6,
    damage: 14,
    bonusDamage: { type: 'massive', amount: 6 },
    attackSpeed: 1 / 1.36,
    isFlying: true,
    canTargetAir: true,
    canTargetGround: false,
    attributes: ['armored', 'biological'],
    upgradeDamage: 1,
    upgradeBonus: 1,
    description: 'Anti-air flyer from a Spire (air only, extra damage to massive ships). Morphs into a Brood Lord at a Greater Spire.',
    icon: '🦟',
    hotkey: 'E'
  },
  high_templar: {
    name: 'High Templar',
    race: 'protoss',
    costMinerals: 50,
    costGas: 150,
    buildTime: 32,
    supplyCost: 2,
    maxHealth: 40,
    maxEnergy: 200,
    armor: 0,
    armorType: 'light',
    speed: 2.015,
    sightRange: 10,
    attackRange: 0,
    damage: 0,
    attackSpeed: 1,
    canTargetGround: false,
    attributes: ['light', 'biological', 'psionic'],
    description: 'Fragile psionic caster (Templar Archives). Feedback (50 energy), Psionic Storm (75 energy, researched at the Templar Archives). Two High or Dark Templar can merge into an Archon.',
    icon: '🧙',
    hotkey: 'T'
  },
  archon: {
    name: 'Archon',
    race: 'protoss',
    costMinerals: 100,   // two High Templar = 100/300; cost shown is the merge's total
    costGas: 300,
    buildTime: 12,       // merge time
    supplyCost: 4,
    maxHealth: 10,
    armor: 0,
    armorType: 'massive',
    speed: 3.94,
    sightRange: 9,
    attackRange: 3,
    damage: 25,
    bonusDamage: { type: 'biological', amount: 10 },
    attackSpeed: 1 / 1.25,
    splashTiers: [0.25, 0.5, 1],
    canTargetAir: true,
    canTargetGround: true,
    attributes: ['psionic', 'massive'],
    upgradeDamage: 3,
    upgradeBonus: 1,
    description: 'Merge two High Templar or Dark Templar (select both, press T). 10 life but 350 shields; splash damage that is strong against biological units.',
    icon: '🔮',
    hotkey: 'J'
  },
  zealot: {
    name: 'Zealot',
    race: 'protoss',
    costMinerals: 100,
    costGas: 0,
    buildTime: 27,
    supplyCost: 2,
    maxHealth: 100,
    armor: 1,
    armorType: 'light',
    speed: 3.15,
    sightRange: 9,
    attackRange: 0.1,
    damage: 8,
    attackSpeed: 1.163,
    canTargetGround: true,
    attributes: ['light', 'biological'],
    attackCount: 2,
    upgradeDamage: 1,
    description: 'Fanatical Solaris shock warrior clad in plasma-shielded power armor and dual Psi-Blades.',
    icon: '⚔️',
    hotkey: 'Z'
  },
  stalker: {
    name: 'Phase Stalker',
    race: 'protoss',
    costMinerals: 125,
    costGas: 50,
    buildTime: 27,
    supplyCost: 2,
    maxHealth: 80,
    armor: 1,
    armorType: 'armored',
    speed: 4.13,
    sightRange: 10,
    attackRange: 6,
    damage: 13,
    bonusDamage: { type: 'armored', amount: 5 },
    attackSpeed: 0.746,
    canTargetAir: true,
    canTargetGround: true,
    attributes: ['armored', 'mechanical'],
    upgradeDamage: 1,
    upgradeBonus: 1,
    description: 'Quadrupedal cybernetic walker armed with twin particle disruptors capable of striking air and ground.',
    icon: '🕷️',
    hotkey: 'S'
  },
  void_ray: {
    name: 'Prismatic Void Ray',
    race: 'protoss',
    costMinerals: 250,
    costGas: 150,
    buildTime: 43,
    supplyCost: 4,
    maxHealth: 150,
    maxEnergy: 100,
    armor: 0,
    armorType: 'armored',
    speed: 3.85,
    sightRange: 10,
    attackRange: 6,
    damage: 6,
    bonusDamage: { type: 'armored', amount: 4 },
    attackSpeed: 2.778,
    isFlying: true,
    canTargetAir: true,
    canTargetGround: true,
    attributes: ['armored', 'mechanical'],
    upgradeDamage: 1,
    upgradeBonus: 1,
    description: 'Solaris capital strike cruiser. Fires a focused prismatic flux beam at air and ground targets.',
    icon: '🛸',
    hotkey: 'W'
  },
  // --- Rest of the LotV roster. Stats from Liquipedia (LotV); (?) marks our estimates / simplifications. ---
  observer: {
    name: 'Observer', race: 'protoss', costMinerals: 25, costGas: 75, buildTime: 21, supplyCost: 1, maxHealth: 40, armor: 0, armorType: 'light',
    speed: 2.63, sightRange: 11, attackRange: 0, damage: 0, attackSpeed: 1, isFlying: true, canTargetGround: false, attributes: ['light', 'mechanical'],
    description: 'Permanently cloaked flying detector (radius 11). No attack.', icon: '👁️', hotkey: 'O'
  },
  warp_prism: {
    name: 'Warp Prism', race: 'protoss', costMinerals: 250, costGas: 0, buildTime: 36, supplyCost: 2, maxHealth: 80, armor: 0, armorType: 'armored',
    speed: 4.13, sightRange: 10, attackRange: 0, damage: 0, attackSpeed: 1, isFlying: true, canTargetGround: false, attributes: ['armored', 'mechanical'],
    description: 'Fast flying support craft. No attack. (Transport and Phasing Mode power field are not implemented yet.)', icon: '🔺', hotkey: 'A'
  },
  disruptor: {
    name: 'Disruptor', race: 'protoss', costMinerals: 150, costGas: 150, buildTime: 36, supplyCost: 3, maxHealth: 100, armor: 1, armorType: 'armored',
    speed: 3.15, sightRange: 9, attackRange: 8, damage: 145, attackSpeed: 1 / 21.4, splashRadius: 1.5, canTargetGround: true,
    attributes: ['armored', 'mechanical'],
    description: 'Purification Nova: 145 damage in a 1.5 radius every 21.4s (modelled as a long-cooldown splash shot, range 8 (?)).', icon: '🔆', hotkey: 'D'
  },
  phoenix: {
    name: 'Phoenix', race: 'protoss', costMinerals: 150, costGas: 100, buildTime: 25, supplyCost: 2, maxHealth: 120, maxEnergy: 200, armor: 0, armorType: 'light',
    speed: 5.95, sightRange: 10, attackRange: 5, damage: 5, bonusDamage: { type: 'light', amount: 5 }, attackCount: 2, attackSpeed: 1 / 0.79,
    isFlying: true, canTargetAir: true, canTargetGround: false, attributes: ['light', 'mechanical'], upgradeDamage: 1, upgradeBonus: 1,
    description: 'Fast air-superiority fighter. Ion Cannons hit air only. (Graviton Beam is not implemented yet.)', icon: '🦅', hotkey: 'X'
  },
  oracle: {
    name: 'Oracle', race: 'protoss', costMinerals: 150, costGas: 150, buildTime: 37, supplyCost: 3, maxHealth: 100, maxEnergy: 200, armor: 0, armorType: 'armored',
    speed: 5.6, sightRange: 10, attackRange: 4, damage: 15, bonusDamage: { type: 'light', amount: 7 }, attackSpeed: 1 / 0.61,
    isFlying: true, canTargetGround: true, attributes: ['armored', 'mechanical', 'psionic'],
    description: 'Fast raider. Pulsar Beam shreds light ground units (always on here; the energy drain is not modelled).', icon: '🔮', hotkey: 'E'
  },
  mothership: {
    name: 'Mothership', race: 'protoss', costMinerals: 400, costGas: 400, buildTime: 79, supplyCost: 8, maxHealth: 350, maxEnergy: 200, armor: 2, armorType: 'armored',
    speed: 2.62, sightRange: 14, attackRange: 7, damage: 6, attackCount: 4, attackSpeed: 1 / 1.58, isFlying: true, canTargetAir: true, canTargetGround: true,
    attributes: ['armored', 'massive', 'mechanical', 'psionic'], upgradeDamage: 1,
    description: 'Unique flagship (one at a time) built at the Nexus. Purifier beams hit air and ground. (Cloaking Field and Recall are not implemented yet.)', icon: '🌌', hotkey: 'M'
  },
  infestor: {
    name: 'Infestor', race: 'zerg', costMinerals: 100, costGas: 150, buildTime: 36, supplyCost: 2, maxHealth: 90, maxEnergy: 200, armor: 0, armorType: 'armored',
    speed: 3.15, sightRange: 10, attackRange: 0, damage: 0, attackSpeed: 1, canTargetGround: false, attributes: ['armored', 'biological', 'psionic'],
    description: 'Spellcaster. Fungal Growth damages and roots enemies. No direct attack.', icon: '🦠', hotkey: 'F'
  }
};

export const UNIT_CONFIGS: Record<UnitType, UnitStats> = { ...BASE_UNITS, ...campaignUnits(BASE_UNITS) };

export const BUILDING_CONFIGS: Record<BuildingType, BuildingStats> = {
  command_center: {
    name: 'Command Center',
    race: 'terran',
    costMinerals: 400,
    costGas: 0,
    buildTime: 70,
    supplyProvided: 15,
    maxHealth: 1500,
    armor: 1,
    sightRange: 11,
    footprint: { width: 5, height: 5 },
    produces: ['scv'],
    description: 'Terran central headquarters. Produces SCVs and serves as the primary resource drop-off depot.',
    icon: '🏛️',
    hotkey: 'C'
  },
  orbital_command: {
    name: 'Orbital Command',
    race: 'terran',
    costMinerals: 550,
    costGas: 0,
    buildTime: 25,
    supplyProvided: 15,
    maxHealth: 1500,
    armor: 1,
    sightRange: 11,
    footprint: { width: 5, height: 5 },
    produces: ['scv'],
    description: 'Upgraded Command Center. Calls down MULEs, scans the map, and can still lift off. Energy 50 on completion.',
    icon: '🛰️',
    hotkey: 'O'
  },
  planetary_fortress: {
    name: 'Planetary Fortress',
    race: 'terran',
    costMinerals: 550,
    costGas: 150,
    buildTime: 36,
    supplyProvided: 15,
    maxHealth: 1500,
    armor: 3,
    sightRange: 11,
    footprint: { width: 5, height: 5 },
    produces: ['scv'],
    attackRange: 6,
    damage: 40,
    attackSpeed: 0.5,
    canTargetAir: false,
    canTargetGround: true,
    description: 'Fortified Command Center (needs an Engineering Bay): 3 armor and a heavy ground cannon with splash. Cannot lift off or use MULEs.',
    icon: '🏰',
    hotkey: 'P'
  },
  techlab: {
    name: 'Tech Lab',
    race: 'terran',
    costMinerals: 50,
    costGas: 25,
    buildTime: 18,
    supplyProvided: 0,
    maxHealth: 400,
    armor: 1,
    sightRange: 8,
    footprint: { width: 2, height: 2 },
    produces: [],
    description: 'Add-on for Barracks, Factory or Starport. Unlocks Marauders, Siege Tanks, Thors and Banshees.',
    icon: '🔬',
    hotkey: 'T'
  },
  reactor: {
    name: 'Reactor',
    race: 'terran',
    costMinerals: 50,
    costGas: 50,
    buildTime: 36,
    supplyProvided: 0,
    maxHealth: 400,
    armor: 1,
    sightRange: 8,
    footprint: { width: 2, height: 2 },
    produces: [],
    description: 'Add-on for Barracks, Factory or Starport. Lets the structure produce two units at once.',
    icon: '⚛️',
    hotkey: 'R'
  },
  holoboard: {
    name: 'Dominion Holoboard', race: 'terran', costMinerals: 0, costGas: 0, buildTime: 1, supplyProvided: 0,
    maxHealth: 400 /* (?) UNVERIFIED */, armor: 1, sightRange: 4, footprint: { width: 2, height: 2 }, produces: [],
    description: 'Dominion propaganda holoboard. Mengsk speaks from it.', icon: '📺', hotkey: ''
  },
  supply_depot: {
    name: 'Supply Depot',
    race: 'terran',
    costMinerals: 100,
    costGas: 0,
    buildTime: 25,
    supplyProvided: 8,
    maxHealth: 400,
    armor: 1,
    sightRange: 8,
    footprint: { width: 2, height: 2 },
    produces: [],
    description: 'Provides 8 supply to support your army. Can be lowered into the ground to allow units to pass over.',
    icon: '📦',
    hotkey: 'S'
  },
  supply_depot_lowered: {
    name: 'Supply Depot (Lowered)',
    race: 'terran',
    costMinerals: 100,
    costGas: 0,
    buildTime: 25,
    supplyProvided: 8,
    maxHealth: 400,
    armor: 1,
    sightRange: 8,
    footprint: { width: 2, height: 2 },
    produces: [],
    description: 'Submerged supply depot. Units can walk directly across it.',
    icon: '📥',
    hotkey: 'R'
  },
  refinery: {
    name: 'Refinery',
    race: 'terran',
    costMinerals: 75,
    costGas: 0,
    buildTime: 25,
    supplyProvided: 0,
    maxHealth: 500,
    armor: 1,
    sightRange: 8,
    footprint: { width: 3, height: 3 },
    produces: [],
    requiresRefineryGeyser: true,
    description: 'Automated extraction plant built atop a Vespene Geyser, allowing SCVs to harvest Vespene gas.',
    icon: '🏭',
    hotkey: 'R'
  },
  barracks: {
    name: 'Barracks',
    race: 'terran',
    costMinerals: 150,
    costGas: 0,
    buildTime: 45,
    supplyProvided: 0,
    maxHealth: 1000,
    armor: 1,
    sightRange: 9,
    footprint: { width: 3, height: 3 },
    produces: ['marine', 'marauder', 'firebat', 'medic', 'reaper', 'ghost'],
    prerequisite: 'supply_depot',
    description: 'Infantry manufacturing facility. Trains Marines, Marauders, Firebats and Medics.',
    icon: '🏢',
    hotkey: 'B'
  },
  engineering_bay: {
    name: 'Engineering Bay',
    race: 'terran',
    costMinerals: 125,
    costGas: 0,
    buildTime: 30,
    supplyProvided: 0,
    maxHealth: 850,
    armor: 1,
    sightRange: 9,
    footprint: { width: 3, height: 3 },
    produces: [],
    prerequisite: 'command_center',
    description: 'Terran research facility. Researches Infantry Weapons and Infantry Armor upgrades.',
    icon: '🛰️',
    hotkey: 'E'
  },
  bunker: {
    name: 'Bunker',
    race: 'terran',
    costMinerals: 100,
    costGas: 0,
    buildTime: 29,
    supplyProvided: 0,
    maxHealth: 400,
    armor: 1,
    sightRange: 10,
    footprint: { width: 3, height: 3 },
    produces: [],
    prerequisite: 'barracks',
    description: 'Garrison of up to 4 Marines or Marauders (1 slot each). Loaded infantry are protected, fire with +1 range and their own upgrades, and survive if the Bunker falls. Salvage returns 75% of the cost.',
    icon: '🏯',
    hotkey: 'U'
  },
  missile_turret: {
    name: 'Missile Turret',
    race: 'terran',
    costMinerals: 100,
    costGas: 0,
    buildTime: 18,
    supplyProvided: 0,
    maxHealth: 250,
    armor: 0,
    sightRange: 11,
    footprint: { width: 2, height: 2 },
    produces: [],
    prerequisite: 'engineering_bay',
    attackRange: 7,
    damage: 12,
    attackSpeed: 1.639,
    canTargetAir: true,
    canTargetGround: false,
    attackCount: 2,
    description: 'Anti-air defense turret. Fires twin Longbolt missiles at air units and detects cloaked and burrowed units nearby.',
    icon: '📡',
    hotkey: 'T'
  },
  factory: {
    name: 'Factory',
    race: 'terran',
    costMinerals: 150,
    costGas: 100,
    buildTime: 50,
    supplyProvided: 0,
    maxHealth: 1250,
    armor: 1,
    sightRange: 9,
    footprint: { width: 3, height: 3 },
    produces: ['hellion', 'hellbat', 'widow_mine', 'siege_tank', 'goliath', 'thor', 'cyclone', 'odin'],
    prerequisite: 'barracks',
    description: 'Heavy vehicle manufacturing bay. Builds Siege Tanks.',
    icon: '🏗️',
    hotkey: 'F'
  },
  armory: {
    name: 'Armory',
    race: 'terran',
    costMinerals: 150,
    costGas: 100,
    buildTime: 46,
    supplyProvided: 0,
    maxHealth: 750,
    armor: 1,
    sightRange: 8,
    footprint: { width: 3, height: 3 },
    produces: [],
    prerequisite: 'factory',
    description: 'Vehicle & ship weapons/armor upgrades. Required for the Thor.',
    icon: '⚙️',
    hotkey: 'Y'
  },
  fusion_core: {
    name: 'Fusion Core', race: 'terran', costMinerals: 150, costGas: 150, buildTime: 46, supplyProvided: 0, maxHealth: 750, armor: 1, sightRange: 9,
    footprint: { width: 3, height: 3 }, produces: [], prerequisite: 'starport',
    description: 'Capital-ship research facility. Required for the Battlecruiser.', icon: '⚛️', hotkey: 'C'
  },
  ghost_academy: {
    name: 'Ghost Academy', race: 'terran', costMinerals: 150, costGas: 50, buildTime: 29, supplyProvided: 0, maxHealth: 1250, armor: 1, sightRange: 9,
    footprint: { width: 3, height: 3 }, produces: [], prerequisite: 'barracks',
    description: 'Covert-ops training school. Required for the Ghost.', icon: '🎓', hotkey: 'G'
  },
  sensor_tower: {
    name: 'Sensor Tower', race: 'terran', costMinerals: 125, costGas: 100, buildTime: 18, supplyProvided: 0, maxHealth: 200, armor: 0, sightRange: 12,
    footprint: { width: 1, height: 1 }, produces: [], prerequisite: 'engineering_bay',
    description: 'Long-range sensor mast with wide vision. (The 30-range minimap radar is not implemented yet.)', icon: '📶', hotkey: 'N'
  },
  rocks: {
    name: 'Destructible Rocks',
    race: 'terran',
    costMinerals: 0,
    costGas: 0,
    buildTime: 0,
    supplyProvided: 0,
    maxHealth: 1500,
    armor: 1,
    sightRange: 0,
    footprint: { width: 3, height: 3 },
    produces: [],
    description: 'A rock formation blocking a path. Destroy it to open the way.',
    icon: '🪨',
    hotkey: ''
  },
  starport: {
    name: 'Starport',
    race: 'terran',
    costMinerals: 150,
    costGas: 100,
    buildTime: 45,
    supplyProvided: 0,
    maxHealth: 1300,
    armor: 1,
    sightRange: 10,
    footprint: { width: 3, height: 3 },
    produces: ['wraith', 'viking', 'banshee', 'medivac', 'liberator', 'raven', 'battlecruiser'],
    prerequisite: 'factory',
    description: 'Aerospace hangar. Produces Wraith Fighters, Banshee Gunships, and Medivac Dropships.',
    icon: '🛫',
    hotkey: 'S'
  },

  // Zerg Buildings
  hatchery: {
    name: 'Hatchery',
    race: 'zerg',
    costMinerals: 300,
    costGas: 0,
    buildTime: 65,
    supplyProvided: 15,
    maxHealth: 1500,
    armor: 1,
    sightRange: 11,
    footprint: { width: 5, height: 5 },
    produces: ['drone', 'zergling', 'queen', 'roach', 'hydralisk', 'mutalisk', 'corruptor', 'ultralisk', 'viper', 'overlord', 'swarm_host', 'infestor'],
    description: 'Zerg primary hive structure. Spreads creep and spawns larvae for all Zerg strains.',
    icon: '🥚',
    hotkey: 'H'
  },
  overlord_pod: {
    name: 'Overlord Pod',
    race: 'zerg',
    costMinerals: 100,
    costGas: 0,
    buildTime: 18,
    supplyProvided: 8,
    maxHealth: 350,
    armor: 0,
    sightRange: 8,
    footprint: { width: 2, height: 2 },
    produces: [],
    description: 'Pulsing bio-sac that gestates Overlords. Provides 8 supply for the swarm.',
    icon: '🎈',
    hotkey: 'O'
  },
  spawning_pool: {
    name: 'Spawning Pool',
    race: 'zerg',
    costMinerals: 200,
    costGas: 0,
    buildTime: 40,
    supplyProvided: 0,
    maxHealth: 750,
    armor: 1,
    sightRange: 8,
    footprint: { width: 3, height: 3 },
    produces: [],
    description: 'Bubbling genetic pool. Unlocks Zergling morphing.',
    icon: '🧪',
    hotkey: 'P'
  },
  roach_warren: {
    name: 'Roach Warren',
    race: 'zerg',
    costMinerals: 150,
    costGas: 0,
    buildTime: 35,
    supplyProvided: 0,
    maxHealth: 850,
    armor: 1,
    sightRange: 8,
    footprint: { width: 3, height: 3 },
    produces: [],
    prerequisite: 'spawning_pool',
    description: 'Chitinous warren. Unlocks Roach morphing at the Hatchery.',
    icon: '🕳️',
    hotkey: 'R'
  },
  hydralisk_den: {
    name: 'Hydralisk Den',
    race: 'zerg',
    costMinerals: 150,
    costGas: 100,
    buildTime: 40,
    supplyProvided: 0,
    maxHealth: 850,
    armor: 1,
    sightRange: 8,
    footprint: { width: 3, height: 3 },
    produces: [],
    prerequisite: 'lair',
    description: 'Spiked bio-den. Unlocks Hydralisk morphing.',
    icon: '🌲',
    hotkey: 'D'
  },
  spine_crawler: {
    name: 'Spine Crawler',
    race: 'zerg',
    costMinerals: 100,
    costGas: 0,
    buildTime: 36,
    supplyProvided: 0,
    maxHealth: 300,
    armor: 2,
    sightRange: 10,
    footprint: { width: 2, height: 2 },
    produces: [],
    prerequisite: 'spawning_pool',
    attackRange: 7,
    damage: 25,
    attackSpeed: 0.758,
    canTargetAir: false,
    canTargetGround: true,
    bonusDamage: { type: 'armored', amount: 5 },
    description: 'Bio-organic defensive tendril colony. Strikes ground forces at long range with armor-piercing impaler spines.',
    icon: '🌵',
    hotkey: 'C'
  },
  infestation_pit: {
    name: 'Infestation Pit',
    race: 'zerg',
    costMinerals: 100,
    costGas: 100,
    buildTime: 36,
    supplyProvided: 0,
    maxHealth: 850,
    armor: 1,
    sightRange: 8,
    footprint: { width: 3, height: 3 },
    produces: [],
    prerequisite: 'lair',
    description: 'Mutagenic pit. Unlocks Swarm Hosts and the Hive.',
    icon: '🧫',
    hotkey: 'I'
  },
  lair: {
    name: 'Lair',
    race: 'zerg',
    costMinerals: 150,
    costGas: 100,
    buildTime: 57,
    supplyProvided: 6,
    maxHealth: 2000,
    armor: 1,
    sightRange: 11,
    footprint: { width: 5, height: 5 },
    produces: [],
    prerequisite: 'spawning_pool',
    description: 'A Hatchery evolved into a Lair (morph, 57s). Unlocks Hydralisk Den, Infestation Pit, Spire, Nydus Network, Overseers and level 2 Zerg upgrades.',
    icon: '🥚',
    hotkey: 'L'
  },
  hive: {
    name: 'Hive',
    race: 'zerg',
    costMinerals: 200,
    costGas: 150,
    buildTime: 71,
    supplyProvided: 0,
    maxHealth: 2500,
    armor: 1,
    sightRange: 11,
    footprint: { width: 5, height: 5 },
    produces: [],
    prerequisite: 'infestation_pit',
    description: 'A Lair evolved into a Hive (morph, 71s, needs an Infestation Pit). Unlocks Ultralisk Cavern, Greater Spire, Vipers and level 3 Zerg upgrades.',
    icon: '🐝',
    hotkey: 'V'
  },
  extractor: {
    name: 'Extractor',
    race: 'zerg',
    costMinerals: 25,
    costGas: 0,
    buildTime: 25,
    supplyProvided: 0,
    maxHealth: 500,
    armor: 1,
    sightRange: 8,
    footprint: { width: 3, height: 3 },
    produces: [],
    requiresRefineryGeyser: true,
    description: 'Organic geyser cap. Allows Drones to harvest Vespene gas.',
    icon: '🌋',
    hotkey: 'E'
  },

  // Protoss / Red Solaris Buildings
  nexus: {
    name: 'Nexus',
    race: 'protoss',
    costMinerals: 400,
    costGas: 0,
    buildTime: 65,
    supplyProvided: 15,
    maxHealth: 1600,
    armor: 1,
    sightRange: 11,
    footprint: { width: 5, height: 5 },
    produces: ['probe', 'mothership'],
    description: 'Solaris pyramidal citadel. Warps in Probes and processes harvested minerals and Vespene gas.',
    icon: '🔺',
    hotkey: 'N'
  },
  pylon: {
    name: 'Psionic Pylon',
    race: 'protoss',
    costMinerals: 100,
    costGas: 0,
    buildTime: 22,
    supplyProvided: 8,
    maxHealth: 400,
    armor: 1,
    sightRange: 9,
    footprint: { width: 2, height: 2 },
    produces: [],
    description: 'Crystalline Khaydarin power monolith. Provides 8 psi supply for the Solaris armada.',
    icon: '💎',
    hotkey: 'S'
  },
  assimilator: {
    name: 'Assimilator',
    race: 'protoss',
    costMinerals: 75,
    costGas: 0,
    buildTime: 25,
    supplyProvided: 0,
    maxHealth: 550,
    armor: 1,
    sightRange: 8,
    footprint: { width: 3, height: 3 },
    produces: [],
    requiresRefineryGeyser: true,
    description: 'Warped atop a Vespene Geyser so Probes can harvest refined Vespene gas.',
    icon: '⚗️',
    hotkey: 'R'
  },
  gateway: {
    name: 'Warp Gateway',
    race: 'protoss',
    costMinerals: 150,
    costGas: 0,
    buildTime: 40,
    supplyProvided: 0,
    maxHealth: 1000,
    armor: 1,
    sightRange: 9,
    footprint: { width: 3, height: 3 },
    produces: ['zealot', 'sentry', 'stalker', 'adept', 'high_templar', 'dark_templar'],
    prerequisite: 'pylon',
    description: 'Dimensional warp conduit. Warps in Zealots, Phase Stalkers, and Immortals.',
    icon: '⛩️',
    hotkey: 'B'
  },
  forge: {
    name: 'Forge',
    race: 'protoss',
    costMinerals: 125,
    costGas: 0,
    buildTime: 30,
    supplyProvided: 0,
    maxHealth: 850,
    armor: 1,
    sightRange: 9,
    footprint: { width: 3, height: 3 },
    produces: [],
    prerequisite: 'nexus',
    description: 'Protoss research forge. Researches Ground Weapons, Ground Armor and Shields.',
    icon: '🔥',
    hotkey: 'E'
  },
  photon_cannon: {
    name: 'Photon Cannon',
    race: 'protoss',
    costMinerals: 150,
    costGas: 0,
    buildTime: 29,
    supplyProvided: 0,
    maxHealth: 150,
    armor: 1,
    sightRange: 11,
    footprint: { width: 2, height: 2 },
    produces: [],
    prerequisite: 'forge',
    attackRange: 7,
    damage: 20,
    attackSpeed: 1.124,
    canTargetAir: true,
    canTargetGround: true,
    description: 'Automated antimatter defense sphere. Strikes both ground and airborne hostiles.',
    icon: '⚡',
    hotkey: 'T'
  },
  baneling_nest: {
    name: 'Baneling Nest',
    race: 'zerg',
    costMinerals: 100,
    costGas: 50,
    buildTime: 43,
    supplyProvided: 0,
    maxHealth: 850,
    armor: 1,
    sightRange: 8,
    footprint: { width: 3, height: 3 },
    produces: [],
    prerequisite: 'spawning_pool',
    description: 'Acid-filled nest. Unlocks Baneling morphing and researches Centrifugal Hooks.',
    icon: '💥',
    hotkey: 'N'
  },
  evolution_chamber: {
    name: 'Evolution Chamber',
    race: 'zerg',
    costMinerals: 75,
    costGas: 0,
    buildTime: 25,
    supplyProvided: 0,
    maxHealth: 750,
    armor: 1,
    sightRange: 8,
    footprint: { width: 3, height: 3 },
    produces: [],
    prerequisite: 'hatchery',
    description: 'Mutation chamber. Researches Zerg melee/missile attack and carapace upgrades.',
    icon: '🧬',
    hotkey: 'M'
  },
  lurker_den: {
    name: 'Lurker Den',
    race: 'zerg',
    costMinerals: 100,
    costGas: 150,
    buildTime: 57,
    supplyProvided: 0,
    maxHealth: 850,
    armor: 1,
    sightRange: 8,
    footprint: { width: 3, height: 3 },
    produces: [],
    prerequisite: 'hydralisk_den',
    description: 'Burrowed den where Hydralisks mutate into Lurkers.',
    icon: '🦎',
    hotkey: 'L'
  },
  spire: {
    name: 'Spire',
    race: 'zerg',
    costMinerals: 200,
    costGas: 200,
    buildTime: 71,
    supplyProvided: 0,
    maxHealth: 850,
    armor: 1,
    sightRange: 8,
    footprint: { width: 2, height: 2 },
    produces: [],
    prerequisite: 'lair',
    description: 'Towering spire. Unlocks Mutalisks and researches flyer attack and carapace upgrades. Can evolve into a Greater Spire.',
    icon: '🗼',
    hotkey: 'U'
  },
  greater_spire: {
    name: 'Greater Spire',
    race: 'zerg',
    costMinerals: 100,
    costGas: 150,
    buildTime: 71,
    supplyProvided: 0,
    maxHealth: 1000,
    armor: 1,
    sightRange: 9,
    footprint: { width: 2, height: 2 },
    produces: [],
    prerequisite: 'spire',
    description: 'Evolved Spire (upgrade a Spire, needs a Hive). Unlocks Brood Lords.',
    icon: '🏯',
    hotkey: 'G'
  },
  nydus_network: {
    name: 'Nydus Network',
    race: 'zerg',
    costMinerals: 150,
    costGas: 150,
    buildTime: 14,
    supplyProvided: 0,
    maxHealth: 850,
    armor: 1,
    sightRange: 8,
    footprint: { width: 3, height: 3 },
    produces: [],
    prerequisite: 'lair',
    description: 'Burrowing tunnel network for rapid troop movement.',
    icon: '🕳️',
    hotkey: 'Y'
  },
  ultralisk_cavern: {
    name: 'Ultralisk Cavern',
    race: 'zerg',
    costMinerals: 150,
    costGas: 200,
    buildTime: 46,
    supplyProvided: 0,
    maxHealth: 850,
    armor: 1,
    sightRange: 8,
    footprint: { width: 3, height: 3 },
    produces: [],
    prerequisite: 'hive',
    description: 'Chitin cavern (needs a Hive). Unlocks Ultralisks and Chitinous Plating.',
    icon: '🦏',
    hotkey: 'K'
  },
  spore_crawler: {
    name: 'Spore Crawler',
    race: 'zerg',
    costMinerals: 75,
    costGas: 0,
    buildTime: 21,
    supplyProvided: 0,
    maxHealth: 400,
    armor: 1,
    sightRange: 10,
    footprint: { width: 2, height: 2 },
    produces: [],
    prerequisite: 'spawning_pool',
    attackRange: 7,
    damage: 15,
    attackSpeed: 1.64,
    canTargetAir: true,
    canTargetGround: false,
    bonusDamage: { type: 'biological', amount: 15 },
    description: 'Anti-air defensive colony. Spits spores at airborne attackers.',
    icon: '🍄',
    hotkey: 'S'
  },
  cybernetics_core: {
    name: 'Cybernetics Core',
    race: 'protoss',
    costMinerals: 150,
    costGas: 0,
    buildTime: 36,
    supplyProvided: 0,
    maxHealth: 550,
    armor: 1,
    sightRange: 9,
    footprint: { width: 3, height: 3 },
    produces: [],
    prerequisite: 'gateway',
    description: 'Warp-tech core. Unlocks Stalkers, Sentries and Adepts, the Stargate, Twilight Council and Robotics Facility; researches air weapons and armor.',
    icon: '🧠',
    hotkey: 'Y'
  },
  twilight_council: {
    name: 'Twilight Council',
    race: 'protoss',
    costMinerals: 150,
    costGas: 100,
    buildTime: 36,
    supplyProvided: 0,
    maxHealth: 500,
    armor: 1,
    sightRange: 9,
    footprint: { width: 3, height: 3 },
    produces: [],
    prerequisite: 'cybernetics_core',
    description: 'Council of the twilight. Researches Charge, Blink and Resonating Glaives; unlocks the Templar Archives and Dark Shrine.',
    icon: '🌆',
    hotkey: 'C'
  },
  robotics_facility: {
    name: 'Robotics Facility',
    race: 'protoss',
    costMinerals: 150,
    costGas: 100,
    buildTime: 46,
    supplyProvided: 0,
    maxHealth: 450,
    armor: 1,
    sightRange: 9,
    footprint: { width: 3, height: 3 },
    produces: ['observer', 'warp_prism', 'immortal', 'colossus', 'disruptor'],
    prerequisite: 'cybernetics_core',
    description: 'Robotics foundry. Builds Immortals, and Colossi once a Robotics Bay stands.',
    icon: '🤖',
    hotkey: 'O'
  },
  robotics_bay: {
    name: 'Robotics Bay',
    race: 'protoss',
    costMinerals: 150,
    costGas: 150,
    buildTime: 46,
    supplyProvided: 0,
    maxHealth: 450,
    armor: 1,
    sightRange: 9,
    footprint: { width: 3, height: 3 },
    produces: [],
    prerequisite: 'robotics_facility',
    description: 'Robotics bay. Unlocks Colossi and researches Extended Thermal Lance.',
    icon: '🛠️',
    hotkey: 'U'
  },
  templar_archives: {
    name: 'Templar Archives',
    race: 'protoss',
    costMinerals: 150,
    costGas: 200,
    buildTime: 36,
    supplyProvided: 0,
    maxHealth: 500,
    armor: 1,
    sightRange: 9,
    footprint: { width: 3, height: 3 },
    produces: [],
    prerequisite: 'twilight_council',
    description: 'Archive of the High Templar. Unlocks Archons.',
    icon: '📜',
    hotkey: 'A'
  },
  dark_shrine: {
    name: 'Dark Shrine',
    race: 'protoss',
    costMinerals: 100,
    costGas: 250,
    buildTime: 71,
    supplyProvided: 0,
    maxHealth: 500,
    armor: 1,
    sightRange: 9,
    footprint: { width: 2, height: 2 },
    produces: [],
    prerequisite: 'twilight_council',
    description: 'Shrine of the Dark Templar. Unlocks cloaked Dark Templar at the Gateway.',
    icon: '🌑',
    hotkey: 'K'
  },
  fleet_beacon: {
    name: 'Fleet Beacon',
    race: 'protoss',
    costMinerals: 300,
    costGas: 200,
    buildTime: 43,
    supplyProvided: 0,
    maxHealth: 500,
    armor: 1,
    sightRange: 9,
    footprint: { width: 3, height: 3 },
    produces: [],
    prerequisite: 'stargate',
    description: 'Fleet beacon. Unlocks Carriers and Tempests.',
    icon: '📡',
    hotkey: 'L'
  },
  shield_battery: {
    name: 'Shield Battery',
    race: 'protoss',
    costMinerals: 100,
    costGas: 0,
    buildTime: 29,
    supplyProvided: 0,
    maxHealth: 150,
    armor: 1,
    sightRange: 9,
    footprint: { width: 2, height: 2 },
    produces: [],
    prerequisite: 'cybernetics_core',
    description: 'Restores shields to nearby structures and units.',
    icon: '🔋',
    hotkey: 'H'
  },
  creep_tumor: {
    name: 'Creep Tumor',
    race: 'zerg',
    costMinerals: 0,
    costGas: 0,
    buildTime: 11,
    supplyProvided: 0,
    maxHealth: 50,
    armor: 0,
    sightRange: 10,
    footprint: { width: 1, height: 1 },
    produces: [],
    description: 'Burrowed creep source (invisible without detection). Spreads creep out to range 10 and can seed one more tumor.',
    icon: '🟣',
    hotkey: 'T'
  },
  nydus_worm: {
    name: 'Nydus Worm',
    race: 'zerg',
    costMinerals: 75,
    costGas: 75,
    buildTime: 14,
    supplyProvided: 0,
    maxHealth: 300,
    armor: 1,
    sightRange: 10,
    footprint: { width: 2, height: 2 },
    produces: [],
    description: 'Surfaces anywhere from a Nydus Network. Right-click it with units to travel to the other Nydus structure.',
    icon: '🪱',
    hotkey: 'W'
  },
  stargate: {
    name: 'Stargate',
    race: 'protoss',
    costMinerals: 150,
    costGas: 100,
    buildTime: 45,
    supplyProvided: 0,
    maxHealth: 1200,
    armor: 1,
    sightRange: 10,
    footprint: { width: 3, height: 3 },
    produces: ['phoenix', 'oracle', 'void_ray', 'carrier', 'tempest'],
    prerequisite: 'cybernetics_core',
    description: 'Orbital warp beacon. Warps in Prismatic Void Ray capital cruisers.',
    icon: '🌌',
    hotkey: 'S'
  },
};

export interface CampaignMissionDef {
  id: number;
  act: string;
  title: string;
  subtitle: string;
  playerFaction: FactionType;
  enemyFaction: FactionType;
  mapId: MapId;
  difficulty: DifficultyLevel;
  startingMinerals: number;
  startingGas: number;
  objectiveText: string;
  briefing: string;
  /** Extra pre-built structures for the player, positioned relative to the main base. */
  startingBuildings?: { type: BuildingType; dx: number; dy: number }[];
  /** Extra units the player starts with (supply is accounted for automatically). */
  startingUnits?: { type: UnitType; count: number }[];
  /** Full-screen cinematic played before the mission starts. */
  cinematic?: 'smith_outpost';
  /** Banshee fly-in (in-engine) played before the mission starts. */
  intro?: 'banshee';
}

export const CAMPAIGN_MISSIONS: CampaignMissionDef[] = [
  {
    id: 1,
    act: 'ACT I — BLUE VANGUARD',
    title: 'Outpost 42069',
    subtitle: 'Terran Vanguard vs. The Ahole Virus',
    playerFaction: 'terran',
    enemyFaction: 'zerg',
    mapId: 'sector_vanguard',
    difficulty: 'normal',
    startingMinerals: 250,
    startingGas: 0,
    cinematic: 'smith_outpost',
    objectiveText: 'Neutralize Colonel Smith',
    briefing: 'Colonel Smith has gone haywire and started slapping everyone. Your mission is to neutralize the threat.'
  },
  {
    id: 2,
    act: 'ACT II — PURPLE OUTLANDS',
    title: 'Bio-Swarm Awakening',
    subtitle: 'Play as Zerg Swarm vs. Terran Bastion',
    playerFaction: 'zerg',
    enemyFaction: 'terran',
    mapId: 'obsidian_rift',
    difficulty: 'normal',
    startingMinerals: 300,
    startingGas: 50,
    startingBuildings: [
      { type: 'spawning_pool', dx: 11, dy: -3 },
      { type: 'hydralisk_den', dx: 10, dy: 3 }
    ],
    startingUnits: [{ type: 'hydralisk', count: 3 }],
    objectiveText: 'Command the Zerg Swarm across Obsidian Rift & Overrun the Terran Fortress',
    briefing: 'Take direct command of the Purple Outlands Hive Cluster. Your Spawning Pool and Hydralisk Den are already online with three Hydralisks to counter Terran air raids. Spread Creep, morph Zerglings, Roaches, Hydralisks, and Mutalisks, and crush the Terran defense line.'
  },
  {
    id: 3,
    act: 'ACT III — RED SOLARIS',
    title: 'Solaris Convergence',
    subtitle: 'Play as Protoss Solaris vs. Grandmaster Coalition',
    playerFaction: 'protoss',
    enemyFaction: 'zerg',
    mapId: 'crystalline_oasis',
    difficulty: 'hard',
    startingMinerals: 350,
    startingGas: 100,
    objectiveText: 'Warp in the Red Solaris Armada & Claim the Crystalline Sanctuary',
    briefing: 'Command the cybernetic Solaris Collective. Warp in Psionic Pylons, Gateways, Photon Cannons, Phase Stalkers, and Prismatic Void Rays to dominate the sector.'
  },
  {
    id: 4,
    act: 'ACT IV — BLUE VANGUARD',
    title: 'Outlands Frontier',
    subtitle: 'Terran Vanguard vs. Zerg Bio-Swarm',
    playerFaction: 'terran',
    enemyFaction: 'zerg',
    mapId: 'sector_vanguard',
    difficulty: 'normal',
    intro: 'banshee',
    startingMinerals: 250,
    startingGas: 0,
    objectiveText: 'Fortify the SW High-Ground Plateau & Purge the Zerg Hive Cluster in the Far Southeast',
    briefing: 'Banshee-1 has located a spreading Outlands Bio-Swarm in the southeast high ground. Secure your ramp, research upgrades, and eradicate the infestation.'
  }
];

export const MAP_CONFIGS: Record<MapId, {
  id: MapId;
  name: string;
  subtitle: string;
  description: string;
  centerRichMinerals: boolean;
  centerRichness: number;
  expansionPositions: { x: number; y: number }[];
}> = {
  lost_temple: {
    id: 'lost_temple',
    name: 'Lost Temple (4P Classic, 2x size)',
    subtitle: 'Corner High-Ground Mains & Central Temple Mesas',
    description: 'A StarCraft-classic 240x240 battlefield: four corner high-ground bases with carved ramps, a ring of naturals, and a central temple of four mesas leaving open diagonal lanes.',
    centerRichMinerals: true,
    centerRichness: 2000,
    expansionPositions: [
      { x: 95, y: 45 }, { x: 45, y: 95 }, { x: 145, y: 195 }, { x: 195, y: 145 },
      { x: 45, y: 195 }, { x: 195, y: 45 }, { x: 95, y: 195 }, { x: 195, y: 95 },
      { x: 120, y: 120 }
    ]
  },
  sector_vanguard: {
    id: 'sector_vanguard',
    name: 'Sector Vanguard (2P Standard)',
    subtitle: 'High-Ground Plateaus & Twin Choke Mesas',
    description: 'Balanced competitive 1v1 map featuring elevated corner fortresses, carved diagonal ramps, and a contested center natural expansion.',
    centerRichMinerals: false,
    centerRichness: 1500,
    expansionPositions: [{ x: 60, y: 60 }]
  },
  obsidian_rift: {
    id: 'obsidian_rift',
    name: 'Obsidian Rift (Canyon Choke)',
    subtitle: 'Divided Central Basalt Ridge & Twin Crossings',
    description: 'Tactical siege map where central basalt mesas funnel ground armies into intense choke corridors while flyers contest the skies.',
    centerRichMinerals: true,
    centerRichness: 2400,
    expansionPositions: [{ x: 60, y: 60 }, { x: 28, y: 88 }, { x: 92, y: 32 }]
  },
  crystalline_oasis: {
    id: 'crystalline_oasis',
    name: 'Crystalline Sanctuary (Rich Basin)',
    subtitle: 'High-Yield Mineral Expansions & Open Flanks',
    description: 'Resource-rich macro battlefield with three high-yield central mineral clusters and wide flanking avenues.',
    centerRichMinerals: true,
    centerRichness: 3200,
    expansionPositions: [{ x: 60, y: 60 }, { x: 36, y: 78 }, { x: 84, y: 42 }]
  },
  // data-driven levels (src/levels): every base other than the two starts is an expansion with its own explicit resources
  ...Object.fromEntries(Object.values(LEVELS).map(lv => {
    const starts = new Set(lv.starts.map(st => st.base));
    return [lv.id, {
      id: lv.id, name: lv.name, subtitle: lv.subtitle, description: lv.description,
      centerRichMinerals: true, centerRichness: lv.richness ?? 1500,
      expansionPositions: lv.bases.filter((_, i) => !starts.has(i)).map(b => ({ x: b.th[0], y: b.th[1] }))
    }];
  })) as any
};

export const DIFFICULTY_CONFIGS: Record<DifficultyLevel, {
  id: DifficultyLevel;
  name: string;
  thinkInterval: number;
  startingWaveSize: number;
  attackThreshold: number;
  startingBonusMinerals: number;
  waveGrowth: number;
  incomeMultiplier: number;
  badgeColor: string;
}> = {
  easy: {
    id: 'easy',
    name: 'Recruit (Easy)',
    thinkInterval: 1.5,
    startingWaveSize: 5,
    attackThreshold: 5,
    startingBonusMinerals: 150,
    waveGrowth: 2,
    incomeMultiplier: 0.8,
    badgeColor: '#22c55e'
  },
  normal: {
    id: 'normal',
    name: 'Veteran (Normal)',
    thinkInterval: 1.0,
    startingWaveSize: 8,
    attackThreshold: 8,
    startingBonusMinerals: 200,
    waveGrowth: 4,
    incomeMultiplier: 1.0,
    badgeColor: '#38bdf8'
  },
  hard: {
    id: 'hard',
    name: 'Commander (Hard)',
    thinkInterval: 0.72,
    startingWaveSize: 10,
    attackThreshold: 10,
    startingBonusMinerals: 300,
    waveGrowth: 5,
    incomeMultiplier: 1.3,
    badgeColor: '#eab308'
  },
  insane: {
    id: 'insane',
    name: 'Grandmaster (Insane)',
    thinkInterval: 0.5,
    startingWaveSize: 12,
    attackThreshold: 12,
    startingBonusMinerals: 450,
    waveGrowth: 6,
    incomeMultiplier: 1.65,
    badgeColor: '#ef4444'
  },
  elite: {
    id: 'elite',
    name: 'Elite',
    thinkInterval: 0.38,
    startingWaveSize: 14,
    attackThreshold: 14,
    startingBonusMinerals: 500,
    waveGrowth: 7,
    incomeMultiplier: 1.8,
    badgeColor: '#f97316'
  },
  cheater: {
    id: 'cheater',
    name: 'Cheater (Vision + Resources)',
    thinkInterval: 0.3,
    startingWaveSize: 16,
    attackThreshold: 16,
    startingBonusMinerals: 800,
    waveGrowth: 8,
    incomeMultiplier: 2.4,
    badgeColor: '#d946ef'
  }
};

// ---------------------------------------------------------------------------
// Faction tech tables (drive the worker build menus, hotkeys, research building
// and unit production gating for every playable faction)
// ---------------------------------------------------------------------------
export interface FactionTech {
  name: string;
  color: string;
  worker: UnitType;
  townHall: BuildingType;
  supplyBuilding: BuildingType;
  gasBuilding: BuildingType;
  upgradeBuilding: BuildingType;
  basicBuild: BuildingType[];
  advancedBuild: BuildingType[];
  blurb: string;
}

export const FACTION_TECH: Record<FactionType, FactionTech> = {
  terran: {
    name: 'Terran Vanguard',
    color: '#38bdf8',
    worker: 'scv',
    townHall: 'command_center',
    supplyBuilding: 'supply_depot',
    gasBuilding: 'refinery',
    upgradeBuilding: 'engineering_bay',
    basicBuild: ['supply_depot', 'barracks', 'refinery', 'engineering_bay', 'bunker', 'missile_turret', 'sensor_tower'],
    advancedBuild: ['factory', 'starport', 'armory', 'ghost_academy', 'fusion_core'],
    blurb: 'Versatile marines, siege tanks and Banshee gunships backed by fortified high-ground defenses.'
  },
  zerg: {
    name: 'Zerg Outlands',
    color: '#a855f7',
    worker: 'drone',
    townHall: 'hatchery',
    supplyBuilding: 'overlord_pod',
    gasBuilding: 'extractor',
    upgradeBuilding: 'evolution_chamber',
    basicBuild: ['overlord_pod', 'spawning_pool', 'extractor', 'roach_warren', 'hydralisk_den', 'spine_crawler', 'spore_crawler', 'baneling_nest', 'evolution_chamber'],
    advancedBuild: ['hatchery', 'infestation_pit', 'lurker_den', 'spire', 'nydus_network', 'ultralisk_cavern'],
    blurb: 'Cheap, fast swarm units that move quicker on creep. Overwhelm the enemy with numbers.'
  },
  protoss: {
    name: 'Protoss Solaris',
    color: '#ef4444',
    worker: 'probe',
    townHall: 'nexus',
    supplyBuilding: 'pylon',
    gasBuilding: 'assimilator',
    upgradeBuilding: 'forge',
    basicBuild: ['pylon', 'gateway', 'assimilator', 'forge', 'photon_cannon', 'cybernetics_core', 'shield_battery'],
    advancedBuild: ['stargate', 'nexus', 'twilight_council', 'robotics_facility', 'robotics_bay', 'templar_archives', 'dark_shrine', 'fleet_beacon'],
    blurb: 'Elite, expensive plasma-shielded warriors and Prismatic Void Ray capital ships.'
  }
};

/** SC2 Zerg passive regeneration: 0.2734 HP per Normal-speed second = 0.38 per Faster second, for every Zerg unit and structure (structures regenerate once finished, on or off creep). */
/** SC2 acceleration per Normal-second² for every unit that has a real (non-instant) one; anything missing, and the 1000 ones (marine, zealot, roach...), reach full speed at once.
 *  Game time runs at Faster (x1.4), so the in-game value is x1.4². Void Ray / Observer upgrade values (Flux Vanes, Gravitic Boosters) are not modelled. */
export const UNIT_ACCELERATION: Partial<Record<UnitType, number>> = {
  scv: 2.5, mule: 2.5, probe: 2.5, drone: 2.5,
  viking: 3.25, medivac: 2.25, banshee: 3.25,
  void_ray: 2.8, overseer: 2.5, mutalisk: 3.25, corruptor: 4.2, broodlord: 1.063, viper: 3.0,
};
const FASTER_SQ = 1.4 * 1.4;
/** In-game acceleration (units per Faster-second²) of a unit type, or Infinity when it reaches full speed instantly */
export function unitAcceleration(t: string): number {
  const a = (UNIT_ACCELERATION as Record<string, number | undefined>)[t];
  return a === undefined ? Infinity : a * FASTER_SQ;
}
export const ZERG_REGEN_RATE = 0.2734 * 1.4;
/** A burrowed Roach regenerates 5 HP per Normal second (7 per Faster second) in total, replacing the base rate. */
export const ROACH_BURROW_REGEN_RATE = 7;

/** SC2 (LotV, Faster game seconds): shields start regenerating after 7 s without taking damage (10 s at Normal speed), at 2 shields/s. */
export const SHIELD_REGEN_DELAY = 7;
export const SHIELD_REGEN_RATE = 2;

/** Protoss shield points (regenerate after SHIELD_REGEN_DELAY s out of combat). Shield armor comes from the Forge upgrade. */
export const SHIELD_POINTS: Partial<Record<string, number>> = {
  probe: 20, zealot: 50, stalker: 80, sentry: 40, archon: 350, high_templar: 40, void_ray: 100,
  immortal: 100, colossus: 100, carrier: 150, tempest: 100, adept: 70, dark_templar: 80,
  observer: 20, warp_prism: 100, disruptor: 100, phoenix: 60, oracle: 60, mothership: 350,
  cybernetics_core: 550, twilight_council: 500, robotics_facility: 450, robotics_bay: 450, templar_archives: 500, dark_shrine: 500, fleet_beacon: 500, shield_battery: 150,
  nexus: 1000, pylon: 200, gateway: 500, forge: 400, stargate: 600, photon_cannon: 150, assimilator: 150
};

export const WORKER_TYPES: UnitType[] = ['scv', 'drone', 'probe'];
export const TOWN_HALL_TYPES: BuildingType[] = ['command_center', 'hatchery', 'nexus'];

export function isWorkerType(t: string): boolean {
  return t === 'scv' || t === 'drone' || t === 'probe';
}
export function isTownHallType(t: string): boolean {
  return t === 'command_center' || t === 'orbital_command' || t === 'planetary_fortress' || t === 'hatchery' || t === 'nexus';
}

/**
 * Unit sets: which units the production menus offer. Legacy and campaign-only units stay registered in UNIT_CONFIGS (models,
 * sounds, logic) so any set, mission or custom mode can switch them back on.
 *  - multiplayer: current SC2 ladder (Legacy of the Void) roster. Default for skirmish and online games.
 *  - campaign:    everything the campaign missions use, incl. Wings of Liberty units (Firebat, Medic, Goliath, Wraith...).
 *  - everything:  every unit in the game (sandbox).
 */
export type UnitSetId = 'multiplayer' | 'campaign' | 'everything';
export const UNIT_SETS: Record<UnitSetId, { name: string; desc: string; hidden: ReadonlySet<string> }> = {
  multiplayer: {
    name: 'SC2 Multiplayer',
    desc: 'Current StarCraft II ladder units only.',
    hidden: new Set(['firebat', 'medic', 'goliath', 'wraith', 'odin', 'vulture', 'nova', 'civilian', 'dominion_transport']),
  },
  campaign: {
    name: 'SC2 Campaign',
    desc: 'Wings of Liberty campaign units, including Firebat, Medic, Goliath and Wraith.',
    hidden: new Set([]),
  },
  everything: {
    name: 'Everything',
    desc: 'Every unit in the game.',
    hidden: new Set([]),
  },
};
/** Default set for a game mode: campaign missions get the campaign roster, every other mode the ladder roster. */
export function defaultUnitSet(mode: string): UnitSetId {
  return mode === 'campaign' ? 'campaign' : 'multiplayer';
}
export function unitInSet(set: UnitSetId, unitType: string): boolean {
  return !UNIT_SETS[set].hidden.has(unitType);
}

/** Building a human player must own (constructed) before a unit can be produced. */
export const UNIT_TECH_REQUIREMENT: Partial<Record<UnitType, BuildingType>> = {
  hellion: 'factory',
  thor: 'armory',
  widow_mine: 'factory',
  goliath: 'armory',
  queen: 'spawning_pool',
  zergling: 'spawning_pool',
  roach: 'roach_warren',
  hydralisk: 'hydralisk_den',
  mutalisk: 'spire',
  baneling: 'baneling_nest', // morph from Zergling
  ravager: 'roach_warren',
  ultralisk: 'ultralisk_cavern',
  broodlord: 'greater_spire',
  viper: 'hive',
  swarm_host: 'infestation_pit',
  odin: 'armory',
  immortal: 'robotics_facility',
  colossus: 'robotics_bay',
  carrier: 'fleet_beacon',
  tempest: 'fleet_beacon',
  viking: 'starport',
  lurker: 'lurker_den',
  stalker: 'cybernetics_core',
  sentry: 'cybernetics_core',
  adept: 'cybernetics_core',
  high_templar: 'templar_archives',
  overseer: 'lair',
  corruptor: 'spire',
  dark_templar: 'dark_shrine',
  ghost: 'ghost_academy',
  battlecruiser: 'fusion_core',
  hellbat: 'armory',
  disruptor: 'robotics_bay',
  mothership: 'fleet_beacon',
  infestor: 'infestation_pit'
};

/** Units that need an attached Tech Lab on the producing Barracks / Factory / Starport (SC2). */
export const TECHLAB_UNITS: ReadonlySet<string> = new Set(['marauder', 'ghost', 'siege_tank', 'thor', 'banshee', 'cyclone', 'odin', 'raven', 'battlecruiser']);

/** Buildings whose prerequisite is satisfied by an equivalent variant. */
export function prerequisiteMatches(required: BuildingType, owned: BuildingType): boolean {
  if (required === owned) return true;
  if (required === 'supply_depot' && owned === 'supply_depot_lowered') return true;
  if (required === 'command_center' && (owned === 'orbital_command' || owned === 'planetary_fortress')) return true;
  if (required === 'spire' && owned === 'greater_spire') return true;
  if (required === 'lair' && owned === 'hive') return true;
  return false;
}


/** One-shot research (SC2 tech upgrades). Cost is paid up front; the effect is applied by GameWorld.researchUpgrade. */
/** `parent`: for Tech Lab research, the production structure the Tech Lab must be attached to (SC2: Barracks / Factory / Starport Tech Labs research different things). */
export interface ResearchDef { id: UpgradeType; name: string; icon: string; hotkey: string; minerals: number; gas: number; time: number; building: BuildingType; desc: string; req?: BuildingType; parent?: BuildingType }
export const RESEARCH: ResearchDef[] = [
  { id: 'metabolic_boost', name: 'Metabolic Boost', icon: '💨', hotkey: 'M', minerals: 100, gas: 100, time: 79, building: 'spawning_pool', desc: 'Zerglings move 60% faster.' },
  { id: 'centrifugal_hooks', name: 'Centrifugal Hooks', icon: '🪝', hotkey: 'C', minerals: 150, gas: 150, time: 79, building: 'baneling_nest', desc: 'Banelings move 25% faster.' },
  { id: 'chitinous_plating', name: 'Chitinous Plating', icon: '🛡️', hotkey: 'C', minerals: 150, gas: 150, time: 79, building: 'ultralisk_cavern', desc: 'Ultralisks gain +2 armor.' },
  { id: 'charge', name: 'Charge', icon: '⚡', hotkey: 'C', minerals: 100, gas: 100, time: 100, building: 'twilight_council', desc: 'Zealots move 30% faster.' },
  { id: 'blink_tech', name: 'Blink', icon: '✨', hotkey: 'B', minerals: 150, gas: 150, time: 121, building: 'twilight_council', desc: 'Stalkers can Blink.' },
  { id: 'resonating_glaives', name: 'Resonating Glaives', icon: '🌀', hotkey: 'G', minerals: 100, gas: 100, time: 100, building: 'twilight_council', desc: 'Adepts attack 45% faster.' },
  { id: 'warp_gate', name: 'Warp Gate Research', icon: '🌀', hotkey: 'W', minerals: 50, gas: 50, time: 100, building: 'cybernetics_core', desc: 'Gateways transform into Warp Gates: units warp in at Pylon power fields with a shared cooldown.' },
  { id: 'psionic_storm', name: 'Psionic Storm', icon: '🌩️', hotkey: 'T', minerals: 200, gas: 200, time: 79, building: 'templar_archives', desc: 'High Templar can cast Psionic Storm.' },
  { id: 'grooved_spines', name: 'Grooved Spines', icon: '🦴', hotkey: 'G', minerals: 100, gas: 100, time: 50, building: 'hydralisk_den', desc: 'Hydralisks gain +1 attack range (5 -> 6).' },
  { id: 'seismic_spines', name: 'Seismic Spines', icon: '📏', hotkey: 'S', minerals: 150, gas: 150, time: 57, building: 'lurker_den', req: 'hive', desc: 'Lurkers gain +2 attack range (needs a Hive).' },
  { id: 'drilling_claws', name: 'Drilling Claws', icon: '⛏️', hotkey: 'C', minerals: 75, gas: 75, time: 79, building: 'techlab', parent: 'factory', req: 'armory', desc: 'Widow Mines burrow 3x faster (0.71s) and unburrow 2x faster, and stay cloaked while reloading (needs an Armory).' },
  { id: 'smart_servos', name: 'Smart Servos', icon: '⚙️', hotkey: 'S', minerals: 100, gas: 100, time: 79, building: 'techlab', parent: 'factory', req: 'armory', desc: 'Thors and Vikings transform quickly between combat modes: Thor 1.8s -> 0.71s, Viking 1.85s -> 1.13s (needs an Armory).' },
  { id: 'thermal_lance', name: 'Extended Thermal Lance', icon: '🔥', hotkey: 'E', minerals: 150, gas: 150, time: 100, building: 'robotics_bay', desc: 'Colossi gain +2 attack range.' }
];

/** The structure that hosts a given research for a faction (weapons/armor live in different buildings per race in SC2). */
export function researchHost(type: UpgradeType, faction: FactionType): BuildingType {
  const tech = RESEARCH.find(r => r.id === type);
  if (tech) return tech.building;
  if (type === 'combat_shields') return 'techlab'; // SC2: Barracks Tech Lab
  if (type === 'ship_weapons' || type === 'ship_armor') return faction === 'zerg' ? 'spire' : faction === 'protoss' ? 'cybernetics_core' : 'armory';
  if (type === 'vehicle_weapons' || type === 'vehicle_armor') return 'armory';
  return FACTION_TECH[faction].upgradeBuilding;
}


/** For research hosted on a Tech Lab: the structure the Tech Lab must be attached to, else undefined. */
export function techlabParentFor(type: UpgradeType): BuildingType | undefined {
  if (type === 'combat_shields') return 'barracks';
  return RESEARCH.find(r => r.id === type)?.parent;
}

/** Level-based upgrade lines: cost and research time per level, per race (SC2 LotV). Times in game seconds ("faster"). */
export interface LevelCost { minerals: number; gas: number; time: number }
const L3 = (a: [number, number, number], b: [number, number, number], c: [number, number, number]): LevelCost[] => [a, b, c].map(([minerals, gas, time]) => ({ minerals, gas, time }));
export const UPGRADE_LEVELS: Record<string, Partial<Record<FactionType, { name: string; levels: LevelCost[] }>>> = {
  weapons: {
    terran: { name: 'Infantry Weapons', levels: L3([100, 100, 114], [175, 175, 136], [250, 250, 157]) },
    protoss: { name: 'Ground Weapons', levels: L3([100, 100, 129], [150, 150, 154], [200, 200, 179]) }
  },
  melee_attacks: { zerg: { name: 'Melee Attacks', levels: L3([100, 100, 114], [150, 150, 136], [200, 200, 157]) } },
  missile_attacks: { zerg: { name: 'Missile Attacks', levels: L3([100, 100, 114], [150, 150, 136], [200, 200, 157]) } },
  armor: {
    terran: { name: 'Infantry Armor', levels: L3([100, 100, 114], [175, 175, 136], [250, 250, 157]) },
    zerg: { name: 'Carapace', levels: L3([150, 150, 114], [225, 225, 136], [300, 300, 157]) },
    protoss: { name: 'Ground Armor', levels: L3([100, 100, 129], [150, 150, 154], [200, 200, 179]) }
  },
  vehicle_weapons: { terran: { name: 'Vehicle Weapons', levels: L3([100, 100, 114], [175, 175, 136], [250, 250, 157]) } },
  vehicle_armor: { terran: { name: 'Vehicle Plating', levels: L3([100, 100, 114], [175, 175, 136], [250, 250, 157]) } },
  ship_weapons: {
    terran: { name: 'Ship Weapons', levels: L3([100, 100, 114], [175, 175, 136], [250, 250, 157]) },
    zerg: { name: 'Flyer Attacks', levels: L3([100, 100, 114], [175, 175, 136], [250, 250, 157]) },
    protoss: { name: 'Air Weapons', levels: L3([100, 100, 129], [175, 175, 154], [250, 250, 179]) }
  },
  ship_armor: {
    terran: { name: 'Ship Plating', levels: L3([150, 150, 114], [225, 225, 136], [300, 300, 157]) },
    zerg: { name: 'Flyer Carapace', levels: L3([150, 150, 114], [225, 225, 136], [300, 300, 157]) },
    protoss: { name: 'Air Armor', levels: L3([150, 150, 129], [225, 225, 154], [300, 300, 179]) }
  },
  shield_upgrade: { protoss: { name: 'Shields', levels: L3([150, 150, 129], [225, 225, 154], [300, 300, 179]) } }
};


/** In-place unit morphs (SC2): the source unit becomes a helpless cocoon for `time` seconds, then the new unit takes its place. */
export interface UnitMorphDef { from: UnitType; to: UnitType; minerals: number; gas: number; time: number; need: BuildingType; name: string; icon: string; hotkey: string; desc: string }
export const UNIT_MORPHS: UnitMorphDef[] = [
  { from: 'overlord', to: 'overseer', minerals: 50, gas: 50, time: 12, need: 'lair', name: 'Morph to Overseer', icon: '👁️', hotkey: 'V', desc: 'Overseer: fast flying detector (50/50, 12s, needs a Lair).' },
  { from: 'hydralisk', to: 'lurker', minerals: 50, gas: 100, time: 18, need: 'lurker_den', name: 'Morph to Lurker', icon: '🦂', hotkey: 'L', desc: 'Lurker: burrowed siege striker (50/100, 18s, +1 supply, needs a Lurker Den).' },
  { from: 'zergling', to: 'baneling', minerals: 25, gas: 25, time: 14, need: 'baneling_nest', name: 'Morph to Baneling', icon: '💥', hotkey: 'B', desc: 'Baneling: suicide splash attacker (25/25, 14s, needs a Baneling Nest).' },
  { from: 'roach', to: 'ravager', minerals: 25, gas: 75, time: 9, need: 'roach_warren', name: 'Morph to Ravager', icon: '☄️', hotkey: 'V', desc: 'Ravager: long-range acid artillery (25/75, 9s).' },
  { from: 'corruptor', to: 'broodlord', minerals: 150, gas: 150, time: 24, need: 'greater_spire', name: 'Morph to Brood Lord', icon: '🪽', hotkey: 'B', desc: 'Brood Lord: long-range siege flyer (150/150, 24s, needs a Greater Spire).' }
];
