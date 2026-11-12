import { simRandom } from './Rng';
import { Entity } from './Entity';
import { UnitType, PlayerId, Vector2D, Command, ResourceType } from '../types';
import { UNIT_CONFIGS, BUILDING_CONFIGS, MAP_SIZE, isWorkerType, unitAcceleration, ZERG_REGEN_RATE, ROACH_BURROW_REGEN_RATE } from '../config';
import { ProceduralGrassSystem } from '../graphics/ProceduralGrass';
import { MarineAnimator } from '../graphics/MarineAnimator';
import { WraithAnimator } from '../graphics/WraithAnimator';
import { TerranAnimator } from '../graphics/TerranAnimator';
import { muzzleWorldPos } from '../graphics/Muzzles';
import { ZerglingAnimator } from '../graphics/ZerglingAnimator';
import { LAYOUT } from '../maps';
import { RiggedAnimator } from '../graphics/RiggedAnimator';
import { VikingAnimator } from '../graphics/VikingAnimator';
import { IdleAnimator } from '../graphics/IdleAnimator';
import { weaponLevelFor, upgradeClassOf } from './Mechanics';
import * as THREE from 'three';
import { loadUnit, BUNKER_CAPACITY } from './Bunker';
import { tickLarvaUnit } from './Larva';

function normalizeAngle(a: number): number {
  a = a % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function lerpAngle(from: number, to: number, t: number): number {
  const normFrom = normalizeAngle(from);
  const normTo = normalizeAngle(to);
  let diff = normTo - normFrom;
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (diff > Math.PI) diff -= Math.PI * 2;
  return normalizeAngle(normFrom + diff * Math.min(1, Math.max(0, t)));
}

/** Weapon ranges below this are melee: SC2 measures them edge to edge, so reach also depends on both units' sizes. */
const MELEE_RANGE_MAX = 3;
/** SC2 unit radii from the game data (BurnySc2/sc2-techtree data.json). Drives collision, melee reach, selection rings and shadows.
 *  WoL campaign units missing from that data (Firebat, Medic, Wraith, Goliath, Vulture, Odin) are estimates. */
export const UNIT_RADIUS: Record<UnitType, number> = {
  scv: 0.375, marine: 0.375, marauder: 0.5625, firebat: 0.5, medic: 0.375, siege_tank: 0.875, siege_tank_sieged: 0.875,
  medivac: 0.75, wraith: 0.75, viking: 0.75, viking_assault: 0.75, widow_mine: 0.5, dark_templar: 0.375, auto_turret: 1,
  lurker: 0.9375, overseer: 1, corruptor: 0.625, high_templar: 0.375, banshee: 0.75, hellion: 0.625, thor: 1, thor_ap: 1,
  goliath: 0.75, mule: 0.375, ghost: 0.375, nova: 0.375, reaper: 0.375, liberator: 0.75, raven: 0.625, battlecruiser: 1.25,
  hellbat: 0.625, vulture: 0.625, civilian: 0.375, dominion_transport: 1.0, cyclone: 0.75, odin: 1.5, drone: 0.375, larva: 0.125, egg: 0.125, zergling: 0.375,
  roach: 0.5, hydralisk: 0.625, mutalisk: 0.5, queen: 0.875, baneling: 0.375, ravager: 0.75, ultralisk: 1, broodlord: 1,
  viper: 1, overlord: 1, swarm_host: 0.8125, infestor: 0.625, probe: 0.375, zealot: 0.5, stalker: 0.625, archon: 1,
  sentry: 0.5, void_ray: 1, immortal: 0.75, colossus: 1, carrier: 1.25, tempest: 1.125, adept: 0.5, observer: 0.5,
  warp_prism: 0.875, disruptor: 0.625, phoenix: 0.75, oracle: 0.75, mothership: 1.375,
};
/** Largest ground unit radius, so neighbour searches catch every overlap. */
const MAX_GROUND_RADIUS = 1.5;
function reachRadius(e: any): number { return e.radius ?? 0.45; }

/** SC2: only SCVs repair, only Terran structures and Terran mechanical units, never themselves, never enemies. */
export function canRepairTarget(worker: { type: string; id: string; playerId: string }, target: any): boolean {
  if (worker.type !== 'scv' || target === worker || target.id === worker.id || target.isDead) return false;
  if (target.playerId !== worker.playerId) return false;
  if ('isConstructed' in target) return BUILDING_CONFIGS[target.type as keyof typeof BUILDING_CONFIGS]?.race === 'terran';
  return UNIT_CONFIGS[target.type as UnitType]?.race === 'terran' && (target.attrs as string[]).includes('mechanical');
}

export class Unit extends Entity {
  public override type: UnitType;
  public baseSpeed: number;
  public speed: number;
  public attackRange: number;
  public damage: number;
  public bonusDamage?: { type: 'light' | 'armored' | 'massive' | 'biological' | 'mechanical'; amount: number };
  public attackSpeed: number;
  public splashRadius?: number;
  public isFlying: boolean;
  public canTargetAir: boolean;
  public canTargetGround: boolean;

  // Command & State
  private stuckAccum = 0;
  private lastMoveAt = -1;
  /** current speed of a unit with a finite acceleration (ramps from 0 toward `speed`); the others move at `speed` at once */
  public curSpeed = 0;
  private stuckRefX = 0;
  private stuckRefY = 0;
  private escapeTimer = 0;
  private escapeDirX = 0;
  private escapeDirY = 0;
  public currentCommand: Command | null = null;
  /** Campaign hero: suit forbids cloaking. */
  public noCloak = false;
  /** Campaign Nova loadout: enabled ability ids, energy regen multiplier, equipped item ids. */
  public loadoutAbilities: Set<string> | null = null;
  public energyRegenMult = 1;
  public loadoutItems: string[] = [];
  public commandQueue: Command[] = [];
  public attackCooldown: number = 0;
  /** Void Ray beam: the target it is beaming, the last sim time it attacked it, and whether the beam has hit it yet. */
  public beamTargetId: string | null = null;
  public beamBeat = -1;
  public beamFired = false;
  /** Widow Mine: burrow / unburrow in progress (burrowed flips when t runs out). */
  public burrowTransition: { to: boolean; t: number } | null = null;
  /** Widow Mine: current lock-on (the missile launches once the lock has held 1.07s). */
  public mineLock: { targetId: string; at: number; last: number } | null = null;
  public targetEntityId: string | null = null;
  /** Bunker this unit is garrisoned in (it is out of world.units while set). */
  public loadedIn: string | null = null;
  /** Extra weapon range while garrisoned (Bunker +1). */
  public rangeBonus = 0;
  /** Mission-controlled ally (campaign data missions): the player can't select or order it. */
  public scripted = false;
  /** Mission actor nobody auto-targets (a cutscene's runner); scripts can still kill it. */
  public untargetable = false;
  public patrolStart: Vector2D | null = null;
  public patrolEnd: Vector2D | null = null;
  public patrolHeadingToEnd = true;
  private repairDebtM = 0;
  private repairDebtG = 0;

  // Worker Harvesting State (SCV / Drone)
  public isGathering: boolean = false;
  public gatherTimer: number = 0;
  private repairWasConstruction = false; // current repair order began as construction of an unfinished building
  public carriedResourceType: ResourceType | null = null;
  public carriedAmount: number = 0;
  public targetNodeId: string | null = null;
  /** Node this worker is actively mining right now (one worker per node at a time = SC2 saturation). */
  public miningNodeId: string | null = null;

  // Abilities & Status Effects
  public isStimmed: boolean = false;
  public stimTimer: number = 0;

  public isSlowed: boolean = false;
  public slowTimer: number = 0;
  /** Fungal Growth: cannot move while > 0. */
  public rootTimer: number = 0;

  public isTransforming: boolean = false;
  public transformTimer: number = 0;
  public transformToType: UnitType | null = null;
  /** Length of the transform in progress (s) and where a landing Viking touches down (nudged onto pathable ground). */
  public transformTotal = 0;
  public landSpot: Vector2D | null = null;

  // Repair & Construction
  public constructingBuildingId: string | null = null;
  public repairingTargetId: string | null = null;
  public sparkTimer: number = 0;
  public cargoMesh: THREE.Mesh | null = null;
  public constructAngle: number = 0;
  public constructCurrentAngle: number = 0;
  public constructMoveTimer: number = 0;
  public isConstructMoving: boolean = false;
  public constructInitialized: boolean = false;

  // Smooth Building Perimeter Avoidance & Direction Damping State
  public avoidObstacleId: string | null = null;
  public avoidSide: number = 0;
  public avoidTimer: number = 0;
  public smoothDirX: number = 0;
  public smoothDirY: number = 0;

  // Crimson Skies / Ace Combat / IL-2 Flight & Action Physics State
  /** Standard hover height above terrain shared by every flying unit (all races). */
  public static readonly CRUISE_ALTITUDE = 4.6;
  public flightAltitude: number = Unit.CRUISE_ALTITUDE;
  /** When set, flightAltitude eases back to CRUISE_ALTITUDE (e.g. after the cinematic low-flyby). */
  public settleToCruise: boolean = false;
  public flightSpeed: number = 0;
  public velX: number = 0;
  public velY: number = 0;
  public isAfterburning: boolean = false;
  public afterburnerTimer: number = 0;
  public afterburnerCooldown: number = 0;
  public barrelRollTimer: number = 0;
  public barrelRollDir: number = 1;
  public missileAmmo: number = 4;
  public maxMissiles: number = 4;
  public missileRechargeTimer: number = 0;
  public missileCooldown: number = 0;
  public lockedTargetId: string | null = null;
  public lockProgress: number = 0; // 0 to 1 (1 = Ace Combat [LOCKED])
  public selectedWeaponIndex: number = 0; // 0 = Primary Guns/Lasers, 1 = Homing Missiles / Rockets

  /** Larva / Egg bookkeeping (see simulation/Larva.ts). */
  public hatcheryId = '';
  public larvaSlot = -1;
  /** In-place unit morph (Overlord->Overseer, Hydralisk->Lurker, ...): the unit is a helpless cocoon until it finishes. */
  public morph?: { to: UnitType; t: number; total: number; minerals: number; gas: number; supply: number };
  public egg?: { type: UnitType; t: number; total: number; minerals: number; gas: number; supply: number };
  /** Waypoint for a Larva / Egg: where the unit it becomes walks after hatching (a mineral patch makes drones mine it). Survives larva -> egg. */
  public rally?: { x: number; y: number; targetId: string | null };
  /** Guest only: hatch progress 0..1 from the host snapshot. */
  public eggProgress = 0;
  /** Removed without death sound / animation (a hatched egg). */
  public silent = false;

  constructor(
    id: string,
    type: UnitType,
    playerId: PlayerId,
    pos: Vector2D
  ) {
    const config = UNIT_CONFIGS[type];
    super(id, type, playerId, pos, config.maxHealth, config.armor, config.sightRange);
    this.type = type;
    this.attrs = [...(config.attributes ?? [config.armorType])];
    this.baseSpeed = config.speed;
    this.speed = config.speed;
    this.attackRange = Math.max(config.attackRange, config.airWeapon?.attackRange ?? 0);
    this.damage = config.damage;
    this.bonusDamage = config.bonusDamage;
    this.attackSpeed = config.attackSpeed;
    this.splashRadius = config.splashRadius;
    this.isFlying = !!config.isFlying;
    this.canTargetAir = !!config.canTargetAir;
    this.canTargetGround = config.canTargetGround;
    this.radius = UNIT_RADIUS[type] ?? 0.45;

    if (config.maxEnergy) {
      this.maxEnergy = config.maxEnergy;
      this.energy = 50; // Initial SC2 energy
    }

    const groundY = ProceduralGrassSystem.getTerrainHeight(pos.x, pos.y);
    if (this.isFlying) {
      this.height = groundY + Unit.CRUISE_ALTITUDE;
    } else {
      this.height = groundY;
    }
  }

  /** Multiplayer: takes the local player's orders to the network layer (returns true) instead of running them now. */
  public static commandHook: ((unit: Unit, command: Command) => boolean) | null = null;

  public setCommand(command: Command) {
    if (this.type === 'larva' || this.type === 'egg') return; // stationary: they only morph (Larva.ts)
    if (Unit.commandHook?.(this, command)) return;
    // Shift-queued orders append to the queue, unless the unit has nothing meaningful to finish first
    const busy = !!this.currentCommand && this.currentCommand.type !== 'stop' && this.currentCommand.type !== 'hold';
    if (command.queued && busy) {
      if (this.commandQueue.length < 16) this.commandQueue.push(command);
    } else {
      this.currentCommand = command;
      this.commandQueue = [];
      this.targetEntityId = command.targetEntityId || null;

      // Handle worker harvesting & construction state transitions
      if (command.type === 'gather') {
        this.isGathering = true;
        this.targetNodeId = command.targetEntityId || null;
      } else {
        // Any non-gather command (move, repair, stop, hold, attack, patrol) immediately breaks harvesting
        this.isGathering = false;
        this.targetNodeId = null;
        this.miningNodeId = null;
        this.gatherTimer = 0;
        this.sparkTimer = 0;
      }

      if (command.type !== 'repair') {
        this.constructInitialized = false;
        this.isConstructMoving = false;
      }

      if (command.type === 'hold') RiggedAnimator.cast(this);

      if (command.type === 'patrol') {
        this.patrolStart = { x: this.pos.x, y: this.pos.y };
        this.patrolEnd = command.targetPos ? { ...command.targetPos } : null;
        this.patrolHeadingToEnd = true;
      }
    }
  }

  // Trigger Terran Stimpack / Protoss Phase Overdrive / Zerg Adrenal Frenzy
  public activateStimpack(world: any): boolean {
    if (
      this.type !== 'marine' &&
      this.type !== 'marauder' &&
      this.type !== 'zealot' &&
      this.type !== 'stalker' &&
      this.type !== 'zergling' &&
      this.type !== 'hydralisk'
    ) {
      return false;
    }
    if (this.health <= 10) return false; // Cannot kill self with stim
    if (world.shouldRoute?.(this)) {
      world.net.sendAbility(this.id, 'stim');
      return true;
    }

    this.health -= 10;
    this.isStimmed = true;
    this.stimTimer = 11.0; // 11 seconds duration
    world.sound.at(this.pos.x, this.pos.y).playStimpack();
    world.particles.spawnStimAura(this.getPosition3D());
    return true;
  }

  /** SC2 mode switches by hotkey: E = Siege Mode / High Impact Payload / Fighter Mode, D = Tank Mode / Explosive Payload / Assault Mode. */
  public static readonly MODE_SWITCH: Partial<Record<UnitType, { E?: UnitType; D?: UnitType }>> = {
    siege_tank: { E: 'siege_tank_sieged' }, siege_tank_sieged: { D: 'siege_tank' },
    thor: { E: 'thor_ap' }, thor_ap: { D: 'thor' },
    viking: { D: 'viking_assault' }, viking_assault: { E: 'viking' }
  };

  /** Transform time (Liquipedia LotV, "faster" seconds). Smart Servos: Thor 1.79-1.96 -> 0.71, Viking 1.67-2.03 -> 0.95-1.31. */
  public static transformSeconds(from: UnitType, servos: boolean): number {
    if (from === 'siege_tank' || from === 'siege_tank_sieged') return 2.7;
    if (from === 'thor' || from === 'thor_ap') return servos ? 0.71 : 1.8;
    return servos ? 1.13 : 1.85;
  }

  /** Switch mode with the E / D hotkey; false when this unit has no such mode (or is already switching). */
  public transformMode(world: any, key: 'E' | 'D'): boolean {
    const to = Unit.MODE_SWITCH[this.type]?.[key];
    if (!to || this.isTransforming || this.morph || this.loadedIn) return false;
    if (world.shouldRoute?.(this)) {
      world.net.sendAbility(this.id, key === 'E' ? 'mode_e' : 'mode_d');
      return true;
    }
    const servos = !!world.getUpgrades?.(this.playerId)?.techs?.smart_servos;
    const secs = Unit.transformSeconds(this.type, servos);
    this.landSpot = null;
    if (to === 'viking_assault' && world.pathfinding) {
      // can only land on pathable ground: touch down on the nearest open spot, or refuse
      const pf = world.pathfinding;
      if (!pf.isWalkable(this.pos.x, this.pos.y)) {
        const spot = pf.findNearestWalkable({ x: this.pos.x, y: this.pos.y }, 3);
        if (!pf.isWalkable(spot.x, spot.y)) return false;
        this.landSpot = { x: Math.floor(spot.x) + 0.5, y: Math.floor(spot.y) + 0.5 };
      }
    }
    this.isTransforming = true;
    this.transformTimer = secs;
    this.transformTotal = secs;
    this.transformToType = to;
    const at = world.sound?.at(this.pos.x, this.pos.y);
    if (this.type === 'siege_tank' || this.type === 'siege_tank_sieged') {
      RiggedAnimator.transformSiege(this, to === 'siege_tank_sieged', secs);
      at?.playSiegeTransform(to === 'siege_tank_sieged');
    } else if (this.type === 'thor' || this.type === 'thor_ap') {
      RiggedAnimator.transformThor(this, secs);
      at?.playSiegeTransform(to === 'thor_ap');
      world.particles?.spawnTransformSteam?.(this.getPosition3D(), 1.4);
    } else {
      // The Viking counts as an air unit for the whole transformation (lift-off is airborne at once)
      if (to === 'viking') { this.isFlying = true; this.flightAltitude = 0; this.settleToCruise = false; }
      at?.playSiegeTransform(to === 'viking_assault');
      if (to === 'viking') at?.playRocketWhoosh();
    }
    return true;
  }

  // Transform Siege Tank (Tank <-> Siege Mode)
  public toggleSiegeMode(world: any): boolean {
    if (this.type === 'siege_tank') return this.transformMode(world, 'E');
    if (this.type === 'siege_tank_sieged') return this.transformMode(world, 'D');
    return false;
  }

  // Trigger Crimson Skies Afterburner / Speed Boost (Air Units)
  public activateAfterburner(world: any): boolean {
    if (!this.isFlying) return false;
    if (world.shouldRoute?.(this)) {
      world.net.sendAbility(this.id, 'afterburner');
      return true;
    }
    if (this.afterburnerCooldown > 0 || this.isAfterburning) return false;
    if (this.getComponentHp('engine') <= 15) return false;

    this.isAfterburning = true;
    this.afterburnerTimer = 3.2;
    this.afterburnerCooldown = 6.5;
    world.sound.at(this.pos.x, this.pos.y).playRocketWhoosh();
    world.particles.spawnMuzzleFlash(this.getPosition3D(), 0x38bdf8, 0.7);
    return true;
  }

  // Trigger Crimson Skies Evasive Barrel Roll (Air Units)
  public triggerBarrelRoll(dir: number = 1, world?: any): boolean {
    if (!this.isFlying || this.barrelRollTimer > 0) return false;
    this.barrelRollTimer = 0.55;
    this.barrelRollDir = dir >= 0 ? 1 : -1;
    world?.sound?.at(this.pos.x, this.pos.y).playRocketWhoosh();
    return true;
  }

  // Network guest: authoritative state target received from the host (smoothed each frame)
  public netTarget: { x: number; y: number; rot: number } | null = null;

  /**
   * Visual-only update used on a multiplayer guest. The host owns the simulation;
   * here we only smooth toward the last snapshot and drive the cosmetic animators.
   */
  public updatePuppet(dt: number, world: any) {
    if (this.isDead) return;
    if (this.type === 'larva' || this.type === 'egg') { this.pos.x = this.netTarget?.x ?? this.pos.x; this.pos.y = this.netTarget?.y ?? this.pos.y; tickLarvaUnit(world, this, dt, true); return; }
    if (this.netTarget) {
      const k = 1 - Math.exp(-dt * 14);
      const dx = this.netTarget.x - this.pos.x;
      const dy = this.netTarget.y - this.pos.y;
      if (dx * dx + dy * dy > 144) {
        this.pos.x = this.netTarget.x;
        this.pos.y = this.netTarget.y;
      } else {
        this.pos.x += dx * k;
        this.pos.y += dy * k;
      }
      this.rotation = lerpAngle(this.rotation, this.netTarget.rot, Math.min(1, dt * 12));
    }
    const groundY = ProceduralGrassSystem.getTerrainHeight(this.pos.x, this.pos.y);
    this.height = this.isFlying ? groundY + this.flightAltitude : groundY;

    if (this.isStimmed) {
      this.stimTimer -= dt;
      if (this.stimTimer <= 0) this.isStimmed = false;
    }
    if (this.isAfterburning) {
      this.afterburnerTimer -= dt;
      if (this.afterburnerTimer <= 0) this.isAfterburning = false;
    }
    if (this.mesh && this.isFlying) {
      if (this.type === 'wraith') {
        WraithAnimator.updateWraithAnimation(this, dt, world);
      } else if (this.type === 'banshee') {
        const rl = this.mesh.getObjectByName('rotor_l');
        const rr = this.mesh.getObjectByName('rotor_r');
        if (rl) rl.rotation.y += dt * 24;
        if (rr) rr.rotation.y -= dt * 24;
      } else if (this.type === 'mutalisk') {
        const wl = this.mesh.getObjectByName('wing_l');
        const wr = this.mesh.getObjectByName('wing_r');
        const flap = Math.sin(world.gameTime * 11 + this.pos.x) * 0.45;
        if (wl) wl.rotation.z = 0.2 + flap;
        if (wr) wr.rotation.z = -0.2 - flap;
      } else if (this.type === 'void_ray') {
        const core = this.mesh.getObjectByName('rotor_l');
        if (core) {
          core.rotation.z += dt * 4.5;
          core.rotation.y += dt * 2.5;
        }
      }
    }
    if (this.type === 'marine') {
      MarineAnimator.updateMarineAnimation(this, dt, world);
    }
    TerranAnimator.update(this, dt, world);
    ZerglingAnimator.update(this, dt, world);
    RiggedAnimator.update(this, dt, world);
    VikingAnimator.update(this, dt);
  }

  public override update(dt: number, world: any) {
    if (this.isDead) return;

    // SC2 mechanics upkeep: cooldowns, shield regen, MULE lifetime, cloak energy drain
    this.tickStatus(dt);
    if ((this.type === 'larva' || this.type === 'egg') && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + ZERG_REGEN_RATE * dt);
    if (this.type === 'larva' || this.type === 'egg') { tickLarvaUnit(world, this, dt); return; }
    if (this.morph) { this.currentCommand = null; this.commandQueue = []; this.targetEntityId = null; this.updateMeshTransform(); return; }
    if (this.lifespan > 0) {
      this.lifespan -= dt;
      if (this.lifespan <= 0) { this.isDead = true; return; }
    }
    if (this.type === 'nova') { this.cloaked = !this.noCloak; }   // Tactical Stealth Suit: permanently cloaked (Turbojet Jumpsuit sets noCloak)
    else if (this.type === 'wraith' && this.playerId === 'player' && !world.net) {
      this.cloaked = true; this.energy = this.maxEnergy || this.energy;   // the player's Wraith never runs out of energy: permanent cloak
    } else if (this.type === 'observer' || this.type === 'dark_templar') {
      this.cloaked = true;   // permanently cloaked: no energy, never drains
    } else if (this.cloaked) {
      this.energy -= (this.type === 'ghost' ? 1.3 : 0.9) * dt;   // Ghost Cloak drains 1.3 energy/s
      if (this.energy <= 0) { this.energy = 0; this.cloaked = false; }
    }

    // Update 3D terrain elevation
    const groundY = ProceduralGrassSystem.getTerrainHeight(this.pos.x, this.pos.y);
    if (this.settleToCruise && this.isFlying) {
      this.flightAltitude += (Unit.CRUISE_ALTITUDE - this.flightAltitude) * Math.min(1.0, dt * 2.2);
      if (Math.abs(this.flightAltitude - Unit.CRUISE_ALTITUDE) < 0.02) {
        this.flightAltitude = Unit.CRUISE_ALTITUDE;
        this.settleToCruise = false;
      }
    }
    if (!this.isFlying) {
      this.height = groundY;
    } else {
      this.height = groundY + this.flightAltitude;
    }

    // Animate 3D aircraft rotors, afterburners & wings
    if (this.mesh && this.isFlying) {
      if (this.type === 'banshee') {
        const rl = this.mesh.getObjectByName('rotor_l');
        const rr = this.mesh.getObjectByName('rotor_r');
        const rotorMult = this.getComponentHp('rotor') / 100;
        const spin = dt * (18.0 + 10.0 * rotorMult);
        if (rl) rl.rotation.y += spin;
        if (rr) rr.rotation.y -= spin;
      } else if (this.type === 'wraith') {
        WraithAnimator.updateWraithAnimation(this, dt, world);
      } else if (this.type === 'mutalisk') {
        const wl = this.mesh.getObjectByName('wing_l');
        const wr = this.mesh.getObjectByName('wing_r');
        const flap = Math.sin(world.gameTime * 11 + this.pos.x) * 0.45;
        if (wl) wl.rotation.z = 0.2 + flap;
        if (wr) wr.rotation.z = -0.2 - flap;
      } else if (this.type === 'void_ray') {
        const core = this.mesh.getObjectByName('rotor_l');
        if (core) {
          core.rotation.z += dt * 4.5;
          core.rotation.y += dt * 2.5;
        }
      }
    }

    VikingAnimator.update(this, dt); // Fighter / Assault Mode pose, leg walk cycle, Gatling spin

    // 1. Status effects (Stimpack, Afterburner, Barrel Roll, Missile Recharge & Concussive slow)
    if (this.isStimmed) {
      this.stimTimer -= dt;
      if (this.stimTimer <= 0) {
        this.isStimmed = false;
      }
    }

    if (this.isAfterburning) {
      this.afterburnerTimer -= dt;
      if (this.afterburnerTimer <= 0) {
        this.isAfterburning = false;
      }
    }
    if (this.afterburnerCooldown > 0) {
      this.afterburnerCooldown = Math.max(0, this.afterburnerCooldown - dt);
    }

    if (this.barrelRollTimer > 0) {
      this.barrelRollTimer = Math.max(0, this.barrelRollTimer - dt);
      const progress = 1.0 - this.barrelRollTimer / 0.55;
      this.roll = this.barrelRollDir * progress * Math.PI * 2;
    }

    if (this.missileCooldown > 0) {
      this.missileCooldown = Math.max(0, this.missileCooldown - dt);
    }
    if (this.missileAmmo < this.maxMissiles) {
      this.missileRechargeTimer += dt * this.getFireRateMultiplier();
      if (this.missileRechargeTimer >= 3.2) {
        this.missileRechargeTimer = 0;
        this.missileAmmo++;
      }
    }

    if (this.rootTimer > 0) this.rootTimer -= dt;
    if (this.isSlowed) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) {
        this.isSlowed = false;
      }
    }

    // IL-2 Fuel Leak / Critical Component Damage Effects & Smoke Trail
    if (this.getComponentHp('fuel') < 35) {
      this.health = Math.max(1, this.health - 1.1 * dt);
    }
    if (this.hasSmokeDamage()) {
      this.damageSmokeTimer -= dt;
      if (this.damageSmokeTimer <= 0) {
        this.damageSmokeTimer = this.hasCriticalDamage() ? 0.14 : 0.28;
        world.particles.spawnDamageSmoke(this.getPosition3D(), this.hasCriticalDamage());
      }
    }

    // Zerg passive health regeneration (a burrowed Roach regenerates faster; that rate replaces the base one)
    if (UNIT_CONFIGS[this.type]?.race === 'zerg' && this.health < this.maxHealth) {
      const rate = this.type === 'roach' && this.burrowed ? ROACH_BURROW_REGEN_RATE : ZERG_REGEN_RATE;
      this.health = Math.min(this.maxHealth, this.health + rate * dt);
    }

    // Medivac / Wraith / Banshee energy regeneration
    if (this.maxEnergy > 0 && this.energy < this.maxEnergy) {
      this.energy = Math.min(this.maxEnergy, this.energy + 0.7875 * this.energyRegenMult * dt);
    }

    // Calculate effective speed (incorporating IL-2 component damage & Afterburner)
    let currentSpeed = this.baseSpeed * this.getSpeedMultiplier();
    if (this.isStimmed) currentSpeed *= 1.5;
    if (this.isAfterburning && this.type === 'medivac') currentSpeed *= 1.7; // Medivac Ignite Afterburners 3.5 -> 5.95
    if (this.isSlowed) currentSpeed *= 0.5;
    if (this.rootTimer > 0) currentSpeed = 0;
    
    // Zerg creep speed bonus (applies to any Zerg unit on creep, whether player or AI)
    if (UNIT_CONFIGS[this.type]?.race === 'zerg' && world.creep && world.creep.hasCreep(this.pos.x, this.pos.y)) {
      currentSpeed *= this.type === 'queen' ? 2.67 : this.isFlying ? 1 : 1.3; // creep: +30% (Queen 1.31 -> 3.5)
    }
    this.speed = currentSpeed;

    // 2. Transformation progress
    if (this.isTransforming) {
      this.transformTimer -= dt;
      const to = this.transformToType;
      if (to === 'viking_assault' || to === 'viking') {
        // Viking: descend to the ground / climb to cruise altitude over the transform
        const k = Math.min(1, 1 - Math.max(0, this.transformTimer) / Math.max(0.01, this.transformTotal));
        const e = k * k * (3 - 2 * k);
        this.flightAltitude = Unit.CRUISE_ALTITUDE * (to === 'viking' ? e : 1 - e);
        if (this.landSpot) { this.pos.x += (this.landSpot.x - this.pos.x) * Math.min(1, dt * 4); this.pos.y += (this.landSpot.y - this.pos.y) * Math.min(1, dt * 4); }
        this.height = ProceduralGrassSystem.getTerrainHeight(this.pos.x, this.pos.y) + this.flightAltitude;
        this.pitch *= Math.max(0, 1 - dt * 6); this.roll *= Math.max(0, 1 - dt * 6);
      }
      if (this.transformTimer <= 0) {
        this.isTransforming = false;
        if (to) {
          if (this.landSpot) { this.pos.x = this.landSpot.x; this.pos.y = this.landSpot.y; this.landSpot = null; }
          world.morphUnit(this, to, true);
          if (to === 'viking') this.flightAltitude = Unit.CRUISE_ALTITUDE;
          if (to === 'viking_assault') { this.flightAltitude = 0; this.pitch = 0; this.roll = 0; }
          this.transformToType = null;
        }
      }
      RiggedAnimator.update(this, dt, world); // keep the deploy / undeploy clip playing
      return; // Immobilized during transform
    }

    // 3. Attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
    }

    // Widow Mine burrowing in / out: immobile and unarmed until the animation finishes
    if (this.burrowTransition) {
      this.burrowTransition.t -= dt;
      if (this.burrowTransition.t <= 0) { this.burrowed = this.burrowTransition.to; this.burrowTransition = null; this.mineLock = null; }
      RiggedAnimator.update(this, dt, world);
      return;
    }

    // Burrowed: dug in. No movement or attacks; Roaches regenerate quickly underground.
    if (this.burrowed) {
      if (this.type === 'lurker' || this.type === 'widow_mine') { if (this.currentCommand?.type !== 'hold') this.currentCommand = { type: 'hold' } as any; } // dug-in Lurkers hold position and fire
      else return;
    }

    // 4. Medivac Auto-heal logic
    if ((this.type === 'medivac' || this.type === 'medic') && this.energy >= 1) {
      this.handleMedivacHeal(dt, world);
    }

    // 5. Worker Harvesting & Building logic (SCV, Drone, or Probe)
    if (this.type === 'scv' || this.type === 'drone' || this.type === 'probe' || this.type === 'mule') {
      if (this.handleWorkerBehaviors(dt, world)) {
        return;
      }
    }

    // 6. Handle active command
    if (this.currentCommand) {
      this.executeCommand(dt, world);
    } else if (isWorkerType(this.type) || this.type === 'mule') {
      // Workers never pick fights on their own (an explicit Attack order still works); an idle worker that gets hit runs away
      if (this.type !== 'mule' && this.sinceDamaged < 0.25) this.fleeFromAttacker(world);
    } else {
      // Idle Behavior: auto-acquire enemies in sight range
      this.handleAutoAcquireTarget(world);
    }

    // 7. Doctrine self-preservation (auto-stim / retreat). Computer opponents only: human players micro by hand, like SC2.
    const spMode = world.doctrineFor?.(this.playerId)?.selfPreservation ?? 'none';
    if (spMode !== 'none' && this.type !== 'scv' && this.type !== 'drone' && this.type !== 'probe') {
      if (spMode === 'auto_stim' && (this.type === 'marine' || this.type === 'marauder')) {
        if (!this.isStimmed && this.health > 22 && this.attackCooldown > 0) {
          this.activateStimpack(world);
        }
      } else if (spMode === 'tactical_retreat' && this.health < this.maxHealth * 0.28 && this.attackCooldown > 0) {
        const threat = world.findNearestHostile(this.pos, this.playerId, 6.0);
        if (threat) {
          const awayX = this.pos.x + (this.pos.x - threat.pos.x) * 1.5;
          const awayY = this.pos.y + (this.pos.y - threat.pos.y) * 1.5;
          this.moveTowards({ x: awayX, y: awayY }, dt, world, true);
        }
      }
    }

    // 8. Local Separation (Boids flocking push to avoid stacking)
    this.applyFlockingSeparation(world);

    // 9. Hyper-realistic articulated skeletal animation for CMC-400 Marine
    if (this.type === 'marine') {
      MarineAnimator.updateMarineAnimation(this, dt, world);
    }
    TerranAnimator.update(this, dt, world);
    ZerglingAnimator.update(this, dt, world);
    RiggedAnimator.update(this, dt, world);
  }

  private executeCommand(dt: number, world: any) {
    if (!this.currentCommand) return;

    switch (this.currentCommand.type) {
      case 'move': {
        if (!this.currentCommand.targetPos) {
          this.finishCommand();
          return;
        }
        const dist = Math.hypot(this.currentCommand.targetPos.x - this.pos.x, this.currentCommand.targetPos.y - this.pos.y);
        if (dist <= 0.4) {
          this.finishCommand();
        } else {
          this.moveTowards(this.currentCommand.targetPos, dt, world);
        }
        break;
      }

      case 'attack': {
        const target = world.findEntityById(this.targetEntityId);
        if (!target || target.isDead) {
          this.finishCommand();
          return;
        }

        // Big targets (destructible rocks) are hit from their edge, not their centre
        const edge = (target as any).size ? (target as any).size * 0.5 : 0;
        const dist = Math.hypot(target.pos.x - this.pos.x, target.pos.y - this.pos.y) - edge;
        if (dist <= this.rangeVs(target)) {
          if (!this.tryStutterStepKite(target, dist, dt, world)) {
            this.performAttack(target, world);
          }
        } else {
          this.moveTowards(target.pos, dt, world);
        }
        break;
      }

      case 'attack_move': {
        // Nearest visible enemy (computer opponents may use a focus-fire doctrine instead)
        const nearestEnemy = world.findTacticalTarget
          ? world.findTacticalTarget(this.pos, this.playerId, this.sightRange, this.canTargetAir, this.canTargetGround)
          : world.findNearestHostile(this.pos, this.playerId, this.sightRange);
        if (nearestEnemy) {
          const dist = Math.hypot(nearestEnemy.pos.x - this.pos.x, nearestEnemy.pos.y - this.pos.y);
          if (dist <= this.rangeVs(nearestEnemy)) {
            if (!this.tryStutterStepKite(nearestEnemy, dist, dt, world)) {
              this.performAttack(nearestEnemy, world);
            }
          } else {
            this.moveTowards(nearestEnemy.pos, dt, world);
          }
        } else if (this.currentCommand.targetPos) {
          const dist = Math.hypot(this.currentCommand.targetPos.x - this.pos.x, this.currentCommand.targetPos.y - this.pos.y);
          if (dist <= 0.4) {
            this.finishCommand();
          } else {
            this.moveTowards(this.currentCommand.targetPos, dt, world);
          }
        }
        break;
      }

      case 'stop': {
        // SC2 Stop: drop every order and go idle (idle units still auto-acquire and answer back when hit)
        this.commandQueue = [];
        this.finishCommand();
        break;
      }

      case 'hold': {
        // SC2 Hold Position: never moves; shoots visible enemies that come inside weapon range
        if (this.damage <= 0) break;
        const reach = this.attackRange + 1; // attackRange already covers the longer of the ground / air weapons
        const enemy = world.findTacticalTarget
          ? world.findTacticalTarget(this.pos, this.playerId, reach, this.canTargetAir, this.canTargetGround)
          : world.findNearestHostile(this.pos, this.playerId, reach);
        if (enemy) this.performAttack(enemy, world);
        break;
      }

      case 'patrol': {
        // SC2 patrol: attack-move back and forth between the point the order was given at and the clicked point.
        if (!this.patrolStart || !this.patrolEnd) {
          this.finishCommand();
          return;
        }

        // Engage anything in sight we can actually shoot (like attack-move), then resume the leg
        const enemy = this.damage > 0
          ? (world.findTacticalTarget
            ? world.findTacticalTarget(this.pos, this.playerId, this.sightRange, this.canTargetAir, this.canTargetGround)
            : world.findNearestHostile(this.pos, this.playerId, this.sightRange))
          : null;
        if (enemy) {
          const dist = Math.hypot(enemy.pos.x - this.pos.x, enemy.pos.y - this.pos.y);
          if (dist <= this.rangeVs(enemy)) {
            if (!this.tryStutterStepKite(enemy, dist, dt, world)) this.performAttack(enemy, world);
          } else {
            this.moveTowards(enemy.pos, dt, world);
          }
        } else {
          const target = this.patrolHeadingToEnd ? this.patrolEnd : this.patrolStart;
          const dist = Math.hypot(target.x - this.pos.x, target.y - this.pos.y);
          if (dist <= 0.6) {
            this.patrolHeadingToEnd = !this.patrolHeadingToEnd; // turn around
          } else {
            this.moveTowards(target, dt, world);
          }
        }
        break;
      }

      case 'load': {
        // Walk to the Bunker and climb in (right-click on it, the bunker's Load button, or a rally point on it)
        const bunker = world.findEntityById(this.currentCommand.targetEntityId) as any;
        if (!bunker || bunker.isDead || !['bunker', 'nydus_network', 'nydus_worm'].includes(bunker.type) || (bunker.type === 'bunker' && bunker.cargo.length >= BUNKER_CAPACITY && !bunker.cargo.includes(this))) {
          this.finishCommand();
          return;
        }
        const dist = Math.hypot(bunker.pos.x - this.pos.x, bunker.pos.y - this.pos.y);
        if (dist <= bunker.radius + this.radius + 0.55) {
          if (!bunker.isConstructed) { this.moveTowards(bunker.pos, 0.001, world); break; }
          if (!loadUnit(world, bunker, this)) this.finishCommand();
        } else {
          this.moveTowards(bunker.pos, dt, world, dist < bunker.radius + 3);
        }
        break;
      }

      case 'build': {
        // Zerg: the drone walks to the spot and becomes the structure (see GameWorld.droneBecomesBuilding)
        const c = this.currentCommand;
        if (!c.targetPos || !c.buildingTypeToConstruct) { this.finishCommand(); return; }
        // a geyser blocks the tiles under it, so the drone morphs at the geyser's edge instead of at its centre
        const reach = BUILDING_CONFIGS[c.buildingTypeToConstruct]?.requiresRefineryGeyser ? 2.3 : 0.5;
        if (Math.hypot(c.targetPos.x - this.pos.x, c.targetPos.y - this.pos.y) <= reach) {
          world.droneBecomesBuilding(this, c.buildingTypeToConstruct, c.targetPos);
        } else this.moveTowards(c.targetPos, dt, world);
        break;
      }

      case 'gather': {
        this.targetNodeId = this.currentCommand.targetEntityId || null;
        this.isGathering = true;
        break;
      }

      case 'repair': {
        const target = world.findEntityById(this.currentCommand.targetEntityId);
        if (!target || target.isDead) {
          this.constructInitialized = false;
          this.finishCommand();
          return;
        }

        const isBuilding = 'isConstructed' in target;
        const isUnderConstruction = isBuilding && !(target as any).isConstructed;
        if (isUnderConstruction) {
          // Only an SCV constructs, and only a Terran structure that isn't an add-on (Protoss warp in, Zerg morph, add-ons build themselves)
          const bt = (target as any).type as string;
          if (this.type !== 'scv' || BUILDING_CONFIGS[bt as keyof typeof BUILDING_CONFIGS]?.race !== 'terran' || bt === 'techlab' || bt === 'reactor') { this.finishCommand(); return; }
          // SC2: one SCV per structure. A second SCV gives up while another is actively welding it.
          const tb = target as any;
          if (tb.builderId && tb.builderId !== this.id && world.gameTime - tb.lastWeldAt < 0.3) {
            if (this.playerId === 'player') world.onMessage?.('Another SCV is already constructing that structure', true);
            this.finishCommand();
            return;
          }
          this.repairWasConstruction = true;
        }
        else if (!canRepairTarget(this, target)) { this.finishCommand(); return; }

        // If completed building or mech unit is fully repaired, order is done
        if (!isUnderConstruction && target.health >= target.maxHealth) {
          const wasBuilding = this.constructInitialized || this.repairWasConstruction;
          this.repairWasConstruction = false;
          this.constructInitialized = false;
          this.finishCommand();
          if (wasBuilding && isBuilding) this.autoHarvestRefinery(target, world);
          return;
        }

        const reachDist = Math.max(1.8, target.radius + this.radius + 0.4);
        const activeReachDist = this.constructInitialized ? reachDist + 1.2 : reachDist;
        const dist = Math.hypot(target.pos.x - this.pos.x, target.pos.y - this.pos.y);

        if (dist <= activeReachDist) {
          // Repairing / constructing
          if (isUnderConstruction) {
            const b = target as any;

            // Initialize SCV construction perimeter patrol if first frame on-site
            if (!this.constructInitialized) {
              const initAngle = Math.atan2(this.pos.y - target.pos.y, this.pos.x - target.pos.x);
              this.constructAngle = initAngle;
              this.constructCurrentAngle = initAngle;
              this.constructMoveTimer = 2.2;
              this.isConstructMoving = false;
              this.constructInitialized = true;
            }

            // Patrol timer: alternate between welding in place and slowly crawling along perimeter (like SC2 SCVs)
            this.constructMoveTimer -= dt;
            if (this.constructMoveTimer <= 0) {
              if (this.isConstructMoving) {
                // Stop to weld in place for 2.2s - 3.4s
                this.isConstructMoving = false;
                this.constructMoveTimer = 2.2 + simRandom() * 1.2;
              } else {
                // Reposition along building perimeter for 1.6s - 2.4s
                this.isConstructMoving = true;
                this.constructMoveTimer = 1.6 + simRandom() * 0.8;
                // Move clockwise or counterclockwise along perimeter
                const angleShift = (Math.PI / 4 + simRandom() * 0.3) * (simRandom() > 0.5 ? 1 : -1);
                this.constructAngle += angleShift;
              }
            }

            const orbitRadius = Math.max(1.75, target.radius + this.radius + 0.32);

            if (this.isConstructMoving) {
              // Orbit smoothly along the exact circular perimeter arc so the SCV never drifts out of reachDist
              const angleDiff = normalizeAngle(this.constructAngle - this.constructCurrentAngle);
              if (Math.abs(angleDiff) > 0.03) {
                const maxAngularStep = (this.speed * 0.42 * dt) / orbitRadius;
                const angularStep = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxAngularStep);
                this.constructCurrentAngle += angularStep;

                const goalX = target.pos.x + Math.cos(this.constructCurrentAngle) * orbitRadius;
                const goalY = target.pos.y + Math.sin(this.constructCurrentAngle) * orbitRadius;
                this.pos.x += (goalX - this.pos.x) * Math.min(1.0, dt * 10.0);
                this.pos.y += (goalY - this.pos.y) * Math.min(1.0, dt * 10.0);

                // Face along the perimeter tangent while crawling
                const tangentAngle = Math.atan2(
                  -Math.sin(this.constructCurrentAngle) * Math.sign(angleDiff),
                  Math.cos(this.constructCurrentAngle) * Math.sign(angleDiff)
                );
                this.rotation = lerpAngle(this.rotation, tangentAngle, dt * 8.0);
              } else {
                this.isConstructMoving = false;
                this.constructMoveTimer = 2.2 + simRandom() * 1.0;
              }
            } else {
              // Welding in place: settle cleanly on orbitRadius and face directly towards building center
              const holdX = target.pos.x + Math.cos(this.constructCurrentAngle) * orbitRadius;
              const holdY = target.pos.y + Math.sin(this.constructCurrentAngle) * orbitRadius;
              this.pos.x += (holdX - this.pos.x) * Math.min(1.0, dt * 6.0);
              this.pos.y += (holdY - this.pos.y) * Math.min(1.0, dt * 6.0);

              const faceAngle = Math.atan2(target.pos.x - this.pos.x, target.pos.y - this.pos.y);
              this.rotation = lerpAngle(this.rotation, faceAngle, dt * 9.0);
            }

            // Update ground elevation as SCV moves
            this.height = ProceduralGrassSystem.getTerrainHeight(this.pos.x, this.pos.y);

            // Advance construction at SC2's rate (one SCV builds it in its listed build time). The structure now waits for
            // an SCV: it pauses whenever this one leaves or dies, and any SCV can resume it later.
            b.needsBuilder = true;
            b.builderId = this.id;
            b.lastWeldAt = world.gameTime;
            b.advanceConstruction(dt / b.totalBuildTime);
            if (b.isConstructed) {
              this.constructInitialized = false;
              this.isConstructMoving = false;
              this.repairWasConstruction = false;
              this.finishCommand();
              this.autoHarvestRefinery(b, world);
            }

            // Welding sparks at SCV front welding arm / building contact point
            this.sparkTimer -= dt;
            if (this.sparkTimer <= 0) {
              this.sparkTimer = 0.12;
              const forwardOffset = 0.65;
              const sparkPos = {
                x: this.pos.x + Math.sin(this.rotation) * forwardOffset,
                y: this.height + 0.45,
                z: this.pos.y + Math.cos(this.rotation) * forwardOffset
              };
              world.particles.spawnWeldingSparks(sparkPos);
            }
            world.sound.at(this.pos.x, this.pos.y).playWelding();
          } else {
            // Repair existing Terran structure / mechanical unit at SC2's rate (full HP in the target's build time)
            // for 25% of its cost, charged as the HP comes back. Stops (with a message) when the money runs out.
            const targetAngle = Math.atan2(target.pos.x - this.pos.x, target.pos.y - this.pos.y);
            this.rotation = lerpAngle(this.rotation, targetAngle, dt * 10.0);
            const rc: any = isBuilding ? BUILDING_CONFIGS[(target as any).type as keyof typeof BUILDING_CONFIGS] : UNIT_CONFIGS[(target as any).type as UnitType];
            const res = world.resources[this.playerId];
            const dryM = (rc.costMinerals ?? 0) > 0 && res.minerals < 1;
            const dryG = (rc.costGas ?? 0) > 0 && res.gas < 1;
            if (dryM || dryG) {
              world.onMessage?.(dryM ? 'Not enough minerals!' : 'Not enough vespene gas!', true);
              this.repairDebtM = this.repairDebtG = 0;
              this.finishCommand();
              return;
            }
            const h = (target.maxHealth / Math.max(5, rc.buildTime ?? 30)) * dt;
            this.repairDebtM += (rc.costMinerals ?? 0) * 0.25 * (h / target.maxHealth);
            this.repairDebtG += (rc.costGas ?? 0) * 0.25 * (h / target.maxHealth);
            const dm = Math.floor(this.repairDebtM), dg = Math.floor(this.repairDebtG);
            if (dm > res.minerals || dg > res.gas) {
              world.onMessage?.(dm > res.minerals ? 'Not enough minerals!' : 'Not enough vespene gas!', true);
              this.repairDebtM = this.repairDebtG = 0;
              this.finishCommand();
              return;
            }
            res.minerals -= dm; res.gas -= dg;
            this.repairDebtM -= dm; this.repairDebtG -= dg;
            target.heal(h);
            if (target.health >= target.maxHealth) {
              this.constructInitialized = false;
              this.repairDebtM = this.repairDebtG = 0;
              this.finishCommand();
            }
            this.sparkTimer -= dt;
            if (this.sparkTimer <= 0) {
              this.sparkTimer = 0.12;
              world.particles.spawnWeldingSparks(target.getPosition3D());
            }
            world.sound.at(this.pos.x, this.pos.y).playWelding();
          }
        } else {
          const direct = dist < reachDist + 2.0;
          this.moveTowards(target.pos, dt, world, direct);
        }
        break;
      }
    }
  }

  /**
   * Doctrine stutter-step kiting (computer opponents only): between shots, ranged units back away from closing enemies
   * while keeping them inside firing range.
   */
  private tryStutterStepKite(target: Entity, dist: number, dt: number, world: any): boolean {
    if (
      world.doctrineFor?.(this.playerId)?.engagementMode === 'stutter_step' &&
      this.attackRange >= 3.5 &&
      this.speed > 0 &&
      this.attackCooldown > 0.14 &&
      dist < this.attackRange * 0.78
    ) {
      const dx = this.pos.x - target.pos.x;
      const dy = this.pos.y - target.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      const kiteTarget = {
        x: this.pos.x + (dx / len) * 2.2,
        y: this.pos.y + (dy / len) * 2.2
      };
      this.moveTowards(kiteTarget, dt, world, true);
      return true;
    }
    return false;
  }

  /** Idle worker under fire: run ~6 tiles straight away from the attacker (or the nearest enemy when the hit had no known source). */
  private fleeFromAttacker(world: any) {
    const from = this.lastAttackerPos ?? world.findNearestHostile?.(this.pos, this.playerId, this.sightRange)?.pos;
    if (!from) return;
    let dx = this.pos.x - from.x, dy = this.pos.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) { const a = simRandom() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); } else { dx /= len; dy /= len; }
    const clamp = (v: number) => Math.max(2, Math.min(MAP_SIZE - 2, v));
    this.setCommand({ type: 'move', targetPos: { x: clamp(this.pos.x + dx * 6), y: clamp(this.pos.y + dy * 6) } });
  }

  private handleAutoAcquireTarget(world: any) {
    if (this.damage <= 0) return;
    // Two Widow Mines never auto-target the same unit: skip anything another friendly mine has a live lock on
    const takenByMine = this.type === 'widow_mine'
      ? (t: Unit) => world.units.some((m: Unit) => m !== this && m.type === 'widow_mine' && m.playerId === this.playerId && !m.isDead && m.mineLock?.targetId === t.id && world.gameTime - m.mineLock.last <= 0.25)
      : undefined;
    const enemy = world.findTacticalTarget
      ? world.findTacticalTarget(this.pos, this.playerId, this.sightRange, this.canTargetAir, this.canTargetGround, takenByMine)
      : world.findNearestHostile(this.pos, this.playerId, this.sightRange);
    if (enemy) {
      const dist = Math.hypot(enemy.pos.x - this.pos.x, enemy.pos.y - this.pos.y);
      if (dist <= this.rangeVs(enemy)) {
        if (!this.tryStutterStepKite(enemy, dist, 0.016, world)) {
          this.performAttack(enemy, world);
        }
      } else if (this.sinceDamaged < 4) {
        // SC2 idle behaviour: only retaliate (close the distance) when we've just been hit.
        // Otherwise idle units hold their ground and never walk off to chase enemies that are merely in sight.
        this.moveTowards(enemy.pos, 0.016, world);
      }
    }
  }

  /** Flat bonus damage vs the target's attributes (config.bonusDamage), e.g. Marauder vs armored. */
  public bonusAgainst(target: Entity): number {
    const b = this.bonusDamage;
    return b && target.attrs.includes(b.type) ? b.amount : 0;
  }

  /** Fire the weapon from inside a Bunker (called by Bunker.ts; position/cooldown are managed there). */
  public fireFromBunker(target: Entity, world: any) { this.performAttack(target, world); }

  private performAttack(target: Entity, world: any) {
    // Face the target
    this.rotation = Math.atan2(target.pos.x - this.pos.x, target.pos.y - this.pos.y);
    // Void Ray: attacking this step keeps the beam lit (VoidRayBeams); a new target restarts it
    if (this.type === 'void_ray') {
      if (this.beamTargetId !== target.id) { this.beamTargetId = target.id; this.beamFired = false; }
      this.beamBeat = world.gameTime;
    }

    // Minimum range check for Sieged Tank
    if (this.type === 'siege_tank_sieged') {
      const dist = Math.hypot(target.pos.x - this.pos.x, target.pos.y - this.pos.y);
      if (dist < (UNIT_CONFIGS.siege_tank_sieged.minRange ?? 2)) {
        // Inside minimum dead zone! Cannot fire!
        return;
      }
    }

    if ((this.type === 'lurker' || this.type === 'widow_mine') && !this.burrowed) return; // Lurkers and Widow Mines only attack while burrowed
    if (this.attackCooldown > 0) return;

    // Pick the weapon for this target (Thor/Queen/Wraith have separate ground & air weapons) and check its reach
    const w = this.weaponVs(target);
    if (w.damage <= 0) return;
    if (target instanceof Unit ? (target.isFlying ? !this.canTargetAir : !this.canTargetGround) : !this.canTargetGround) return;
    const edgeDist = Math.hypot(target.pos.x - this.pos.x, target.pos.y - this.pos.y) - ((target as any).size ? (target as any).size * 0.5 : 0);
    if (w.range < MELEE_RANGE_MAX) {
      const edge = (target as any).size ? (target as any).size * 0.5 : 0;
      if (Math.hypot(target.pos.x - this.pos.x, target.pos.y - this.pos.y) - edge > this.rangeVs(target) + 0.25) return;
    } else if (edgeDist > w.range + this.rangeBonus + 0.6) return;

    // Widow Mine: lock on, and only launch once the lock has held for 1.07s (a target that leaves range cancels it, no cooldown spent)
    if (this.type === 'widow_mine') {
      const lock = this.mineLock;
      if (!lock || lock.targetId !== target.id || world.gameTime - lock.last > 0.25) { this.mineLock = { targetId: target.id, at: world.gameTime, last: world.gameTime }; return; }
      lock.last = world.gameTime;
      if (world.gameTime - lock.at < 1.07) return;
      this.mineLock = null;
    }

    // Reset cooldown based on attack speed & IL-2 weapon component state
    const effectiveAtkSpd = (this.isStimmed ? w.aspd * 1.5 : w.aspd) * this.getFireRateMultiplier();
    this.attackCooldown = 1.0 / effectiveAtkSpd;
    if (world.net) world.net.onAttack(this, target);

    // SC2 damage per hit: base + flat per-level upgrade, plus attribute bonus (also upgraded). No high-ground bonus in SC2.
    const lvl = world.getUpgrades ? weaponLevelFor(world.getUpgrades(this.playerId), upgradeClassOf(this.type, this.isFlying), this.type) : 0;
    const outMul = this.getDamageOutputMultiplier();
    const baseHit = (w.damage + lvl * w.up) * outMul;
    const bonusFor = (t: Entity) => (w.bonus && t.attrs.includes(w.bonus.type) ? (w.bonus.amount + lvl * w.upBonus) * outMul : 0);
    const dmgOut = Math.max(1, Math.round(baseHit));
    /** One volley on a target: `count` hits, armor/shield armor applied to each hit separately. */
    const volley = (t: Entity, extra = 0) => { const per = Math.max(1, Math.round(baseHit + bonusFor(t) + extra)); Entity.withSource(this, () => { for (let i = 0; i < w.count; i++) t.takeDamage(per); }); };

    // SC2 High-Ground Attacker Reveal: if an enemy on high ground fires at player units, briefly reveal its position
    if (this.playerId === 'enemy' && this.height > 1.5) {
      world.fog.revealCircle(this.pos.x, this.pos.y, 3.8, this.height, true);
    }

    const weaponHeight = this.isFlying ? 0.95 : this.type.includes('tank') ? 1.4 : 0.85;
    const fallbackPos3D = { x: this.pos.x, y: this.height + weaponHeight, z: this.pos.y };
    // Kick the weapon animation first (recoil / turret aim), then fire from the actual gun muzzle
    TerranAnimator.triggerShoot(this, target.pos);
    RiggedAnimator.triggerAttack(this, target);
    const myPos3D = (world.deterministic ? null : muzzleWorldPos(this)) ?? fallbackPos3D; // projectile flight time sets when damage lands
    const targetHeight = target instanceof Unit ? (target.isFlying ? 0.95 : 0.75) : 1.2;
    const targetPos3D = { x: target.pos.x, y: target.height + targetHeight, z: target.pos.y };
    const at = world.sound.at(this.pos.x, this.pos.y);

    switch (this.type) {
      case 'marine': {
        MarineAnimator.triggerShootAnimation(this);
        at.playMarineAttack();
        world.particles.spawnBulletFlash(myPos3D, targetPos3D, () => volley(target));
        break;
      }

      case 'marauder': {
        at.playMarauderAttack();
        world.particles.spawnMarauderShell(myPos3D, targetPos3D, target.id, () => {
          volley(target);
          if (target instanceof Unit) {
            target.isSlowed = true;
            target.slowTimer = 1.07; // Concussive Shells: 50% slow for 1.07s
          }
        });
        break;
      }

      case 'siege_tank': {
        at.playTankAttack(false);
        world.particles.spawnTankShot(myPos3D, targetPos3D, false, () => volley(target));
        break;
      }

      case 'siege_tank_sieged': {
        at.playTankAttack(true);
        world.particles.spawnTankShot(myPos3D, targetPos3D, true, (hitPos: any) => {
          // SC2 splash: 100% / 50% / 25% inside 0.47 / 0.78 / 1.25 of the impact point
          world.applyAreaDamage(hitPos.x, hitPos.z, w.splash || 1.25, Math.round(baseHit), this.playerId, target, UNIT_CONFIGS[this.type].splashTiers,
            (e: Entity) => Math.round(bonusFor(e)), this);
        });
        break;
      }

      case 'wraith': {
        WraithAnimator.triggerShootAnimation(this);
        at.playWraithFire(!!(target as any)?.isFlying);
        world.particles.spawnWraithLaser(myPos3D, targetPos3D, () => volley(target));
        break;
      }

      case 'banshee': {
        // Backlash Rockets (SC2: 12 x2): a pair of rockets launched together, one from each side launcher, one hit each.
        // muzzleWorldPos alternates launchers, so a second call gives the other side.
        at.playBansheeAttack();
        const otherPod = (world.deterministic ? null : muzzleWorldPos(this)) ?? myPos3D;
        const oneHit = () => { const per = Math.max(1, Math.round(baseHit + bonusFor(target))); Entity.withSource(this, () => target.takeDamage(per)); };
        for (let i = 0; i < w.count; i++) world.particles.spawnBansheeRocket(i % 2 === 0 ? myPos3D : otherPod, targetPos3D, oneHit, target);
        break;
      }

      case 'medivac': {
        break; // no weapon in SC2; healing is handled in handleMedivacHeal
      }

      case 'mutalisk': {
        at.playMutaliskAttack();
        // SC2 Glaive Wurm: hits the target for full damage, then bounces to a second enemy within 3 range for 1/3 of it, then a third for 1/9
        const hitSet = new Set<Entity>([target]);
        const bounce = (from: Entity, fromPos: { x: number; y: number; z: number }, frac: number, depth: number) => {
          if (depth > 2) return;
          let best: Entity | null = null, bd = 3.0 + 0.001;
          const consider = (e: Entity, isFlyer: boolean) => {
            if (e.isDead || e.playerId === this.playerId || hitSet.has(e)) return;
            if (isFlyer ? !this.canTargetAir : !this.canTargetGround) return;
            const d = Math.hypot(e.pos.x - from.pos.x, e.pos.y - from.pos.y) - ((e as any).size ? (e as any).size * 0.4 : 0);
            if (d < bd) { bd = d; best = e; }
          };
          world.units.forEach((u: Unit) => consider(u, u.isFlying));
          world.buildings.forEach((b: any) => consider(b, false));
          const nxt = best as Entity | null;
          if (!nxt) return;
          hitSet.add(nxt);
          const np = { x: nxt.pos.x, y: nxt.height + (nxt instanceof Unit ? (nxt.isFlying ? 0.95 : 0.75) : 1.2), z: nxt.pos.y };
          world.particles.spawnMutaliskGlaive(fromPos, np, () => {
            const per = Math.max(1, Math.round(baseHit * frac));
            Entity.withSource(this, () => nxt.takeDamage(per));
            bounce(nxt, np, frac / 3, depth + 1);
          });
        };
        world.particles.spawnMutaliskGlaive(myPos3D, targetPos3D, () => { volley(target); bounce(target, targetPos3D, 1 / 3, 1); });
        break;
      }

      case 'baneling': {
        // Suicide burst: damages every enemy ground unit / structure nearby (never friendlies), then the Baneling is spent
        at.playZerglingAttack('baneling');
        world.particles.spawnMuzzleFlash(myPos3D, 0x66ff33, 1.8);
        const r = w.splash || 2.2;
        world.units.forEach((u: Unit) => {
          if (u.isDead || u.playerId === this.playerId || u.isFlying) return;
          if (Math.hypot(u.pos.x - this.pos.x, u.pos.y - this.pos.y) <= r) volley(u);
        });
        world.buildings.forEach((b: any) => {
          if (b.isDead || b.playerId === this.playerId) return;
          if (Math.hypot(b.pos.x - this.pos.x, b.pos.y - this.pos.y) <= r + (b.size ? b.size * 0.5 : 0)) b.takeDamage(Math.round((80 + 5 * lvl) * outMul)); // SC2 Volatile Burst: 80 (+5 per level) vs structures
        });
        this.takeDamage(99999);
        break;
      }

      case 'ravager': {
        at.playHydraliskAttack();
        world.particles.spawnRoachAcid(myPos3D, targetPos3D, () => volley(target));
        break;
      }

      case 'ultralisk': {
        at.playZerglingAttack('ultralisk');
        world.particles.spawnMuzzleFlash(targetPos3D, 0xb060ff, 1.0);
        const cleave = w.splash || 2; // Liquipedia: splash within 2 of the Ultralisk, in a 180° arc toward the target
        const fx = target.pos.x - this.pos.x, fy = target.pos.y - this.pos.y;
        world.units.forEach((u: Unit) => {
          if (u.isDead || u.playerId === this.playerId || u.isFlying || u === target) return;
          const dx = u.pos.x - this.pos.x, dy = u.pos.y - this.pos.y;
          // Kaiser Blades: full damage to the target, 33% (armor still applies per hit) to enemies in the front arc
          if (Math.hypot(dx, dy) <= cleave && dx * fx + dy * fy > 0) Entity.withSource(this, () => u.takeDamage(Math.max(1, Math.round((baseHit + bonusFor(u)) * 0.33))));
        });
        volley(target);
        break;
      }

      case 'broodlord': {
        if (!at.playZergWeapon('broodlord')) at.playHydraliskAttack();
        world.particles.spawnHeavyTracer(myPos3D, targetPos3D, () => volley(target));
        break;
      }

      case 'zergling': {
        ZerglingAnimator.triggerAttack(this);
        at.playZerglingAttack();
        volley(target);
        break;
      }

      case 'roach': {
        at.playHydraliskAttack();
        world.particles.spawnRoachAcid(myPos3D, targetPos3D, () => volley(target));
        break;
      }

      case 'hydralisk': {
        at.playHydraliskAttack();
        world.particles.spawnHydraliskSpine(myPos3D, targetPos3D, () => volley(target));
        break;
      }

      case 'zealot': {
        at.playZerglingAttack('zealot');
        world.particles.spawnMuzzleFlash(targetPos3D, 0x00f0ff, 0.45);
        volley(target);
        break;
      }

      case 'stalker': {
        if (!at.playProtossWeapon('stalker')) at.playMarineAttack();
        world.particles.spawnWraithLaser(myPos3D, targetPos3D, () => volley(target));
        break;
      }

      case 'archon': { // Solaris Immortal: SC2 Immortal stats (single-target Phase Disruptors)
        at.playSiegeTankAttack();
        world.particles.spawnHeavyTracer(myPos3D, targetPos3D, () => volley(target));
        break;
      }

      case 'widow_mine': { // Sentinel Missile: 125 (+35 vs shields) to the target, 40 (+25 vs shields) splash within 1.5. Spell damage: ignores armor and upgrades. Friendly Widow Mines are immune to the splash.
        at.playSiegeTankAttack();
        const tp = { x: target.pos.x, y: target.pos.y };
        world.particles.spawnHeavyTracer(myPos3D, targetPos3D, () => Entity.withSource(this, () => {
          if (!target.isDead) target.takeDamage(125 + ((target as any).shield > 0 ? 35 : 0), undefined, false, true);
          const splash = (e: Entity) => { if (!e.isDead && e !== target && Math.hypot(e.pos.x - tp.x, e.pos.y - tp.y) <= 1.5) e.takeDamage(40 + ((e as any).shield > 0 ? 25 : 0), undefined, false, true); };
          world.units.forEach((u: Unit) => { if (!(u.type === 'widow_mine' && u.playerId === this.playerId)) splash(u); });
          world.buildings.forEach((b: Entity) => splash(b));
          world.particles.impactBlast({ x: tp.x, y: target.height + ((target as any).isFlying ? 3 : 0.4), z: tp.y }, 1.3);
        }));
        break;
      }

      case 'void_ray': {
        // Prismatic Beam: instant, continuous. Each tick hits now; the beam and its looping sound are drawn by VoidRayBeams.
        this.beamFired = true;
        volley(target);
        break;
      }

      case 'medic': break;

      case 'reaper': {
        at.playMarineAttack();
        world.particles.spawnBulletFlash(myPos3D, targetPos3D, () => volley(target));
        break;
      }

      case 'ghost':
      case 'nova': {
        at.playGhostAttack();
        world.particles.spawnBulletFlash(myPos3D, targetPos3D, () => volley(target));
        break;
      }

      case 'firebat':
      case 'hellbat':
      case 'hellion': {
        at.playMarauderAttack();
        // Real flame jets: the Hellion's from its turret nozzle, the Firebat / Hellbat's from both arm-mounted flamethrowers
        const fwdX = Math.sin(this.rotation), fwdZ = Math.cos(this.rotation);
        const aim = { x: targetPos3D.x, y: target.height + 0.45, z: targetPos3D.z };
        if (this.type === 'hellion') {
          world.particles.spawnFlamethrower(muzzleWorldPos(this) ?? { x: this.pos.x + fwdX * 0.7, y: this.height + 0.5, z: this.pos.y + fwdZ * 0.7 }, aim, 0.95, 1.25);
        } else {
          const big = this.type === 'hellbat' ? 1.15 : 1;
          for (const sd of [-1, 1]) {
            const nz = { x: this.pos.x + fwdX * 0.38 * big + fwdZ * sd * 0.2 * big, y: this.height + 0.5 * big, z: this.pos.y + fwdZ * 0.38 * big - fwdX * sd * 0.2 * big };
            world.particles.spawnFlamethrower(nz, aim, 0.7 * big, 1.15);
          }
        }
        // Line splash: everything near the target takes the full hit, light units take bonus damage
        const splash = w.splash || 1.6;
        world.units.forEach((u: Unit) => {
          if (u.isDead || u.playerId === this.playerId || u.isFlying) return;
          if (Math.hypot(u.pos.x - target.pos.x, u.pos.y - target.pos.y) <= splash) volley(u);
        });
        if (!(target instanceof Unit)) volley(target);
        break;
      }

      case 'thor': {
        const air = target instanceof Unit && target.isFlying;
        if (air) at.playSiegeTankAttack(); else at.playDeepBoom(0.7);
        const onHitThor = (hitPos: any) => {
          if (air && w.splash) {
            for (let i = 0; i < w.count; i++) world.applyAreaDamage(hitPos.x, hitPos.z, w.splash, Math.round(baseHit), this.playerId, target, undefined, (e: Entity) => Math.round(bonusFor(e)), this);
          } else volley(target);
        };
        // Air: Javelin Missile Launchers (4 missiles, splash). Ground: Thor's Hammer (heavy twin-hit shell), not a missile.
        if (air) world.particles.spawnHomingMissile(myPos3D, targetPos3D, target, onHitThor, w.count);
        else world.particles.spawnSiegeShell(myPos3D, targetPos3D, onHitThor);
        break;
      }

      case 'viking': {
        // Lanzer Torpedoes: a pair of air-to-air missiles
        at.playRocketWhoosh();
        world.particles.spawnHomingMissile(myPos3D, targetPos3D, target, () => volley(target), w.count);
        break;
      }

      case 'viking_assault': {
        // Twin Gatling Cannon: a short burst of tracers from the two under-slung barrels
        at.playMachineGun(0.5, 0.45);
        world.particles.spawnGatlingBurst(myPos3D, targetPos3D, () => volley(target));
        break;
      }

      case 'thor_ap': {
        const air = target instanceof Unit && target.isFlying;
        if (air) {
          // 250mm Punisher Cannons: one heavy single-target shell pair from the shoulder cannons
          at.playTankAttack(false);
          world.particles.spawnPunisherCannon(myPos3D, targetPos3D, target, () => volley(target));
        } else {
          at.playDeepBoom(0.7);   // Thor's Hammer
          world.particles.spawnSiegeShell(myPos3D, targetPos3D, () => volley(target));
        }
        break;
      }

      case 'vulture': {
        // Fragmentation grenades: a lobbed shell that bursts on the target
        at.playMarauderAttack();
        world.particles.spawnMarauderShell(myPos3D, targetPos3D, target.id, () => volley(target), 0.75);
        break;
      }

      case 'odin': {
        const air = target instanceof Unit && target.isFlying;
        if (air) {
          at.playRocketWhoosh();
          world.particles.spawnHomingMissile(myPos3D, targetPos3D, target, () => volley(target), w.count);
        } else {
          at.playDeepBoom(0.8);
          world.particles.spawnSiegeShell(myPos3D, targetPos3D, () => volley(target));
        }
        break;
      }

      case 'liberator': {
        const air = target instanceof Unit && target.isFlying;
        if (air) { at.playRocketWhoosh(); world.particles.spawnHomingMissile(myPos3D, targetPos3D, target, () => volley(target), 2); } // Lexington Rockets
        else { at.playGhostAttack(); world.particles.spawnHeavyTracer(myPos3D, targetPos3D, () => volley(target)); }            // Concord Cannon
        break;
      }

      case 'battlecruiser': {
        // ATS / ATA laser batteries: rapid bolts
        at.playMachineGun(0.4, 0.4, 1.1);
        world.particles.spawnGatlingBurst(myPos3D, targetPos3D, () => volley(target));
        break;
      }

      case 'cyclone': {
        // Typhoon Missile Pod: single missile per shot, ground and air
        at.playRocketWhoosh();
        world.particles.spawnHomingMissile(myPos3D, targetPos3D, target, () => volley(target));
        break;
      }

      case 'civilian': {
        // Molotov cocktail: a lobbed bottle that bursts into a short flame on the target (UNVERIFIED damage, campaign only)
        at.playMarauderAttack();
        world.particles.spawnMarauderShell(myPos3D, targetPos3D, target.id, () => {
          volley(target);
          const aim = { x: targetPos3D.x + 0.4, y: target.height + 0.2, z: targetPos3D.z + 0.4 };
          world.particles.spawnFlamethrower({ x: targetPos3D.x - 0.3, y: target.height + 0.15, z: targetPos3D.z - 0.3 }, aim, 0.55, 0.6);
        }, 0.45);
        break;
      }

      case 'dominion_transport': {
        // roof turret: short autocannon bursts from the top of the hull
        at.playMachineGun(0.45, 0.45, 1.0);
        world.particles.spawnBulletFlash({ x: myPos3D.x, y: myPos3D.y + 1.1, z: myPos3D.z }, targetPos3D, () => volley(target));
        break;
      }

      case 'goliath': {
        const air = target instanceof Unit && target.isFlying;
        if (air) {
          at.playRocketWhoosh();
          world.particles.spawnHomingMissile(myPos3D, targetPos3D, target, () => volley(target), w.count); // Hellfire: 2 missiles
        } else {
          at.playMachineGun(0.45, 0.45, 1.05);   // twin autocannons
          world.particles.spawnBulletFlash(myPos3D, targetPos3D, () => volley(target));
        }
        break;
      }

      case 'auto_turret': {
        // Auto-Turret autocannon: a short rapid burst
        at.playMachineGun(0.42, 0.42, 1.08);
        world.particles.spawnGatlingBurst(myPos3D, targetPos3D, () => volley(target));
        break;
      }

      case 'queen': {
        if (!at.playZergWeapon('queen')) at.playHydraliskAttack();
        world.particles.spawnHydraliskSpine(myPos3D, targetPos3D, () => volley(target));
        break;
      }

      case 'sentry': {
        if (!at.playProtossWeapon('sentry')) at.playMarineAttack();
        world.particles.spawnWraithLaser(myPos3D, targetPos3D, () => volley(target));
        break;
      }

      default: {
        if (!at.playZergWeapon(this.type)) at.playProtossWeapon(this.type);
        volley(target);
        break;
      }
    }
    void dmgOut;
  }

  /** Weapon stats against `target` (air targets use `airWeapon` when the unit has one). */
  public weaponVs(target?: Entity | null) {
    const c = UNIT_CONFIGS[this.type];
    const air = !!target && target instanceof Unit && target.isFlying;
    if (air && c.airWeapon) {
      const a = c.airWeapon;
      return { damage: a.damage, bonus: a.bonusDamage, aspd: a.attackSpeed, range: a.attackRange, count: a.attackCount ?? 1, splash: a.splashRadius, up: a.upgradeDamage ?? 0, upBonus: a.upgradeBonus ?? 0 };
    }
    return { damage: c.damage, bonus: c.bonusDamage, aspd: c.attackSpeed, range: c.attackRange, count: c.attackCount ?? 1, splash: c.splashRadius, up: c.upgradeDamage ?? 0, upBonus: c.upgradeBonus ?? 0 };
  }

  /** Attack reach against a specific target. */
  public rangeVs(target?: Entity | null): number {
    const r = this.weaponVs(target).range;
    if (r >= MELEE_RANGE_MAX || !target) return r;
    // SC2 ranges are edge to edge: melee reach (center distance) = range + both unit radii, never less than touching
    const rt = reachRadius(target);
    return Math.max(r + reachRadius(this) + rt, this.radius + ((target as any).radius ?? 0.45) + 0.1) + this.rangeBonus;
  }

  /** Possessed-unit (first/third person) shot: same SC2 damage as the RTS weapon, applied as a full volley. */
  public fpsHit(target: Entity | null | undefined, componentId?: string, precision = false, world?: any) {
    if (!target) return;
    const lvl = world?.getUpgrades ? weaponLevelFor(world.getUpgrades(this.playerId), upgradeClassOf(this.type, this.isFlying), this.type) : 0;
    const w = this.weaponVs(target);
    const bonus = w.bonus && target.attrs.includes(w.bonus.type) ? w.bonus.amount + lvl * w.upBonus : 0;
    const per = Math.max(1, Math.round((w.damage + lvl * w.up + bonus) * this.getDamageOutputMultiplier()));
    Entity.withSource(this, () => { for (let i = 0; i < w.count; i++) target.takeDamage(per, componentId, precision); });
  }

  private handleMedivacHeal(dt: number, world: any) {
    // Find nearby wounded friendly bio units
    const friendlyBio = world.findWoundedFriendlyBio(this.pos, this.playerId, this.type === 'medic' ? 3 : 4); // SC2 Medivac heal range 4
    if (friendlyBio) {
      const healAmount = 12.6 * dt; // SC2 Medivac: 12.6 HP/s
      friendlyBio.heal(healAmount);
      this.energy -= 4.2 * dt; // 1 energy per 3 HP
      this.sparkTimer -= dt;
      if (this.sparkTimer <= 0) {
        this.sparkTimer = 0.12;
        world.particles.spawnHealBeam(this.getPosition3D(), friendlyBio.getPosition3D());
      }
      world.sound.at(this.pos.x, this.pos.y).playHealBeam();
    }
  }

  // Safe, collision-free harvesting stand spot facing the base
  private getWorkerStandSpot(node: any, world: any): Vector2D {
    const base = world.findNearestTownHall(node.pos, this.playerId);
    let baseAngle = 0;
    if (base) {
      baseAngle = Math.atan2(base.pos.x - node.pos.x, base.pos.y - node.pos.y);
    }

    let hash = 0;
    for (let i = 0; i < this.id.length; i++) {
      hash = (hash * 31 + this.id.charCodeAt(i)) | 0;
    }
    // Fan out within a stable +/- 35-degree arc on the side facing the base
    const slot = (Math.abs(hash) % 5) - 2; // -2, -1, 0, 1, 2
    const standAngle = baseAngle + slot * 0.26;
    // Guaranteed to be outside the 0.8 collision extent of mineral nodes (radius 0.9 + 0.65 = 1.55)
    const standDist = node.radius + 0.65;

    return {
      x: node.pos.x + Math.sin(standAngle) * standDist,
      y: node.pos.y + Math.cos(standAngle) * standDist
    };
  }

  public updateCargoVisual() {
    if (!this.mesh) return;
    if (this.carriedAmount > 0) {
      if (!this.cargoMesh) {
        const color = this.carriedResourceType === 'minerals' ? 0x00d2ff : 0x00ff88;
        const geo = new THREE.DodecahedronGeometry(0.24);
        const mat = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.6,
          metalness: 0.3,
          roughness: 0.2
        });
        this.cargoMesh = new THREE.Mesh(geo, mat);
        // Position securely on rear magnetic cargo rack
        this.cargoMesh.position.set(0, 0.75, -0.42);
        this.mesh.add(this.cargoMesh);
      }
    } else {
      if (this.cargoMesh) {
        this.mesh.remove(this.cargoMesh);
        this.cargoMesh = null;
      }
    }
  }

  private handleWorkerBehaviors(dt: number, world: any): boolean {
    if (!this.isGathering) return false;

    // 1. Returning to base with harvested cargo
    if (this.carriedAmount > 0) {
      const base = world.findNearestTownHall(this.pos, this.playerId);
      if (!base) return false;

      const dist = Math.hypot(base.pos.x - this.pos.x, base.pos.y - this.pos.y);
      if (dist <= base.radius + 1.25) {
        // Deposit resources
        if (this.carriedResourceType === 'minerals') {
          world.resources[this.playerId].minerals += this.carriedAmount; world.mined[this.playerId].minerals += this.carriedAmount;
        } else {
          world.resources[this.playerId].gas += this.carriedAmount; world.mined[this.playerId].gas += this.carriedAmount;
        }
        if (this.playerId === 'player') {
          world.sound.at(this.pos.x, this.pos.y).playResourceDeposit();
        }
        this.carriedAmount = 0;
        this.carriedResourceType = null;
        this.avoidObstacleId = null;
        this.avoidSide = 0;
        this.avoidTimer = 0;
        this.smoothDirX = 0;
        this.smoothDirY = 0;
        this.updateCargoVisual();
        return true;
      } else {
        // Direct approach when nearing base drop-off ring so worker walks straight to perimeter
        this.moveTowards(base.pos, dt, world, dist < base.radius + 2.4);
        return true;
      }
    }

    // 2. Moving to node to harvest
    if (this.targetNodeId) {
      const node = world.findResourceNode(this.targetNodeId);
      if (!node || node.amount <= 0) {
        const nextNode = world.findNearestResource(this.pos, 'minerals');
        if (nextNode) {
          this.targetNodeId = nextNode.id;
        } else {
          this.isGathering = false;
        }
        return false;
      }

      const standSpot = this.getWorkerStandSpot(node, world);
      const distToSpot = Math.hypot(standSpot.x - this.pos.x, standSpot.y - this.pos.y);
      const distToNodeCenter = Math.hypot(node.pos.x - this.pos.x, node.pos.y - this.pos.y);

      // Arrival threshold: within harvesting spot range
      if (distToSpot <= 0.45 || distToNodeCenter <= node.radius + 0.6) {
        this.avoidObstacleId = null;
        this.avoidSide = 0;
        this.avoidTimer = 0;
        this.smoothDirX = 0;
        this.smoothDirY = 0;

        // Smoothly settle into exact mining spot (eliminates position snapping)
        if (distToSpot > 0.05) {
          this.pos.x += (standSpot.x - this.pos.x) * Math.min(1, dt * 5.0);
          this.pos.y += (standSpot.y - this.pos.y) * Math.min(1, dt * 5.0);
        }

        // Stably face towards the mineral node center with buttery-smooth turn rate
        const targetAngle = Math.atan2(node.pos.x - this.pos.x, node.pos.y - this.pos.y);
        this.rotation = lerpAngle(this.rotation, targetAngle, dt * 8.0);

        // --- Saturation: only one worker mines a node at a time (2 per patch is optimal, 3rd adds little) ---
        if (this.type !== 'mule' && node.reservedBy && node.reservedBy !== this.id) {
          const holder = world.findEntityById(node.reservedBy) as Unit | null;
          const live = holder && !holder.isDead && holder.isGathering && holder.miningNodeId === node.id;
          if (live) {
            // Occupied: hop to a free patch of the same base if there is one, otherwise queue up behind
            let best: any = null, bd = 13;
            for (const n of world.resourceNodes) {
              if (n.id === node.id || n.type !== node.type || n.amount <= 0) continue;
              const h2 = n.reservedBy ? (world.findEntityById(n.reservedBy) as Unit | null) : null;
              if (h2 && !h2.isDead && h2.isGathering && h2.miningNodeId === n.id) continue;
              // a patch another worker is already walking to is not free either (otherwise everyone hops to the same one and ping-pongs)
              if (world.units.some((o: Unit) => o !== this && !o.isDead && o.isGathering && o.carriedAmount === 0 && o.targetNodeId === n.id && o.miningNodeId !== n.id)) continue;
              const d = Math.hypot(n.pos.x - node.pos.x, n.pos.y - node.pos.y);
              if (d < bd) { bd = d; best = n; }
            }
            this.gatherTimer = 0;
            if (best) { this.targetNodeId = best.id; this.miningNodeId = null; }
            return true;
          }
        }
        if (this.type !== 'mule') node.reservedBy = this.id;
        this.miningNodeId = node.id;

        this.gatherTimer += dt;
        this.sparkTimer += dt;
        if (this.sparkTimer >= 0.22) {
          this.sparkTimer = 0;
          if (this.playerId === 'player' || world.fog.isVisible(node.pos.x, node.pos.y)) {
            world.particles.spawnWeldingSparks(node.getPosition3D());
          }
        }

        const mineTime = this.type === 'mule' ? 3.2 : node.type === 'vespene' ? 1.9 : 2.2;
        if (this.gatherTimer >= mineTime) {
          this.gatherTimer = 0;
          this.carriedResourceType = node.type;
          const perTrip = this.type === 'mule' ? 25 : node.type === 'vespene' ? 4 : 5;
          this.carriedAmount = node.harvest(perTrip);
          if (node.reservedBy === this.id) node.reservedBy = null;
          this.miningNodeId = null;
          this.updateCargoVisual();
        }
        return true;
      } else {
        // Smooth direct approach when nearing harvesting zone
        const useDirect = distToNodeCenter < 3.2;
        this.moveTowards(standSpot, dt, world, useDirect);
        return true;
      }
    }

    return false;
  }

  public moveTowards(target: Vector2D, dt: number, world: any, directApproach: boolean = false) {
    if (this.type === 'siege_tank_sieged') return;

    // A new movement leg (after mining / depositing / standing / a new order) starts with a clean stuck detector: stale timers from the
    // previous leg used to fire a random "escape" sidestep right at the start, which looked like units wandering round the base.
    if (world.gameTime - this.lastMoveAt > 0.25) {
      this.stuckAccum = 0; this.stuckRefX = this.pos.x; this.stuckRefY = this.pos.y; this.escapeTimer = 0;
      this.curSpeed = 0; // units with a finite acceleration start every new leg from a standstill
    }
    this.lastMoveAt = world.gameTime;

    // Route ground units transitioning between low ground and high-ground plateaus through the carved tactical ramp
    // Ground units follow the shared flow field (cliffs, ramps, buildings, minerals and rocks are all in the blocked grid): the straight line
    // when it is clear, otherwise the farthest visible point along the shortest route. Works the same on every map.
    let activeTarget = target;
    const pf = !this.isFlying ? world.pathfinding : null;
    if (pf && !directApproach && pf.getPathWaypoint) {
      const rampWp = pf.getPathWaypoint(this.pos, target);
      if (rampWp) {
        activeTarget = rampWp;
      }
    }

    const toTargetX = activeTarget.x - this.pos.x;
    const toTargetY = activeTarget.y - this.pos.y;
    const dist = Math.hypot(toTargetX, toTargetY);

    if (dist < 0.05) return;

    const goalX = toTargetX / dist;
    const goalY = toTargetY / dist;
    let desiredX = goalX;
    let desiredY = goalY;

    // (with the flow field the route already goes round obstacles: the tangent orbit is only the last-metre fallback of a direct approach)
    if (!this.isFlying && (directApproach || !pf?.getPathWaypoint)) {
      // 1. Continuous Circular Perimeter Tangent Avoidance around Buildings (and non-gathering obstacles)
      // Eliminates integer-grid staircase jitter when SCVs or ground units move around the Command Center
      let blockingObs: any = null;
      let blockingClearR = 0;
      let blockingDist = Infinity;

      const checkObstacle = (obs: any, pad: number) => {
        if (!obs || obs.isDead || obs.walkable) return;
        const clearR = obs.radius + this.radius + pad;
        // If our target is inside this obstacle (e.g. returning cargo to Command Center or repairing it), do not treat it as a blocker
        const targetToObs = Math.hypot(target.x - obs.pos.x, target.y - obs.pos.y);
        if (targetToObs < obs.radius + 0.85) return;

        const toObsX = obs.pos.x - this.pos.x;
        const toObsY = obs.pos.y - this.pos.y;
        const distObs = Math.hypot(toObsX, toObsY);

        if (distObs < clearR + 1.15 && distObs < blockingDist) {
          // Projection of obstacle center along our forward goal ray.
          // Must be > 0.05: once proj <= 0.05, we have reached the tangent point (or the obstacle is behind us)
          // and moving straight toward target naturally moves away from the obstacle.
          const proj = toObsX * goalX + toObsY * goalY;
          if (proj <= 0.05 || proj >= dist) return;

          // Perpendicular distance from obstacle center to our goal ray
          const perpDist = Math.abs(toObsX * (-goalY) + toObsY * goalX);

          const isKeepingLock = this.avoidObstacleId === obs.id && this.avoidTimer > 0 && distObs < clearR + 0.65;
          const threshold = isKeepingLock ? clearR + 0.15 : clearR - 0.05;
          if (perpDist < threshold) {
            blockingObs = obs;
            blockingClearR = clearR;
            blockingDist = distObs;
          }
        }
      };

      for (const b of world.buildings) {
        checkObstacle(b, 0.45);
      }
      if (!directApproach && !this.isGathering) {
        for (const r of world.resourceNodes) {
          checkObstacle(r, 0.2);
        }
      }

      if (blockingObs) {
        const toObsX = blockingObs.pos.x - this.pos.x;
        const toObsY = blockingObs.pos.y - this.pos.y;
        const distObs = Math.max(0.01, blockingDist);

        // Lock a consistent clockwise (+1) or counterclockwise (-1) orbit side until clear of this obstacle
        if (this.avoidObstacleId !== blockingObs.id || this.avoidSide === 0) {
          const cross = toObsX * goalY - toObsY * goalX;
          if (Math.abs(cross) > 0.04) {
            this.avoidSide = cross >= 0 ? 1 : -1;
          } else {
            const idBit = this.id.charCodeAt(this.id.length - 1) & 1;
            this.avoidSide = idBit === 0 ? 1 : -1;
          }
          this.avoidObstacleId = blockingObs.id;
        }
        this.avoidTimer = 0.28;

        // Unit radial vector pointing outward from obstacle center to unit
        const radX = -toObsX / distObs;
        const radY = -toObsY / distObs;
        // Unit tangent vector along obstacle perimeter in direction avoidSide
        const tanX = -radY * this.avoidSide;
        const tanY = radX * this.avoidSide;

        // Smooth radial push if inside clearance ring so unit rides cleanly along perimeter circle
        const radialCorrection = distObs < blockingClearR
          ? Math.min(0.85, (blockingClearR - distObs) * 1.6)
          : 0;

        const rawX = tanX + radX * radialCorrection;
        const rawY = tanY + radY * radialCorrection;
        const rawLen = Math.hypot(rawX, rawY) || 1;
        desiredX = rawX / rawLen;
        desiredY = rawY / rawLen;
      } else {
        if (this.avoidTimer > 0) {
          this.avoidTimer = Math.max(0, this.avoidTimer - dt);
          if (this.avoidTimer <= 0) {
            this.avoidObstacleId = null;
            this.avoidSide = 0;
          }
        }
      }
    }

    // Stuck recovery: local steering can trap ground units in pockets between cliffs and buildings.
    // If we've barely moved for ~1s while trying to travel, sidestep along the best open heading for a moment.
    if (!this.isFlying) {
      if (this.escapeTimer > 0) {
        this.escapeTimer -= dt;
        desiredX = this.escapeDirX;
        desiredY = this.escapeDirY;
      } else {
        this.stuckAccum += dt;
        if (this.stuckAccum >= 1.0) {
          const moved = Math.hypot(this.pos.x - this.stuckRefX, this.pos.y - this.stuckRefY);
          if (moved < this.speed * 0.25 && dist > 1.2) {
            const base = Math.atan2(goalY, goalX);
            let best: { x: number; y: number } | null = null;
            let bestScore = -Infinity;
            for (let i = 0; i < 16; i++) {
              const ang = base + (i * Math.PI * 2) / 16 + (this.id.length & 1 ? 0.2 : -0.2);
              const dx = Math.cos(ang), dy = Math.sin(ang);
              let open = true;
              for (const d of [0.8, 1.6, 2.4]) {
                const px = this.pos.x + dx * d, py = this.pos.y + dy * d;
                if (ProceduralGrassSystem.isCliffWall(px, py) || !world.pathfinding?.isWalkable(px, py)) { open = false; break; }
              }
              if (!open) continue;
              const score = dx * goalX + dy * goalY + simRandom() * 0.35;
              if (score > bestScore) { bestScore = score; best = { x: dx, y: dy }; }
            }
            if (best) {
              this.escapeDirX = best.x; this.escapeDirY = best.y;
              this.escapeTimer = 0.9;
              this.avoidObstacleId = null; this.avoidSide = 0;
            }
          }
          this.stuckAccum = 0;
          this.stuckRefX = this.pos.x; this.stuckRefY = this.pos.y;
        }
      }
    }

    // Smoothly damp movement vector so direction never snaps 90-180 degrees on a single frame
    if (this.smoothDirX === 0 && this.smoothDirY === 0) {
      this.smoothDirX = desiredX;
      this.smoothDirY = desiredY;
    } else {
      const steerBlend = Math.min(1.0, dt * 15.0);
      this.smoothDirX += (desiredX - this.smoothDirX) * steerBlend;
      this.smoothDirY += (desiredY - this.smoothDirY) * steerBlend;
      const sLen = Math.hypot(this.smoothDirX, this.smoothDirY);
      if (sLen > 0.001) {
        this.smoothDirX /= sLen;
        this.smoothDirY /= sLen;
      } else {
        this.smoothDirX = desiredX;
        this.smoothDirY = desiredY;
      }
    }

    // Units with a real SC2 acceleration (workers, most flyers) ramp up to full speed; the rest (acceleration 1000) move at full speed at once
    let moveSpeed = this.speed;
    const accel = unitAcceleration(this.type);
    if (accel !== Infinity) {
      this.curSpeed = Math.min(this.speed, this.curSpeed + accel * dt);
      moveSpeed = this.curSpeed;
    }
    const step = Math.min(dist, moveSpeed * dt);
    const nextX = this.pos.x + this.smoothDirX * step;
    const nextY = this.pos.y + this.smoothDirY * step;

    // walls: cliffs always; buildings / minerals / rocks (blocked grid) too, unless the unit already stands inside one (it may walk out)
    const inBlocked = !!pf && !pf.isWalkable(this.pos.x, this.pos.y);
    // a unit that got shoved onto a cliff edge must be able to walk back off it (otherwise every step "hits" and it is stuck for good)
    const inWall = ProceduralGrassSystem.isCliffWall(this.pos.x, this.pos.y);
    const hit = (x: number, y: number) => (ProceduralGrassSystem.isCliffWall(x, y) && !inWall) || (!!pf && !inBlocked && !pf.isWalkable(x, y));
    if (this.isFlying || !hit(nextX, nextY)) {
      this.pos.x = nextX;
      this.pos.y = nextY;
    } else if (!hit(nextX, this.pos.y)) {
      this.pos.x = nextX;
    } else if (!hit(this.pos.x, nextY)) {
      this.pos.y = nextY;
    }

    // Face movement direction smoothly like butter (incorporating IL-2 turn & wing damage)
    if (Math.abs(this.smoothDirX) > 0.001 || Math.abs(this.smoothDirY) > 0.001) {
      const targetAngle = Math.atan2(this.smoothDirX, this.smoothDirY);
      const angleDiff = normalizeAngle(targetAngle - this.rotation);
      const turnDir = angleDiff >= 0 ? 'left' : 'right';
      const baseTurn = this.type === 'scv' ? 9.5 : this.isFlying ? 9.5 : 12.0;
      const turnRate = baseTurn * this.getTurnMultiplier(turnDir);
      this.rotation = lerpAngle(this.rotation, targetAngle, dt * turnRate);

      // Smoothly bank aircraft into turns in RTS mode
      if (this.isFlying && this.barrelRollTimer <= 0) {
        const targetBank = Math.max(-0.55, Math.min(0.55, -angleDiff * 0.65));
        this.roll += (targetBank - this.roll) * Math.min(1, dt * 8.0);
      }
    }
  }

  private applyFlockingSeparation(world: any) {
    if (this.isFlying || this.type === 'siege_tank_sieged') return;
    const sx = this.pos.x, sy = this.pos.y;
    this.flockInner(world);
    if (!ProceduralGrassSystem.isCliffWall(sx, sy) && ProceduralGrassSystem.isCliffWall(this.pos.x, this.pos.y)) { this.pos.x = sx; this.pos.y = sy; }
  }

  private flockInner(world: any) {

    // 1. Keep ground units smoothly outside non-lowered building hulls at all times
    for (const b of world.buildings) {
      if (b.isDead || b.walkable) continue;
      const dx = this.pos.x - b.pos.x;
      const dy = this.pos.y - b.pos.y;
      const dist = Math.hypot(dx, dy);
      const minBldDist = b.radius + this.radius + 0.15;
      if (dist > 0.001 && dist < minBldDist) {
        const push = (minBldDist - dist) * 0.35;
        this.pos.x += (dx / dist) * push;
        this.pos.y += (dy / dist) * push;
      }
    }

    // Stationary workers actively mining must remain rock-solid and never get shoved around by other units
    if (this.isGathering && this.carriedAmount === 0 && this.gatherTimer > 0) return;

    // Hold-position units are immovable (SC2): everything else flows around them
    const iAmHolding = this.currentCommand?.type === 'hold' || this.burrowed;
    if (iAmHolding) return;
    const iAmMoving = !!this.currentCommand && this.currentCommand.type !== 'stop';

    const nearbyUnits = world.getNearbyUnits(this.pos, this.radius + MAX_GROUND_RADIUS);
    for (const other of nearbyUnits) {
      if (other === this || other.isFlying) continue;
      // SC2: the Colossus is tall enough that ground units walk underneath it
      if ((this.type === 'colossus') !== (other.type === 'colossus')) continue;

      const dx = this.pos.x - other.pos.x;
      const dy = this.pos.y - other.pos.y;
      const dist = Math.hypot(dx, dy);
      const minDist = this.radius + other.radius;

      if (dist > 0.001 && dist < minDist) {
        // Idle units get shoved aside by units on the move; movers yield less to idle ones (SC2 "push" behaviour)
        const otherMoving = !!other.currentCommand && other.currentCommand.type !== 'stop' && other.currentCommand.type !== 'hold';
        const otherHolding = other.currentCommand?.type === 'hold' || other.burrowed;
        let k = 0.15;
        if (otherHolding) k = 0.3;
        else if (!iAmMoving && otherMoving) k = 0.28;
        else if (iAmMoving && !otherMoving) k = 0.06;
        const push = (minDist - dist) * k;
        this.pos.x += (dx / dist) * push;
        this.pos.y += (dy / dist) * push;
      }
    }
  }

  /** A worker that just finished a Refinery / Extractor / Assimilator starts harvesting its geyser straight away. */
  public autoHarvestRefinery(b: any, world: any) {
    if (this.currentCommand || this.isGathering || this.commandQueue.length || !isWorkerType(this.type)) return; // a queued order takes priority
    if (!BUILDING_CONFIGS[b.type as keyof typeof BUILDING_CONFIGS]?.requiresRefineryGeyser) return;
    const geyser = world.resourceNodes.find((r: any) => r.type === 'vespene' && r.amount > 0 && Math.hypot(r.pos.x - b.pos.x, r.pos.y - b.pos.y) < 2.6);
    if (geyser) this.setCommand({ type: 'gather', targetEntityId: geyser.id });
  }

  public finishCommand() {
    this.constructInitialized = false;
    this.isConstructMoving = false;
    if (this.commandQueue.length > 0) {
      const rest = this.commandQueue;
      const next = rest.shift()!;
      this.setCommand({ ...next, queued: false }); // starts it (and clears the queue)...
      this.commandQueue = rest;                      // ...so put the remaining orders back
    } else {
      this.currentCommand = null;
      this.targetEntityId = null;
    }
  }

  public override updateMeshTransform() {
    if (this.mesh) {
      this.mesh.position.set(this.pos.x, this.height, this.pos.y);
      this.mesh.rotation.y = this.rotation;

      // Smoothly tilt ground units to ride along 3D hill slopes
      if (!this.isFlying) {
        const dh_dx = (ProceduralGrassSystem.getTerrainHeight(this.pos.x + 0.35, this.pos.y) - 
                       ProceduralGrassSystem.getTerrainHeight(this.pos.x - 0.35, this.pos.y)) / 0.7;
        const dh_dz = (ProceduralGrassSystem.getTerrainHeight(this.pos.x, this.pos.y + 0.35) - 
                       ProceduralGrassSystem.getTerrainHeight(this.pos.x, this.pos.y - 0.35)) / 0.7;

        const pitch = -(Math.sin(this.rotation) * dh_dx + Math.cos(this.rotation) * dh_dz);
        const roll = (Math.cos(this.rotation) * dh_dx - Math.sin(this.rotation) * dh_dz);

        this.mesh.rotation.x = Math.max(-0.4, Math.min(0.4, pitch));
        this.mesh.rotation.z = Math.max(-0.4, Math.min(0.4, roll));
      } else {
        this.mesh.rotation.order = 'YXZ';
        this.mesh.rotation.x = this.pitch;
        this.mesh.rotation.z = this.roll + this.getWingRollBias();
      }
      IdleAnimator.apply(this);
    }
  }
}
