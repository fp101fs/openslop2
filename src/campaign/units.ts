import type { UnitStats, UnitType } from '../types';

/** Campaign-only unit stats (Nova Covert Ops / Wings of Liberty). Stats follow SC2 where Liquipedia gives them; (?) marks our estimates. */
export type CampaignUnitType = 'ghost' | 'nova' | 'reaper' | 'liberator' | 'raven' | 'battlecruiser' | 'hellbat' | 'vulture' | 'cyclone' | 'odin' | 'overlord' | 'swarm_host' | 'immortal' | 'colossus' | 'carrier' | 'tempest' | 'adept' | 'civilian' | 'dominion_transport';

export function campaignUnits(base: Record<string, UnitStats>): Record<CampaignUnitType, UnitStats> {
  return {
  ghost: {
    name: 'Ghost', race: 'terran', costMinerals: 150, costGas: 125, buildTime: 29, supplyCost: 2, maxHealth: 100, maxEnergy: 200, armor: 0,
    armorType: 'light', speed: 3.94, sightRange: 11, attackRange: 6, damage: 10, bonusDamage: { type: 'light', amount: 10 }, attackSpeed: 1 / 1.07,
    canTargetAir: true, canTargetGround: true, attributes: ['light', 'biological', 'psionic'], upgradeDamage: 1, upgradeBonus: 1,
    description: 'Covert operative. Snipe, Cloak and Tactical Nuclear Strike.', icon: '👁️', hotkey: 'G'
  },
  nova: {
    name: 'Nova', race: 'terran', costMinerals: 0, costGas: 0, buildTime: 1, supplyCost: 0, maxHealth: 250 /* (?) base life */, maxEnergy: 200, armor: 0,
    armorType: 'light', speed: 3.94, sightRange: 11, attackRange: 7, damage: 30, attackSpeed: 1.5, canTargetAir: true, canTargetGround: true,
    attributes: ['light', 'biological', 'psionic', 'heroic'], upgradeDamage: 0,
    description: 'Agent Nova Terra. Permanently cloaked (Tactical Stealth Suit). Canister Rifle, Snipe, Pulse Grenades, Tactical Nuke.', icon: '🕶️', hotkey: 'N'
  },
  reaper: {
    name: 'Reaper', race: 'terran', costMinerals: 50, costGas: 50, buildTime: 32, supplyCost: 1, maxHealth: 60, armor: 0, armorType: 'light', speed: 5.25,
    sightRange: 9, attackRange: 5, damage: 4, attackSpeed: 1 / 0.79, attackCount: 2, canTargetGround: true,
    attributes: ['light', 'biological'], upgradeDamage: 1, description: 'Fast jump-pack raider. Climbs cliffs and lays Spider Mines.', icon: '🚀', hotkey: 'Q'
  },
  liberator: {
    name: 'Liberator', race: 'terran', costMinerals: 150, costGas: 125, buildTime: 43, supplyCost: 3, maxHealth: 180, armor: 0, armorType: 'armored', speed: 4.72,
    sightRange: 10, attackRange: 10, damage: 75, attackSpeed: 1 / 1.14, isFlying: true, canTargetAir: true, canTargetGround: true,
    attributes: ['armored', 'mechanical'], upgradeDamage: 5,
    airWeapon: { damage: 5, attackCount: 2, attackSpeed: 1 / 1.29, attackRange: 5, upgradeDamage: 1 },
    description: 'Air-superiority gunship. Defender Mode zones punish ground units.', icon: '🛩️', hotkey: 'N'
  },
  raven: {
    name: 'Raven', race: 'terran', costMinerals: 100, costGas: 150, buildTime: 43, supplyCost: 2, maxHealth: 140, maxEnergy: 200, armor: 1, armorType: 'light', speed: 4.13,
    sightRange: 11, attackRange: 0, damage: 0, attackSpeed: 1, isFlying: true, canTargetGround: false, attributes: ['light', 'mechanical'], upgradeDamage: 0,
    description: 'Detector support flyer. Auto-Turrets, Interference Matrix, Spider Mines.', icon: '🤖', hotkey: 'V'
  },
  battlecruiser: {
    name: 'Battlecruiser', race: 'terran', costMinerals: 400, costGas: 300, buildTime: 64, supplyCost: 6, maxHealth: 550, maxEnergy: 200, armor: 3, armorType: 'armored', speed: 2.62,
    sightRange: 12, attackRange: 6, damage: 8, attackSpeed: 1 / 0.16, isFlying: true, canTargetAir: true, canTargetGround: true,
    attributes: ['armored', 'mechanical', 'massive'], upgradeDamage: 1,
    airWeapon: { damage: 5, attackSpeed: 1 / 0.16, attackRange: 6, upgradeDamage: 1 },
    description: 'Capital ship. Yamato Cannon and Tactical Jump.', icon: '🚢', hotkey: 'C'
  },
  // Stats below come from Liquipedia (current Legacy of the Void multiplayer values); attackSpeed is attacks per second (1 / cooldown).
  // Odin has no Liquipedia unit page, so its numbers are my estimates (?). Swarm Host's weapon is a stand-in for its Locusts.
  cyclone: {
    name: 'Cyclone', race: 'terran', costMinerals: 150, costGas: 100, buildTime: 32, supplyCost: 3, maxHealth: 120, armor: 1, armorType: 'armored', speed: 4.725,
    sightRange: 11, attackRange: 5, damage: 18, attackSpeed: 1 / 0.71, canTargetAir: true, canTargetGround: true, attributes: ['armored', 'mechanical'], upgradeDamage: 2,
    description: 'Mobile assault vehicle with a Typhoon Missile Pod that hits ground and air. Needs a Tech Lab.', icon: '🌀', hotkey: 'C'
  },
  odin: {
    name: 'Odin', race: 'terran', costMinerals: 500, costGas: 400, buildTime: 86, supplyCost: 8, maxHealth: 1000 /* (?) */, armor: 2, armorType: 'armored', speed: 2.25,
    sightRange: 12, attackRange: 9, damage: 40, attackSpeed: 0.9, canTargetAir: true, canTargetGround: true, attributes: ['armored', 'mechanical', 'massive'], upgradeDamage: 3,
    airWeapon: { damage: 30, attackCount: 2, attackSpeed: 1.1, attackRange: 11, upgradeDamage: 2 },
    description: 'Colossal assault walker from the Engine of Destruction. Needs an Armory and a Tech Lab. Stats are estimates.', icon: '🗿', hotkey: 'O'
  },
  overlord: {
    name: 'Overlord', race: 'zerg', costMinerals: 100, costGas: 0, buildTime: 18, supplyCost: 0, supplyProvided: 8, maxHealth: 200, armor: 0, armorType: 'armored', speed: 0.897,
    sightRange: 11, attackRange: 0, damage: 0, attackSpeed: 1, isFlying: true, canTargetGround: false, attributes: ['armored', 'biological'], upgradeDamage: 0,
    description: 'Slow flying supply carrier and spotter. Provides 8 supply.', icon: '🎈', hotkey: 'O'
  },
  swarm_host: {
    name: 'Swarm Host', race: 'zerg', costMinerals: 100, costGas: 75, buildTime: 29, supplyCost: 3, maxHealth: 160, armor: 1, armorType: 'armored', speed: 3.15,
    sightRange: 10, attackRange: 3, damage: 10, attackCount: 2, attackSpeed: 1, canTargetGround: true, attributes: ['armored', 'biological'], upgradeDamage: 1,
    description: 'Siege beast that fights through Locusts (modelled as a short-range double strike). Needs an Infestation Pit.', icon: '🪲', hotkey: 'W'
  },
  immortal: {
    name: 'Immortal', race: 'protoss', costMinerals: 250, costGas: 100, buildTime: 39, supplyCost: 4, maxHealth: 200, armor: 1, armorType: 'armored', speed: 3.15,
    sightRange: 9, attackRange: 6, damage: 20, bonusDamage: { type: 'armored', amount: 30 }, attackSpeed: 1 / 1.143, canTargetGround: true, attributes: ['armored', 'mechanical'], upgradeDamage: 2, upgradeBonus: 3,
    description: 'Assault strider; Phase Disruptors shred armored targets. Built at the Robotics Facility.', icon: '🛡️', hotkey: 'I'
  },
  colossus: {
    name: 'Colossus', race: 'protoss', costMinerals: 300, costGas: 200, buildTime: 54, supplyCost: 6, maxHealth: 250, armor: 1, armorType: 'armored', speed: 3.15,
    sightRange: 10, attackRange: 7, damage: 10, attackCount: 2, bonusDamage: { type: 'light', amount: 5 }, attackSpeed: 1 / 1.07, splashRadius: 1.2, canTargetGround: true, attributes: ['armored', 'mechanical', 'massive'], upgradeDamage: 1, upgradeBonus: 1,
    description: 'Battle strider whose Thermal Lances sweep infantry. Built at the Robotics Facility; needs a Robotics Bay.', icon: '🔱', hotkey: 'C'
  },
  carrier: {
    name: 'Carrier', race: 'protoss', costMinerals: 350, costGas: 250, buildTime: 64, supplyCost: 6, maxHealth: 300, armor: 2, armorType: 'armored', speed: 2.62,
    sightRange: 12, attackRange: 8, damage: 5, attackCount: 16 /* 8 Interceptors x 2 hits */, attackSpeed: 1 / 2.14, isFlying: true, canTargetAir: true, canTargetGround: true, attributes: ['armored', 'mechanical', 'massive'], upgradeDamage: 1,
    airWeapon: { damage: 5, attackCount: 16, attackSpeed: 1 / 2.14, attackRange: 8, upgradeDamage: 1 },
    description: 'Capital ship; its Interceptors are modelled as one 8 x 2-hit volley. Built at the Stargate; needs a Fleet Beacon.', icon: '🛸', hotkey: 'C'
  },
  tempest: {
    name: 'Tempest', race: 'protoss', costMinerals: 250, costGas: 175, buildTime: 43, supplyCost: 4, maxHealth: 200, armor: 2, armorType: 'armored', speed: 3.15,
    sightRange: 12, attackRange: 10, damage: 40, attackSpeed: 1 / 2.36, isFlying: true, canTargetAir: true, canTargetGround: true, attributes: ['armored', 'mechanical', 'massive'], upgradeDamage: 4,
    airWeapon: { damage: 30, bonusDamage: { type: 'massive', amount: 22 }, attackSpeed: 1 / 2.36, attackRange: 13, upgradeDamage: 3, upgradeBonus: 2 },
    description: 'Long-range siege flyer: 10 range vs ground, 13 vs air (+22 vs massive). Built at the Stargate; needs a Fleet Beacon.', icon: '🌩️', hotkey: 'T'
  },
  adept: {
    name: 'Adept', race: 'protoss', costMinerals: 100, costGas: 25, buildTime: 30, supplyCost: 2, maxHealth: 70, armor: 1, armorType: 'light', speed: 3.5,
    sightRange: 9, attackRange: 4, damage: 10, bonusDamage: { type: 'light', amount: 12 }, attackSpeed: 1 / 1.61, canTargetGround: true, attributes: ['light', 'biological'], upgradeDamage: 1, upgradeBonus: 1,
    description: 'Ranged skirmisher, deadly against light units.', icon: '🗡️', hotkey: 'D'
  },
  hellbat: {
    ...base.firebat, name: 'Hellbat', costMinerals: 100, costGas: 0, buildTime: 21, maxHealth: 135, damage: 18, // game data: no base bonus (+12 vs light needs Infernal Pre-Igniter, which we do not have)
    armor: 0, armorType: 'light', attributes: ['light', 'biological', 'mechanical'], sightRange: 10, bonusDamage: undefined,
    attackSpeed: 1 / 1.43, attackRange: 2, upgradeDamage: 2, speed: 3.15, hotkey: 'E', description: 'Transformed Hellion. Flame-thrower with splash.'
  },
  vulture: {
    ...base.hellion, name: 'Vulture', costMinerals: 75, costGas: 0, buildTime: 30, maxHealth: 80, damage: 20, attackRange: 5, attackSpeed: 1.25, speed: 5.5,
    splashRadius: 0, description: 'Fast hover-bike skirmisher.'
  },
  // Liberation Day. No source gives these stats: all (?) estimates, flagged UNVERIFIED in the mission file.
  civilian: {
    ...base.marine, name: 'Civilian', costMinerals: 0, buildTime: 1, supplyCost: 0, maxHealth: 40 /* (?) */, armor: 0, damage: 8 /* (?) molotov */, attackRange: 4,
    attackSpeed: 1 / 1.6, splashRadius: 0.8, speed: 3.15, canTargetAir: false, canTargetGround: true, attributes: ['light', 'biological'], upgradeDamage: 0,
    description: 'Armed Mar Sara civilian. Follows Raynor and throws molotov cocktails.', icon: '🔥', hotkey: 'C'
  },
  dominion_transport: {
    ...base.goliath, name: 'Dominion Transport', costMinerals: 0, costGas: 0, buildTime: 1, supplyCost: 0, maxHealth: 250 /* (?) */, armor: 1, armorType: 'armored',
    speed: 2.25, sightRange: 9, attackRange: 6, damage: 12, attackSpeed: 1 / 1.07, canTargetAir: false, canTargetGround: true, airWeapon: undefined,
    attributes: ['armored', 'mechanical'], upgradeDamage: 1, description: 'Armoured Dominion hover-transport with a roof turret.', icon: '🚚', hotkey: 'T'
  }
  } as Record<CampaignUnitType, UnitStats>;
}
