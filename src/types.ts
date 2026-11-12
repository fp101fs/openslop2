export type PlayerId = 'player' | 'enemy';

export type FactionType = 'terran' | 'zerg' | 'protoss';

export type MapId = 'sector_vanguard' | 'obsidian_rift' | 'crystalline_oasis' | 'lost_temple' | 'alien_planet' | 'sandstone_gulch' | 'crater_city' | 'olive_meadows' | 'glacial_rift' | 'moss_ruins' | 'mire_river' | 'sunken_city';

export type DifficultyLevel = 'easy' | 'normal' | 'hard' | 'insane' | 'elite' | 'cheater';

export type GameModeType = 'campaign' | 'skirmish' | 'multiplayer_pvp' | 'multiplayer_coop';

export interface MatchConfig {
  mode: GameModeType;
  campaignMissionId?: number;
  /** Pathway campaign (src/campaign): campaign id + mission key. */
  campaignId?: string;
  missionKey?: string;
  playerFaction: FactionType;
  enemyFaction: FactionType;
  mapId: MapId;
  difficulty: DifficultyLevel;
  roomCode?: string;
  /** Multiplayer host: list this game in the public Open Games list (P2P). */
  isPublic?: boolean;
  /** Multiplayer host: name shown in the public Open Games list. */
  gameName?: string;
  isMultiplayerHost?: boolean;
  /** Which starting base the local human has: 'player' (SW) or 'enemy' (NE, the 1v1 PvP guest). The local side is always labelled 'player'. */
  localPlayerSlot?: PlayerId;
  /** Production roster (config.ts UNIT_SETS). Omitted: campaign -> 'campaign', everything else -> 'multiplayer'. */
  unitSet?: 'multiplayer' | 'campaign' | 'everything';
  /** Seed for the simulation's random numbers (src/simulation/Rng.ts). Omitted: a fresh random seed per match. */
  seed?: number;
  /** Online: how the two computers stay in sync (src/net/NetSync.ts). Chosen by the host and sent to the guest. */
  syncMode?: 'lockstep' | 'snapshot';
}

export type UnitType = 
  // Terran (Blue Vanguard)
  | 'scv'
  | 'marine'
  | 'marauder'
  | 'firebat'
  | 'medic'
  | 'siege_tank'
  | 'siege_tank_sieged'
  | 'medivac'
  | 'wraith'
  | 'viking'
  /** Viking in Assault Mode (landed walker; SC2 VikingAssault) */
  | 'viking_assault'
  | 'widow_mine'
  | 'dark_templar'
  | 'auto_turret'
  | 'lurker'
  | 'overseer'
  | 'corruptor'
  | 'high_templar'
  | 'banshee'
  | 'hellion'
  | 'thor'
  /** Thor in High Impact Payload mode (SC2 ThorAP) */
  | 'thor_ap'
  | 'goliath'
  | 'mule'
  | 'ghost'
  | 'nova'
  | 'reaper'
  | 'liberator'
  | 'raven'
  | 'battlecruiser'
  | 'hellbat'
  | 'vulture'
  /** Campaign: armed civilian (Liberation Day). Marine model, molotov throw. */
  | 'civilian'
  /** Campaign: Dominion armoured hover-transport with a roof turret (Liberation Day). */
  | 'dominion_transport'
  | 'cyclone'
  | 'odin'
  // Zerg (Purple Outlands)
  | 'drone'
  | 'larva'
  | 'egg'
  | 'zergling'
  | 'roach'
  | 'hydralisk'
  | 'mutalisk'
  | 'queen'
  | 'baneling'
  | 'ravager'
  | 'ultralisk'
  | 'broodlord'
  | 'viper'
  | 'overlord'
  | 'swarm_host'
  | 'infestor'
  // Protoss (Red Solaris)
  | 'probe'
  | 'zealot'
  | 'stalker'
  | 'archon'
  | 'sentry'
  | 'void_ray'
  | 'immortal'
  | 'colossus'
  | 'carrier'
  | 'tempest'

  | 'adept'
  | 'observer'
  | 'warp_prism'
  | 'disruptor'
  | 'phoenix'
  | 'oracle'
  | 'mothership';

export interface UnitComponentState {
  id: string;
  name: string;
  hp: number;       // 0 to 100
  maxHp: number;    // 100
  consequence: string;
}

export type BuildingType =
  // Campaign: Dominion propaganda billboard (Liberation Day bonus objective). Attackable, does nothing.
  | 'holoboard'
  // Terran
  | 'command_center'
  | 'orbital_command'
  | 'planetary_fortress'
  | 'techlab'
  | 'reactor'
  | 'supply_depot'
  | 'supply_depot_lowered'
  | 'refinery'
  | 'barracks'
  | 'engineering_bay'
  | 'bunker'
  | 'missile_turret'
  | 'factory'
  | 'starport'
  | 'armory'
  | 'fusion_core'
  | 'ghost_academy'
  | 'sensor_tower'
  | 'rocks'
  // Zerg
  | 'hatchery'
  | 'spawning_pool'
  | 'roach_warren'
  | 'hydralisk_den'
  | 'spine_crawler'
  | 'infestation_pit'
  | 'hive'
  | 'lair'
  | 'extractor'
  | 'overlord_pod'
  | 'baneling_nest'
  | 'evolution_chamber'
  | 'lurker_den'
  | 'spire'
  | 'greater_spire'
  | 'nydus_network'
  | 'ultralisk_cavern'
  | 'spore_crawler'
  | 'creep_tumor'
  | 'nydus_worm'
  // Protoss
  | 'nexus'
  | 'pylon'
  | 'assimilator'
  | 'gateway'
  | 'forge'
  | 'photon_cannon'
  | 'stargate'
  | 'cybernetics_core'
  | 'twilight_council'
  | 'robotics_facility'
  | 'robotics_bay'
  | 'templar_archives'
  | 'dark_shrine'
  | 'fleet_beacon'
  | 'shield_battery';

export type UpgradeType =
  | 'weapons'
  | 'melee_attacks'
  | 'missile_attacks'
  | 'armor'
  | 'combat_shields'
  | 'vehicle_weapons'
  | 'vehicle_armor'
  | 'ship_weapons'
  | 'ship_armor'
  | 'shield_upgrade'
  | 'metabolic_boost'
  | 'centrifugal_hooks'
  | 'chitinous_plating'
  | 'charge'
  | 'blink_tech'
  | 'resonating_glaives'
  | 'thermal_lance'
  | 'psionic_storm'
  | 'seismic_spines'
  | 'grooved_spines'
  | 'drilling_claws'
  | 'smart_servos'
  | 'warp_gate';

export type TargetPriorityMode = 'nearest' | 'low_hp' | 'high_threat';
export type EngagementStanceMode = 'standard' | 'stutter_step';
export type SelfPreservationMode = 'none' | 'auto_stim' | 'tactical_retreat';

export interface TacticalDoctrine {
  targetPriority: TargetPriorityMode;
  engagementMode: EngagementStanceMode;
  selfPreservation: SelfPreservationMode;
}

export interface PlayerUpgrades {
  weaponsLevel: number;        // 0..3 (+15% weapon damage per level)
  armorLevel: number;          // 0..3 (+1 armor per level)
  combatShields: boolean;      // +10 Max HP & visible 3D Combat Shield on Marines
  vehicleWeaponsLevel: number; // 0..3 (Armory)
  vehicleArmorLevel: number;   // 0..3 (Armory)
  shipWeaponsLevel: number;    // 0..3 (Armory)
  shipArmorLevel: number;      // 0..3 (Armory)
  shieldLevel: number;         // 0..3 (Forge) +1 shield armor per level
  /** Zerg ground attack lines (Evolution Chamber): melee (Zergling/Baneling/Ultralisk) and missile (everything else on the ground). */
  meleeLevel?: number;
  missileLevel?: number;
  /** One-shot tech researched at Spawning Pool / Baneling Nest / Twilight Council etc. (see RESEARCH in config.ts). */
  techs?: Partial<Record<UpgradeType, boolean>>;
}

export type EntityType = UnitType | BuildingType;

export type ResourceType = 'minerals' | 'vespene';

export type CommandType =
  | 'move'
  | 'attack'
  | 'attack_move'
  | 'stop'
  | 'hold'
  | 'patrol'
  | 'gather'
  | 'return_resources'
  | 'build'
  | 'repair'
  | 'load'
  | 'stim'
  | 'siege'
  | 'unsiege'
  | 'lower_depot'
  | 'raise_depot'
  | 'heal'
  | 'ability';

export interface Vector2D {
  x: number;
  y: number;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface UnitStats {
  name: string;
  race: FactionType;
  costMinerals: number;
  costGas: number;
  buildTime: number; // in seconds
  supplyCost: number;
  maxHealth: number;
  maxEnergy?: number;
  /** Supply this unit adds to its owner's cap while alive (Overlord). */
  supplyProvided?: number;
  armor: number;
  armorType: 'light' | 'armored' | 'massive' | 'biological' | 'mechanical';
  /** Full SC2 attribute list (Light, Armored, Biological, Mechanical, Massive, Psionic); defaults to [armorType]. */
  attributes?: string[];
  speed: number;
  sightRange: number;
  attackRange: number;
  /** Damage per hit (SC2 "damage"); a volley deals it `attackCount` times, armor applied per hit. */
  damage: number;
  bonusDamage?: {
    type: 'light' | 'armored' | 'massive' | 'biological' | 'mechanical';
    amount: number;
  };
  attackSpeed: number; // attacks per second = 1 / SC2 weapon cooldown (Faster)
  attackCount?: number; // hits per volley (Banshee x2, Zealot x2, Thor x2...)
  /** Weapon upgrade bonus per level: base damage, and bonus damage. */
  upgradeDamage?: number;
  upgradeBonus?: number;
  /** Separate weapon used against air targets (Thor, Queen, Wraith). Falls back to the main weapon fields. */
  airWeapon?: {
    damage: number;
    bonusDamage?: { type: 'light' | 'armored' | 'massive' | 'biological' | 'mechanical'; amount: number };
    attackSpeed: number;
    attackRange: number;
    attackCount?: number;
    splashRadius?: number;
    upgradeDamage?: number;
    upgradeBonus?: number;
  };
  minRange?: number; // minimum attack range (sieged tank)
  /** Splash radii for 100% / 50% / 25% damage (SC2 siege tank, etc.). Overrides splashRadius falloff. */
  splashTiers?: [number, number, number];
  splashRadius?: number;
  isFlying?: boolean;
  canTargetAir?: boolean;
  canTargetGround: boolean;
  description: string;
  icon: string;
  hotkey: string;
}

export interface BuildingStats {
  name: string;
  race: FactionType;
  costMinerals: number;
  costGas: number;
  buildTime: number;
  supplyProvided: number;
  maxHealth: number;
  armor: number;
  sightRange: number;
  footprint: { width: number; height: number };
  produces: UnitType[];
  requiresRefineryGeyser?: boolean;
  prerequisite?: BuildingType;
  attackRange?: number;
  damage?: number;
  attackSpeed?: number;
  attackCount?: number;
  bonusDamage?: { type: 'light' | 'armored' | 'massive' | 'biological' | 'mechanical'; amount: number };
  canTargetAir?: boolean;
  canTargetGround?: boolean;
  description: string;
  icon: string;
  hotkey: string;
}

export interface Command {
  type: CommandType;
  targetPos?: Vector2D;
  targetEntityId?: string;
  buildingTypeToConstruct?: BuildingType;
  queued?: boolean;
  abilityId?: string;
}

export interface ProductionItem {
  type: UnitType;
  progress: number; // 0 to 1
  totalTime: number;
  costMinerals: number;
  costGas: number;
}

export interface PlayerResources {
  minerals: number;
  gas: number;
  supply: number;
  maxSupply: number;
}
