import { Entity } from './Entity';
import { inShape } from '../levels/LevelRaster';
import type { Shape } from '../levels/LevelTypes';
import { MissionRuntime } from '../campaign/MissionRuntime';
import { missionOf } from '../campaign/registry';
import * as THREE from 'three';
import { Unit, UNIT_RADIUS } from './Unit';
import { LAYOUT, expansionSpots } from '../maps';
import { fitBaseResources, hallAreaBlocked } from '../levels/LevelHelpers';
import { ProceduralGrassSystem } from '../graphics/ProceduralGrass';
import { Outline } from '../graphics/Outline';
import { RangeRings } from '../graphics/RangeRings';
import { addBuildingDetail } from '../graphics/BuildingDetail';
import { addSurfaceDetail, addHazardTrim, addContactShadow } from '../graphics/SurfaceDetail';
import { addSilhouetteFeatures } from '../graphics/SilhouetteFeatures';
import { DeathEffects } from '../graphics/DeathEffects';
import { BuildingFire } from '../graphics/BuildingFire';
import { Building } from './Building';
import { unloadAll, loadUnit } from './Bunker';
import { DestructibleRock } from './Rocks';
import { isLarvaKind, larvaOf, larvaSupply, cancelEgg } from './Larva';
import { isHiddenFrom, mineBurrowAlertFor, usesLarva, upgradeClassOf, armorLevelFor, UpgradeClass } from './Mechanics';
import { ResourceNode } from './ResourceNode';
import { Pathfinding } from './Pathfinding';
import { Rng, randomSeed, useSimRng } from './Rng';
import { CreepSystem, needsCreep } from './CreepSystem';
import { FogOfWar } from '../graphics/FogOfWar';
import { ParticleSystem } from '../graphics/ParticleSystem';
import { Decals } from '../graphics/Decals';
import { SoundSystem } from '../audio/SoundSystem';
import { RiggedAnimator } from '../graphics/RiggedAnimator';
import { modelFactory } from '../graphics/ModelFactory';
import { ZergAI } from '../ai/ZergAI';
import {
  PlayerId,
  UnitType,
  BuildingType,
  PlayerResources,
  Vector2D,
  ResourceType,
  UpgradeType,
  PlayerUpgrades,
  TacticalDoctrine,
  MatchConfig,
  FactionType
} from '../types';
import {
  MAP_SIZE, UNIT_CONFIGS, BUILDING_CONFIGS, MAP_CONFIGS, DIFFICULTY_CONFIGS, CAMPAIGN_MISSIONS,
  UNIT_TECH_REQUIREMENT, UNIT_MORPHS, RESEARCH, UPGRADE_LEVELS, researchHost, techlabParentFor, TECHLAB_UNITS, UnitSetId, defaultUnitSet, unitInSet, prerequisiteMatches, FACTION_TECH, isWorkerType
} from '../config';
import { PerformanceProfiler } from '../utils/PerformanceProfiler';

/** Plain SC2 behaviour: shoot the nearest target, no automated micro. */
export const DEFAULT_DOCTRINE: Readonly<TacticalDoctrine> = { targetPriority: 'nearest', engagementMode: 'standard', selfPreservation: 'none' };

/** Doctrine for the computer opponent: Insane and up focus-fire wounded targets and stutter-step kite, a stiffer test for
 *  skilled players. Human opponents (multiplayer) and campaign enemies always use the plain default. */
export function aiDoctrine(cfg: Pick<MatchConfig, 'mode' | 'difficulty'>): TacticalDoctrine {
  if (cfg.mode !== 'skirmish') return { ...DEFAULT_DOCTRINE };
  if (cfg.difficulty === 'insane' || cfg.difficulty === 'elite' || cfg.difficulty === 'cheater') {
    return { targetPriority: 'low_hp', engagementMode: 'stutter_step', selfPreservation: 'none' };
  }
  return { ...DEFAULT_DOCTRINE };
}

const TERRAN_HAZARD: ReadonlySet<string> = new Set(['command_center', 'orbital_command', 'planetary_fortress', 'barracks', 'factory', 'starport', 'engineering_bay', 'bunker']);

export class GameWorld {
  public scene: THREE.Scene;
  public pathfinding: Pathfinding;
  public fog: FogOfWar;
  public creep: CreepSystem;
  public particles: ParticleSystem;
  public decals: Decals;
  public deathFx: DeathEffects;
  private rangeRings: RangeRings;
  /** >1 when the camera is zoomed out: units grow so they stay readable (1 at default zoom). */
  public zoomBoost: number = 1;
  public sound: SoundSystem;
  public ai: ZergAI;

  public units: Unit[] = [];
  public buildings: Building[] = [];
public rocks: DestructibleRock[] = [];
  private static powerDiscGeo = new THREE.CircleGeometry(6.5, 48).rotateX(-Math.PI / 2);
  /** Thin (1px) outer edge of the power field */
  public static powerRimGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, i) => { const a = i / 96 * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * 6.5, 0, Math.sin(a) * 6.5); }));
  private static powerDiscMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.14, depthWrite: false });
  public static powerRimMat = new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.85, depthWrite: false });
  private burnTimers = new Map<string, number>();
  private buildingFire: BuildingFire;
/** Active Scanner Sweeps (reveal + detect) */
/** One-shot delayed actions (nukes, scripted events). Ticked in update(). */
  /** Lifetime resources gathered by workers (campaign objectives like 'mine 8000 minerals'). */
  public mined: Record<PlayerId, { minerals: number; gas: number }> = { player: { minerals: 0, gas: 0 }, enemy: { minerals: 0, gas: 0 } };
  public delayed: { t: number; fn: () => void }[] = [];
  public later(sec: number, fn: () => void) { this.delayed.push({ t: sec, fn }); }
  /** Active pathway-campaign mission logic (objectives, timers, win/lose). */
  public mission: MissionRuntime | null = null;
  /** Set by the mission runtime: a stable tag for an entity spawned by mission script code (lets a loaded save find it again). */
  public spawnTagger: (() => string | undefined) | null = null;
  /** Set by the app: scripted camera moves from mission logic. */
  public onCameraFocus: ((x: number, y: number) => void) | null = null;
  public scans: { x: number; y: number; r: number; t: number; owner: PlayerId }[] = [];
  public resourceNodes: ResourceNode[] = [];
  public selectedEntities: (Unit | Building | ResourceNode)[] = [];

  public matchConfig: MatchConfig = {
    mode: 'campaign',
    campaignMissionId: 1,
    playerFaction: 'terran',
    enemyFaction: 'zerg',
    mapId: 'sector_vanguard',
    difficulty: 'normal'
  };

  public completedCampaignMissions: number[] = [];
  public onMatchConfigured: ((config: MatchConfig) => void) | null = null;

  public resources: Record<PlayerId, PlayerResources> = {
    player: { minerals: 200, gas: 0, supply: 8, maxSupply: 15 },
    enemy: { minerals: 200, gas: 0, supply: 8, maxSupply: 15 }
  };

  // Tech upgrades per player
  public upgrades: PlayerUpgrades = {
      weaponsLevel: 0,
      armorLevel: 0,
      combatShields: false,
      vehicleWeaponsLevel: 0,
      vehicleArmorLevel: 0,
      shipWeaponsLevel: 0,
      shipArmorLevel: 0,
      shieldLevel: 0
    };

  // Second player's upgrades (PvP opponent). 'player' uses `upgrades` above.
  public enemyUpgrades: PlayerUpgrades = {
      weaponsLevel: 0,
      armorLevel: 0,
      combatShields: false,
      vehicleWeaponsLevel: 0,
      vehicleArmorLevel: 0,
      shipWeaponsLevel: 0,
      shipArmorLevel: 0,
      shieldLevel: 0
    };

  /** Network sync layer (host or guest). Null in single-player. */
  public net: any = null;

  /** Snapshot multiplayer guest: units are puppets that mirror the host's snapshots (no local simulation). */
  public get isNetGuest(): boolean {
    return !!this.net && this.net.puppet === true;
  }

  /**
   * Local orders go through the network layer instead of running at once: the snapshot guest forwards them to the host,
   * and in lockstep both players schedule them for a future turn so every computer runs them on the same tick.
   */
  public get routesOrders(): boolean {
    return !!this.net && this.net.routesOrders === true;
  }

  /**
   * Lockstep: both computers must reach identical results, so simulation code must not read render state (animated gun
   * bones, mesh visibility). Shots then start from the unit's simulated position instead of its animated muzzle.
   */
  public get deterministic(): boolean {
    return this.net?.mode === 'lockstep';
  }

  /** True while the simulation itself is running (world.update, or the network layer applying orders on their tick). */
  public inSim = false;

  /**
   * Should this action go to the network layer instead of running now? Only for the local player's own actions taken
   * outside the simulation (clicks, hotkeys); the same calls made by the simulation or the AI always run directly.
   */
  public shouldRoute(e?: { playerId: PlayerId } | null): boolean {
    return this.routesOrders && !this.inSim && (!e || e.playerId === 'player');
  }

  /**
   * Single player: the player's units only auto-target what the player can see. Online, each computer's fog shows a different
   * side, so this rule would make the two simulations disagree (and favour one player): both sides target alike instead.
   */
  public fogLimitsTargeting(pid: PlayerId): boolean {
    return pid === 'player' && !this.net;
  }

  /** Seeded random numbers for the simulation (lockstep needs both computers to roll the same numbers). */
  public rng = new Rng(1);
  /** The generator's state as a plain number, so saves and multiplayer keyframes carry it. */
  public get rngState(): number { return this.rng.state; }
  public set rngState(v: number) { this.rng.state = v >>> 0 || 1; }

  /** Faction the local human is playing. */
  public get localFaction(): FactionType {
    // every computer labels its own human 'player' (a PvP guest's world is mirrored, factions included)
    return this.matchConfig.playerFaction;
  }

  public getUpgrades(pid: PlayerId): PlayerUpgrades {
    return pid === 'player' ? this.upgrades : this.enemyUpgrades;
  }

  /**
   * Automated micro per player (focus fire, stutter-step kiting, auto-stim / retreat). SC2 has no automated micro, so human
   * players always use the plain default; only computer opponents get a smarter doctrine (set per difficulty in reset()).
   */
  public doctrines: Record<PlayerId, TacticalDoctrine> = { player: { ...DEFAULT_DOCTRINE }, enemy: { ...DEFAULT_DOCTRINE } };
  public doctrineFor(pid: PlayerId): TacticalDoctrine { return this.doctrines[pid] ?? DEFAULT_DOCTRINE; }

  public gameTime: number = 0;
  /** UI hook for gameplay messages raised inside the simulation (repair out of money, ...). */
  public onMessage: ((msg: string, isError?: boolean) => void) | null = null;
  public isGameOver: boolean = false;
  public gameResult: 'victory' | 'defeat' | null = null;
  public entityIdCounter: number = 1;
  private nearbyScratch: Unit[] = [];
  private fogTickCounter: number = 0;

  constructor(
    scene: THREE.Scene,
    fog: FogOfWar,
    particles: ParticleSystem,
    decals: Decals,
    sound: SoundSystem
  ) {
    this.scene = scene;
    this.fog = fog;
    this.particles = particles;
    this.decals = decals;
    this.deathFx = new DeathEffects(scene, particles.fx);
    this.buildingFire = new BuildingFire(particles.fx);
    this.rangeRings = new RangeRings(scene);
    this.sound = sound;
    this.particles.setSound(sound);

    try {
      const saved = localStorage.getItem('sc2_campaign_progress');
      if (saved) {
        this.completedCampaignMissions = JSON.parse(saved);
      }
    } catch {
      this.completedCampaignMissions = [];
    }

    this.pathfinding = new Pathfinding(MAP_SIZE, MAP_SIZE);
    this.creep = new CreepSystem(scene, MAP_SIZE, MAP_SIZE, fog.texture);
    this.ai = new ZergAI(this);

    this.setupBattlefield();
  }

  private generateId(prefix: string): string {
    return `${prefix}_${this.entityIdCounter++}`;
  }

  /** Remove all units/buildings (and optionally resource nodes) and their meshes without any FX. */
  /** Silently remove entities (no death effects): used by campaign setup to strip the default skirmish bases. */
  public removeWhere(pred: (e: any) => boolean) {
    this.units = this.units.filter(u => { if (!pred(u)) return true; if (u.mesh) this.scene.remove(u.mesh); this.decals.removeHealthBar(u.id); return false; });
    this.buildings = this.buildings.filter(b => {
      if (!pred(b)) return true;
      if (b.mesh) this.scene.remove(b.mesh);
      this.decals.removeHealthBar(b.id); this.decals.removeRallyLine(b.id);
      this.pathfinding.setAreaObstacle(b.pos.x - b.width / 2, b.pos.y - b.heightTiles / 2, b.width, b.heightTiles, false);
      return false;
    });
  }

  public clearEntities(keepResources: boolean) {
    this.deathFx.clear();
    this.buildingFire.clear();
    this.units.forEach(u => {
      if (u.mesh) this.scene.remove(u.mesh);
      this.decals.removeHealthBar(u.id);
    });
    this.buildings.forEach(b => {
      if (b.mesh) this.scene.remove(b.mesh);
      this.decals.removeHealthBar(b.id);
      this.decals.removeRallyLine(b.id);
      this.pathfinding.setAreaObstacle(b.pos.x - b.width / 2, b.pos.y - b.heightTiles / 2, b.width, b.heightTiles, false);
    });
    this.rocks.forEach(r => {
      if (r.mesh) this.scene.remove(r.mesh);
      this.pathfinding.setAreaObstacle(r.pos.x - r.size / 2, r.pos.y - r.size / 2, r.size, r.size, false);
    });
    this.rocks = [];
    this.scans = [];
    this.units = [];
    this.buildings = [];
    this.selectedEntities = [];
    this.decals.updateSelectionRings([]);
    if (!keepResources) {
      this.resourceNodes.forEach(r => {
        if (r.mesh) this.scene.remove(r.mesh);
      });
      this.resourceNodes = [];
    }
  }

  /**
   * Re-configure and reset the battlefield for any Campaign Mission, Skirmish Map/Faction/Difficulty, or Multiplayer Match
   */
  public configureMatch(newConfig: Partial<MatchConfig>) {
    this.matchConfig = { ...this.matchConfig, ...newConfig };
    // a new seed per match unless the caller passes one (multiplayer: both computers then roll the same numbers)
    this.matchConfig.seed = newConfig.seed ?? randomSeed();
    this.rng = new Rng(this.matchConfig.seed);
    useSimRng(this.rng);

    this.clearEntities(false);

    this.entityIdCounter = 1;
    this.gameTime = 0;
    this.isGameOver = false;
    this.gameResult = null;
    this.delayed = [];
    this.mined = { player: { minerals: 0, gas: 0 }, enemy: { minerals: 0, gas: 0 } };
    this.mission = null;
    this.spawnTagger = null;

    this.upgrades = {
      weaponsLevel: 0,
      armorLevel: 0,
      combatShields: false,
      vehicleWeaponsLevel: 0,
      vehicleArmorLevel: 0,
      shipWeaponsLevel: 0,
      shipArmorLevel: 0,
      shieldLevel: 0
    };
    this.enemyUpgrades = {
      weaponsLevel: 0,
      armorLevel: 0,
      combatShields: false,
      vehicleWeaponsLevel: 0,
      vehicleArmorLevel: 0,
      shipWeaponsLevel: 0,
      shipArmorLevel: 0,
      shieldLevel: 0
    };
    this.doctrines = { player: { ...DEFAULT_DOCTRINE }, enemy: aiDoctrine(this.matchConfig) };

    const diffCfg = DIFFICULTY_CONFIGS[this.matchConfig.difficulty] || DIFFICULTY_CONFIGS.normal;
    const mission = this.matchConfig.mode === 'campaign'
      ? CAMPAIGN_MISSIONS.find(m => m.id === this.matchConfig.campaignMissionId)
      : undefined;
    const isPvP = this.matchConfig.mode === 'multiplayer_pvp';
    this.resources = {
      player: { minerals: mission?.startingMinerals ?? 200, gas: mission?.startingGas ?? 0, supply: 8, maxSupply: 15 },
      enemy: {
        minerals: isPvP ? 200 : diffCfg.startingBonusMinerals,
        gas: 0,
        supply: 8,
        maxSupply: 15
      }
    };

    this.pathfinding = new Pathfinding(MAP_SIZE, MAP_SIZE);
    this.missionBlocked.clear();
    this.creep.clear();
    this.fog.clearAll();
    this.ai.reset();

    this.setupBattlefield();
    if (mission) {
      const base = this.buildings.find(b => b.playerId === 'player');
      const bp = base ? base.pos : LAYOUT.playerBase;
      mission.startingBuildings?.forEach(sb => this.spawnBuilding(sb.type, 'player', { x: bp.x + sb.dx, y: bp.y + sb.dy }, true));
      mission.startingUnits?.forEach(su => {
        for (let i = 0; i < su.count; i++) {
          this.spawnUnit(su.type, 'player', { x: bp.x + 5 + (i % 3) * 1.4, y: bp.y + 6 + Math.floor(i / 3) * 1.4 });
          this.resources.player.supply += UNIT_CONFIGS[su.type].supplyCost;
        }
      });
    }
    const pm = missionOf(this.matchConfig.campaignId, this.matchConfig.missionKey);
    if (pm) {
      if (pm.noEnemyBase) this.removeWhere(e => e.playerId === 'enemy');
      if (pm.noPlayerBase) { this.removeWhere(e => e.playerId === 'player'); this.resources.player.supply = 0; }
      if (pm.aiOff) (this.ai as any).update = () => {};
      this.resources.player.minerals = pm.startingMinerals; this.resources.player.gas = pm.startingGas;
      const base = this.buildings.find(b => b.playerId === 'player');
      const bp = base ? base.pos : LAYOUT.playerBase;
      pm.startingBuildings?.forEach(sb => this.spawnBuilding(sb.type, 'player', { x: bp.x + sb.dx, y: bp.y + sb.dy }, true));
      pm.startingUnits?.forEach(su => {
        for (let i = 0; i < su.count; i++) {
          this.spawnUnit(su.type, 'player', { x: bp.x + 5 + (i % 3) * 1.4, y: bp.y + 6 + Math.floor(i / 3) * 1.4 });
          this.resources.player.supply += UNIT_CONFIGS[su.type].supplyCost;
        }
      });
      this.resources.player.maxSupply = Math.max(this.resources.player.maxSupply, this.resources.player.supply + 10);
      this.mission = new MissionRuntime(pm, this);
    }
    if (this.onMatchConfigured) {
      this.onMatchConfigured(this.matchConfig);
    }
  }

  private spawnFactionBase(faction: FactionType, playerId: PlayerId, basePos: Vector2D, isTopRight: boolean) {
    const dir = isTopRight ? 1 : -1;
    const townHallType: BuildingType =
      faction === 'terran' ? 'command_center' : faction === 'zerg' ? 'hatchery' : 'nexus';
    const workerType: UnitType =
      faction === 'terran' ? 'scv' : faction === 'zerg' ? 'drone' : 'probe';
    const scoutType: UnitType =
      faction === 'terran' ? 'banshee' : faction === 'zerg' ? 'mutalisk' : 'void_ray';

    // data-driven levels carry their own resource layout per base; the procedural maps get 8 patches in an arc
    // BEHIND the town hall (opposite the ramp / attack lane, which runs along the (dir,dir) diagonal) and 2 geysers
    const lvBase = LAYOUT.level?.bases.find(b => Math.hypot(b.th[0] - basePos.x, b.th[1] - basePos.y) < 0.5);
    const rawMinerals: [number, number][] = lvBase ? lvBase.minerals : Array.from({ length: 8 }, (_, i) => {
      const ang = Math.atan2(dir, dir) + (i / 7 - 0.5) * 2.1; // arc centred on the back diagonal, ~120 deg wide
      return [basePos.x + Math.cos(ang) * 7.4, basePos.y + Math.sin(ang) * 7.4] as [number, number];
    });
    const rawGeysers: [number, number][] = lvBase ? lvBase.geysers
      : [[basePos.x + 8 * dir, basePos.y - 7 * dir], [basePos.x - 8 * dir, basePos.y + 8 * dir]];
    // SC2 geometry: 5x5 hall on a cell centre, resources on the grid 3 cells from its edge
    // (level bases are already fitted to their terrain when the map loads: src/levels/BaseLayout.ts)
    const fitted = lvBase ? { th: lvBase.th, minerals: lvBase.minerals, geysers: lvBase.geysers }
      : fitBaseResources([basePos.x, basePos.y], rawMinerals, rawGeysers, hallAreaBlocked([basePos.x, basePos.y], this.cellBlocked));
    basePos = { x: fitted.th[0], y: fitted.th[1] };
    this.spawnBuilding(townHallType, playerId, basePos, true);
    const spawnedMinerals: ResourceNode[] = fitted.minerals.map(([mx, my]) => this.spawnResourceNode('minerals', { x: mx, y: my }, 1500));
    fitted.geysers.forEach(([gx, gy]) => this.spawnResourceNode('vespene', { x: gx, y: gy }, 2500));

    // Initial 6 Workers
    for (let i = 0; i < 6; i++) {
      // the 4 miners spread round the hall; the 2 spare workers stand to the right of and below it (screen-wise), not in front of the ramp
      const angle = i < 4 ? (i * Math.PI * 2) / 6 : (i === 4 ? 0.45 : 1.15);
      const sgn = i < 4 ? 1 : -dir;
      const worker = this.spawnUnit(workerType, playerId, {
        x: basePos.x + Math.cos(angle) * 4.3 * sgn, // just clear of the 5x5 hall's corners
        y: basePos.y + Math.sin(angle) * 4.3 * sgn
      });
      if (i < 4 && spawnedMinerals[i]) {
        worker.setCommand({ type: 'gather', targetEntityId: spawnedMinerals[i]!.id });
      }
    }

    // No free starting flyer, except the player's Banshee in the original mission whose intro flies it (IntroCutscene)
    const mc = this.matchConfig;
    const bansheeIntro = mc.mode === 'campaign' && CAMPAIGN_MISSIONS.find(m => m.id === mc.campaignMissionId)?.intro === 'banshee';
    if (playerId === 'player' && bansheeIntro) this.spawnUnit(scoutType, playerId, { x: basePos.x - 4 * dir, y: basePos.y - 4 * dir });

    // Enemy ramp static defense turret
    if (playerId === 'enemy') {
      const defType: BuildingType =
        faction === 'terran' ? 'bunker' : faction === 'zerg' ? 'spine_crawler' : 'photon_cannon';
      const lvDef = LAYOUT.level?.starts[1].defense;
      const def = this.spawnBuilding(defType, 'enemy', lvDef ? { x: lvDef[0], y: lvDef[1] } : { x: basePos.x - 10 * dir, y: basePos.y - 8 * dir }, true);
      if (defType === 'bunker') {
        // the ramp bunker comes garrisoned (4 Marines)
        for (let i = 0; i < 4; i++) {
          const m = this.spawnUnit('marine', 'enemy', { x: def.pos.x, y: def.pos.y });
          this.resources.enemy.supply += UNIT_CONFIGS.marine.supplyCost;
          loadUnit(this, def, m);
        }
      }
    }
  }

  /**
   * Mineral arc + geyser for an expansion, kept OFF the walkway: the arc hugs the side of the town-hall spot
   * that faces away from the main attack lane (centre expansion: perpendicular to the base-to-base diagonal),
   * and never lands on cliffs, ramps or outside the map.
   */
  /** Cliff / wall / map-edge cells (terrain only), for laying out resources. */
  private cellBlocked = (x: number, y: number) => this.pathfinding.isCliff(x + 0.5, y + 0.5);

  private placeExpansionResources(exp: Vector2D, richness: number) {
    const lvBase = LAYOUT.level?.bases.find(b => Math.hypot(b.th[0] - exp.x, b.th[1] - exp.y) < 0.5);
    if (lvBase) {
      const f = lvBase; // already fitted to the terrain when the map loaded (src/levels/BaseLayout.ts)
      f.minerals.forEach(([mx, my]) => this.spawnResourceNode('minerals', { x: mx, y: my }, richness));
      f.geysers.forEach(([gx, gy]) => this.spawnResourceNode('vespene', { x: gx, y: gy }, 2500));
      return;
    }
    const half = MAP_SIZE / 2;
    const fromCentre = Math.hypot(exp.x - half, exp.y - half);
    const out = Math.atan2(exp.y - half, exp.x - half);
    const cands = fromCentre < 6
      ? [Math.PI * 0.75, -Math.PI * 0.25, Math.PI * 0.25, -Math.PI * 0.75]
      : [out, out + 0.7, out - 0.7, out + Math.PI, out + 1.4, out - 1.4, out + 2.1, out - 2.1];
    const build = (a0: number) => {
      const mins = [-0.62, -0.21, 0.21, 0.62].map(da => ({ x: exp.x + Math.cos(a0 + da) * 6.8, y: exp.y + Math.sin(a0 + da) * 6.8 }));
      const gas = { x: exp.x + Math.cos(a0 + 1.4) * 7.6, y: exp.y + Math.sin(a0 + 1.4) * 7.6 };
      return { mins, gas };
    };
    const laneDist = (q: Vector2D) => Math.min(99, ...LAYOUT.trails.map(t => {
      const [ax, ay] = t.a, [bx, by] = t.b, dx = bx - ax, dy = by - ay;
      const k = Math.max(0, Math.min(1, ((q.x - ax) * dx + (q.y - ay) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(q.x - (ax + k * dx), q.y - (ay + k * dy));
    }));
    const ok = (q: Vector2D) => q.x > 4 && q.y > 4 && q.x < MAP_SIZE - 4 && q.y < MAP_SIZE - 4
      && ProceduralGrassSystem.getCliffWeight(q.x, q.y) < 0.02 && !ProceduralGrassSystem.isRamp(q.x, q.y)
      && laneDist(q) > 5.5;
    let best = build(cands[0]!);
    for (const a0 of cands) {
      const c = build(a0);
      if ([...c.mins, c.gas].every(ok)) { best = c; break; }
    }
    const f = fitBaseResources([exp.x, exp.y], best.mins.map(q => [q.x, q.y]), [[best.gas.x, best.gas.y]], hallAreaBlocked([exp.x, exp.y], this.cellBlocked));
    f.minerals.forEach(([mx, my]) => this.spawnResourceNode('minerals', { x: mx, y: my }, richness));
    f.geysers.forEach(([gx, gy]) => this.spawnResourceNode('vespene', { x: gx, y: gy }, 2500));
  }

  // Initialize Map: Player Base (SW), Enemy Base (NE), Mineral Fields & Map Expansions
  public setupBattlefield() {
    const mapCfg = MAP_CONFIGS[this.matchConfig.mapId] || MAP_CONFIGS.sector_vanguard;

    // 1. Spawn Player Faction Base at SW Plateau (25, 25)
    this.spawnFactionBase(this.matchConfig.playerFaction, 'player', { ...LAYOUT.playerBase }, false);

    // 2. Spawn Enemy Faction Base at NE Plateau (95, 95)
    this.spawnFactionBase(this.matchConfig.enemyFaction, 'enemy', { ...LAYOUT.enemyBase }, true);

    // 2b. Destructible rock walls
    LAYOUT.rocks.forEach(r => {
      const rock = new DestructibleRock(this.generateId('rock'), r.x, r.y, r.size);
      this.scene.add(rock.buildMesh());
      this.pathfinding.setAreaObstacle(r.x - r.size / 2, r.y - r.size / 2, r.size, r.size, true);
      this.rocks.push(rock);
    });

    // 3. Spawn Map-Specific Natural Expansion Mineral Fields & Vespene Geysers
    expansionSpots(mapCfg.expansionPositions).forEach(expPos => this.placeExpansionResources(expPos, mapCfg.centerRichness));

    // Pre-reveal initial player base vision so frame 1 is immediately clear
    this.units.forEach(u => {
      if (u.playerId === 'player') {
        this.fog.revealCircle(u.pos.x, u.pos.y, u.sightRange, u.height, u.isFlying);
      }
    });
    this.buildings.forEach(b => {
      if (b.playerId === 'player') {
        this.fog.revealCircle(b.pos.x, b.pos.y, b.sightRange, b.height, false);
      }
    });
    this.fog.updateTexture(1.0);
  }

  /** Applies the one-shot techs a player has researched (Metabolic Boost, Charge, ...) to a unit; safe to call once per tech. */
  public applyTechToUnit(u: Unit, upg: PlayerUpgrades) {
    const t = upg.techs; if (!t) return;
    const done = ((u as any)._techs ??= {}) as Record<string, boolean>;
    const once = (id: string, fn: () => void) => { if (t[id as keyof typeof t] && !done[id]) { done[id] = true; fn(); } };
    if (u.type === 'zergling') once('metabolic_boost', () => { u.baseSpeed *= 1.6; });
    if (u.type === 'baneling') once('centrifugal_hooks', () => { u.baseSpeed *= 1.25; });
    if (u.type === 'ultralisk') once('chitinous_plating', () => { u.armor += 2; });
    if (u.type === 'zealot') once('charge', () => { u.baseSpeed *= 1.3; });
    if (u.type === 'adept') once('resonating_glaives', () => { u.attackSpeed *= 1.45; });
    if (u.type === 'hydralisk') once('grooved_spines', () => { u.attackRange += 1; });
    if (u.type === 'lurker') once('seismic_spines', () => { u.attackRange += 2; });
    if (u.type === 'colossus') once('thermal_lance', () => { u.attackRange += 2; });
  }

  // Spawning Helpers
  public spawnUnit(type: UnitType, playerId: PlayerId, pos: Vector2D, idOverride?: string): Unit {
    const id = idOverride ?? this.generateId('unit');
    const unit = new Unit(id, type, playerId, pos);
    const tag = this.spawnTagger?.(); if (tag) unit.scriptTag = tag;

    // Apply active player Tech Upgrades on spawn
    {
      const upg = this.getUpgrades(playerId);
      unit.armor += armorLevelFor(upg, upgradeClassOf(type, unit.isFlying));
      unit.shieldArmor = upg.shieldLevel;
      if (type === 'marine' && upg.combatShields) {
        unit.maxHealth += 10;
        unit.health += 10;
      }
      this.applyTechToUnit(unit, upg);
      if (type === 'dark_templar' || type === 'observer') unit.cloaked = true; // permanently cloaked
    }

    // 3D Model
    const mesh = modelFactory.createUnitModel(type, playerId === 'player');
    this.decorateUnitMesh(mesh, type, playerId === 'player', unit.radius, unit.isFlying);
    mesh.position.set(pos.x, unit.height, pos.y);
    this.scene.add(mesh);
    unit.mesh = mesh;

    {
      const sp = UNIT_CONFIGS[type].supplyProvided;
      if (sp) this.resources[playerId].maxSupply = Math.min(200, this.resources[playerId].maxSupply + sp);
    }
    this.units.push(unit);
    return unit;
  }

  /** Readability pass: enlarge small models and add a bold team-coloured ground marker (never clickable / outlined). */
  private static readonly UNIT_VISUAL_SCALE: Partial<Record<string, number>> = {
    marine: 1.5, medic: 1.5, scv: 1.4, zergling: 0.6, drone: 1.4, probe: 1.4, hydralisk: 1.3, zealot: 1.3, stalker: 1.05,
    marauder: 1.3, roach: 1.25, wraith: 0.6, medivac: 1.15, banshee: 1.2, mutalisk: 1.3, hellion: 1.4, thor: 1.0, thor_ap: 1.0, viking_assault: 0.6, mule: 0.9, queen: 1.3, sentry: 1.0, viking: 0.6, dark_templar: 1.3, lurker: 1.7, auto_turret: 1.2, high_templar: 1.2
  };
  /** Vertical stretch so unit silhouettes differ in proportion (tall infantry, squat Zerg). */
  private static readonly UNIT_Y_STRETCH: Partial<Record<string, number>> = {
    marine: 1.25, medic: 1.25, zealot: 1.2, hydralisk: 1.2, stalker: 1.15, probe: 0.9, zergling: 0.82, roach: 0.85, drone: 0.9, scv: 0.95, siege_tank: 0.9
  };
  /** Ground-marker shape per race: Terran circle, Zerg triangle, Protoss hexagon. */
  private static ringGeos: Record<string, THREE.BufferGeometry> = {};
  /** Race of a structure type (raceOf only knows units). */
  public static buildingRaceOf(type: string): 'terran' | 'zerg' | 'protoss' {
    if (['hatchery', 'spawning_pool', 'roach_warren', 'hydralisk_den', 'spine_crawler', 'extractor', 'overlord_pod', 'infestation_pit', 'hive', 'baneling_nest', 'evolution_chamber', 'lurker_den', 'spire', 'greater_spire', 'nydus_network', 'ultralisk_cavern', 'spore_crawler', 'creep_tumor', 'nydus_worm'].includes(type)) return 'zerg';
    if (['nexus', 'pylon', 'assimilator', 'gateway', 'forge', 'photon_cannon', 'stargate', 'cybernetics_core', 'twilight_council', 'robotics_facility', 'robotics_bay', 'templar_archives', 'dark_shrine', 'fleet_beacon', 'shield_battery'].includes(type)) return 'protoss';
    return 'terran';
  }
  public static raceOf(type: string): 'terran' | 'zerg' | 'protoss' {
    if (['zergling', 'roach', 'hydralisk', 'drone', 'mutalisk', 'queen', 'baneling', 'ravager', 'ultralisk', 'broodlord', 'viper', 'overlord', 'swarm_host', 'lurker', 'overseer', 'corruptor', 'infestor'].includes(type)) return 'zerg';
    if (['zealot', 'stalker', 'archon', 'probe', 'void_ray', 'sentry', 'immortal', 'colossus', 'carrier', 'tempest', 'adept', 'dark_templar', 'high_templar', 'observer', 'warp_prism', 'disruptor', 'phoenix', 'oracle', 'mothership'].includes(type)) return 'protoss';
    return 'terran';
  }
  private static teamRingGeo: THREE.BufferGeometry | null = null;
  private static teamMats: Record<string, THREE.Material> = {};
  private decorateUnitMesh(mesh: THREE.Group, type: string, isPlayer: boolean, radius: number, flying: boolean) {
    const rigged = !!mesh.userData.sized; // skinned models are already sized in RiggedModels.ts and need no readability props
    const k = rigged ? 1 : (GameWorld.UNIT_VISUAL_SCALE[type] ?? 1.2);
    mesh.scale.set(k, k * (rigged ? 1 : (GameWorld.UNIT_Y_STRETCH[type] ?? 1)), k);
    mesh.userData.baseScale = mesh.scale.clone();
    if (!rigged) addSilhouetteFeatures(mesh, type, isPlayer);
    addSurfaceDetail(mesh);
    if (flying) return;
    addContactShadow(mesh, (radius * 3.0) / k);
    const race = GameWorld.raceOf(type);
    if (!GameWorld.ringGeos[race]) {
      const seg = race === 'zerg' ? 3 : race === 'protoss' ? 6 : 32;
      GameWorld.ringGeos[race] = new THREE.RingGeometry(0.74, 1.0, seg, 1, race === 'zerg' ? Math.PI / 2 : 0).rotateX(-Math.PI / 2);
    }
    GameWorld.teamRingGeo = GameWorld.ringGeos[race]!;
    const key = isPlayer ? 'p' : 'e';
    if (!GameWorld.teamMats[key]) {
      GameWorld.teamMats[key] = new THREE.MeshBasicMaterial({
        color: isPlayer ? 0x3d8bff : 0xff3b30, transparent: true, opacity: 0.8,
        depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
      });
    }
    const ring = new THREE.Mesh(GameWorld.teamRingGeo, GameWorld.teamMats[key]);
    const r = (radius * 1.25 * (race === "zerg" ? 1.45 : 1.0)) / k;
    ring.scale.set(r, 1, r);
    ring.position.y = 0.07 / k;
    ring.userData.noOutline = true;
    ring.userData.teamMarker = true;
    ring.raycast = () => {};
    ring.renderOrder = 2;
    mesh.add(ring);
  }

  public spawnBuilding(
    type: BuildingType,
    playerId: PlayerId,
    pos: Vector2D,
    instantlyBuilt: boolean = false,
    idOverride?: string
  ): Building {
    const id = idOverride ?? this.generateId('building');
    // every structure sits on the cell grid like SC2 (odd footprints on a cell centre, even ones on a cell corner);
    // gas buildings take the geyser's own centre
    const fp = BUILDING_CONFIGS[type].footprint;
    if (!BUILDING_CONFIGS[type].requiresRefineryGeyser) {
      const snap = (v: number, n: number) => (n % 2 === 1 ? Math.floor(v) + 0.5 : Math.round(v));
      pos = { x: snap(pos.x, fp.width), y: snap(pos.y, fp.height) };
    }
    const building = new Building(id, type, playerId, pos, instantlyBuilt);
    const tag = this.spawnTagger?.(); if (tag) building.scriptTag = tag;
    building.shieldArmor = this.getUpgrades(playerId).shieldLevel;

    // 3D Model
    // an add-on is fitted to the building it is attached to (size, hose length)
    const hostType = type === 'techlab'
      ? this.buildings.find(h => h.playerId === playerId && !h.isDead && (h.type === 'barracks' || h.type === 'factory' || h.type === 'starport')
          && Math.abs(Building.addonSpot(h.pos).x - pos.x) < 0.6 && Math.abs(Building.addonSpot(h.pos).y - pos.y) < 0.6)?.type
      : undefined;
    const mesh = modelFactory.createBuildingModel(type, playerId === 'player', hostType);
    mesh.position.set(pos.x, building.height, pos.y);
    this.scene.add(mesh);
    addSurfaceDetail(mesh);
    if (!mesh.userData.sized) {
      if (TERRAN_HAZARD.has(type)) addHazardTrim(mesh, building.width / 2 * 0.98, building.heightTiles / 2 * 0.98);
      addBuildingDetail(mesh, type, playerId === 'player');
    }
    addContactShadow(mesh, building.width * 1.25, building.heightTiles * 1.25, 0.6);
    building.mesh = mesh;
    building.updateConstructionVisuals();
    if (type === 'pylon') {
      // Protoss power field: faint disc + 1px rim on the ground around the pylon. Hidden until it matters (see updatePowerFields).
      const g = new THREE.Group();
      const disc = new THREE.Mesh(GameWorld.powerDiscGeo, GameWorld.powerDiscMat);
      const rim = new THREE.LineLoop(GameWorld.powerRimGeo, GameWorld.powerRimMat);
      disc.userData.noPick = true; rim.userData.noPick = true; // tapping inside the field must not pick the Pylon
      g.add(disc, rim);
      g.position.y = 0.08;
      g.renderOrder = 1;
      g.visible = false;
      mesh.add(g);
      building.powerField = g;
    }

    // Block pathfinding footprint (SC2: units walk over Creep Tumors)
    if (type !== 'creep_tumor') this.pathfinding.setAreaObstacle(
      pos.x - building.width / 2,
      pos.y - building.heightTiles / 2,
      building.width,
      building.heightTiles,
      true
    );

    this.buildings.push(building);

    return building;
  }

  public spawnResourceNode(type: ResourceType, pos: Vector2D, amount: number): ResourceNode {
    const id = this.generateId('res');
    // A geyser is a 3x3 structure site: centre it on a cell so the Refinery/Extractor/Assimilator footprint, pathing block and gas-harvest geometry line up exactly
    if (type === 'vespene') pos = { x: Math.floor(pos.x) + 0.5, y: Math.floor(pos.y) + 0.5 };
    const node = new ResourceNode(id, type, pos, amount);

    const mesh = type === 'minerals' 
      ? modelFactory.createMineralPatch()
      : modelFactory.createVespeneGeyser();
    mesh.position.set(pos.x, node.height, pos.y);
    this.scene.add(mesh);
    node.mesh = mesh;

    // Block pathfinding
    // SC2 footprints: a mineral field blocks 2x1 cells, a geyser 3x3
    this.pathfinding.setAreaObstacle(
      pos.x - (type === 'minerals' ? 1 : 1.5),
      pos.y - (type === 'minerals' ? 0.5 : 1.5),
      type === 'minerals' ? 2 : 3,
      type === 'minerals' ? 1 : 3,
      true
    );

    this.resourceNodes.push(node);
    return node;
  }

  // Morph unit (e.g. Tank to Sieged Tank)
  /** Turn a unit into another type in place. `modeSwitch` = a combat-mode transform (Siege / Thor payload / Viking mode): no spawn intro. */
  public morphUnit(unit: Unit, newType: UnitType, modeSwitch = false) {
    if (unit.mesh) {
      this.scene.remove(unit.mesh);
    }

    const sw = Unit.MODE_SWITCH[unit.type];
    if (sw && (sw.E === newType || sw.D === newType)) modeSwitch = true;
    unit.type = newType;
    const config = UNIT_CONFIGS[newType];
    unit.baseSpeed = config.speed;
    unit.speed = config.speed;
    unit.attackRange = Math.max(config.attackRange, config.airWeapon?.attackRange ?? 0);
    unit.damage = config.damage;
    unit.bonusDamage = config.bonusDamage;
    unit.attackSpeed = config.attackSpeed;
    unit.splashRadius = config.splashRadius;
    unit.isFlying = !!config.isFlying;
    unit.canTargetAir = !!config.canTargetAir;
    unit.canTargetGround = config.canTargetGround;
    unit.radius = UNIT_RADIUS[newType] ?? unit.radius;

    const newMesh = modelFactory.createUnitModel(newType, unit.playerId === 'player');
    if (modeSwitch) newMesh.userData.noIntro = true;
    this.decorateUnitMesh(newMesh, newType, unit.playerId === 'player', unit.radius, unit.isFlying);
    newMesh.position.set(unit.pos.x, unit.height, unit.pos.y);
    this.scene.add(newMesh);
    unit.mesh = newMesh;
  }

  // Combat Area Splash Damage (Siege Tank Shock Cannon)
  public applyAreaDamage(
    centerX: number,
    centerY: number,
    radius: number,
    damage: number,
    attackerPlayerId: PlayerId,
    primaryTarget?: any,
    tiers?: [number, number, number],
    bonusFn?: (e: any) => number,
    attacker?: Entity | null
  ) {
    const r2 = radius * radius;
    Entity.withSource(attacker, () => this.applyAreaDamageInner(centerX, centerY, radius, damage, primaryTarget, tiers, bonusFn));
  }

  private applyAreaDamageInner(centerX: number, centerY: number, radius: number, damage: number, primaryTarget: any, tiers?: [number, number, number], bonusFn?: (e: any) => number) {
    const r2 = radius * radius;

    // Damage units
    this.units.forEach(u => {
      if (u.isDead) return;
      const dx = u.pos.x - centerX;
      const dy = u.pos.y - centerY;
      const distSq = dx * dx + dy * dy;
      if (distSq <= r2) {
        const d = Math.sqrt(distSq);
        // SC2 tiered splash (100% / 50% / 25%) when given; otherwise legacy linear falloff
        const ratio = tiers ? (d <= tiers[0] ? 1 : d <= tiers[1] ? 0.5 : 0.25) : Math.max(0.4, 1 - d / (radius * 1.5));
        u.takeDamage(Math.floor((damage + (bonusFn ? bonusFn(u) : 0)) * ratio));
      }
    });

    // Damage buildings
    this.buildings.forEach(b => {
      if (b.isDead) return;
      const dx = b.pos.x - centerX;
      const dy = b.pos.y - centerY;
      const distSq = dx * dx + dy * dy;
      if (distSq <= r2) {
        const d = Math.sqrt(distSq);
        const ratio = tiers ? (d <= tiers[0] ? 1 : d <= tiers[1] ? 0.5 : 0.25) : 1;
        b.takeDamage(Math.floor((damage + (bonusFn ? bonusFn(b) : 0)) * ratio));
      }
    });

    // Destructible rocks only take splash when they were the explicitly ordered target
    if (primaryTarget && (primaryTarget as any).size && !primaryTarget.isDead) primaryTarget.takeDamage(damage);
  }

  /** Make a unit's meshes translucent (cloak / burrow). Materials are cloned per unit on first use so shared ones stay opaque. */
  private static applyStealthVisual(mesh: THREE.Group, on: boolean) {
    if (!!mesh.userData.stealthOn === on) return;
    mesh.userData.stealthOn = on;
    mesh.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.teamMarker || !m.material || Array.isArray(m.material)) return;
      if (on) {
        if (!m.userData.origMat) { m.userData.origMat = m.material; m.material = (m.material as THREE.Material).clone(); }
        const mat = m.material as THREE.Material;
        mat.transparent = true; mat.opacity = 0.32; mat.depthWrite = false;
      } else if (m.userData.origMat) {
        (m.material as THREE.Material).dispose();
        m.material = m.userData.origMat;
        m.userData.origMat = null;
      }
    });
  }

  // Lookup Helpers
  public findEntityById(id: string | null): Unit | Building | null {
    if (!id) return null;
    return this.units.find(u => u.id === id) || this.buildings.find(b => b.id === id) || (this.rocks.find(r => r.id === id) as any) || null;
  }

  public findResourceNode(id: string): ResourceNode | null {
    return this.resourceNodes.find(r => r.id === id) || null;
  }

  public findNearestResource(pos: Vector2D, type: ResourceType): ResourceNode | null {
    let nearest: ResourceNode | null = null;
    let minDist = Infinity;

    this.resourceNodes.forEach(r => {
      if (r.type === type && r.amount > 0) {
        const d = Math.hypot(r.pos.x - pos.x, r.pos.y - pos.y);
        if (d < minDist) {
          minDist = d;
          nearest = r;
        }
      }
    });

    return nearest;
  }

  public findNearestTownHall(pos: Vector2D, playerId: PlayerId): Building | null {
    let nearest: Building | null = null;
    let minDist = Infinity;

    this.buildings.forEach(b => {
      if (
        b.playerId === playerId &&
        (b.type === 'command_center' || b.type === 'orbital_command' || b.type === 'planetary_fortress' || b.type === 'hatchery' || b.type === 'nexus') &&
        b.isConstructed && !b.isAirborne
      ) {
        const d = Math.hypot(b.pos.x - pos.x, b.pos.y - pos.y);
        if (d < minDist) {
          minDist = d;
          nearest = b;
        }
      }
    });

    return nearest;
  }

  public findNearestHostile(pos: Vector2D, myPlayerId: PlayerId, maxRange: number): Unit | Building | null {
    let nearest: Unit | Building | null = null;
    let minDist = maxRange;

    // Prioritize units (larva and eggs only when nothing else is in reach, like SC2)
    let passive: Unit | null = null;
    let passiveDist = maxRange;
    this.units.forEach(u => {
      if (u.playerId !== myPlayerId && !u.isDead && !u.untargetable && !isHiddenFrom(this, u, myPlayerId)) {
        const d = Math.hypot(u.pos.x - pos.x, u.pos.y - pos.y);
        if (isLarvaKind(u.type)) { if (d < passiveDist) { passiveDist = d; passive = u; } return; }
        if (d < minDist) {
          minDist = d;
          nearest = u;
        }
      }
    });

    if (nearest) return nearest;
    if (passive) return passive;

    // Check buildings
    this.buildings.forEach(b => {
      if (b.playerId !== myPlayerId && !b.isDead) {
        const d = Math.hypot(b.pos.x - pos.x, b.pos.y - pos.y);
        if (d < minDist) {
          minDist = d;
          nearest = b;
        }
      }
    });

    return nearest;
  }

  /**
   * Target acquisition: the nearest visible enemy unit in range (then structures), using the owner's doctrine target priority
   * ('nearest' for humans; computer opponents may focus fire 'low_hp' or 'high_threat').
   */
  public findTacticalTarget(
    pos: Vector2D,
    myPlayerId: PlayerId,
    maxRange: number,
    canTargetAir: boolean = true,
    canTargetGround: boolean = true,
    exclude?: (u: Unit) => boolean
  ): Unit | Building | null {
    const mode = this.doctrineFor(myPlayerId).targetPriority;
    let bestUnit: Unit | null = null;
    let bestScore = Infinity;

    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i]!;
      if (u.playerId === myPlayerId || u.isDead || u.untargetable) continue;
      if (isHiddenFrom(this, u, myPlayerId)) continue;
      if (exclude?.(u)) continue;
      if (u.isFlying && !canTargetAir) continue;
      if (!u.isFlying && !canTargetGround) continue;
      // Player units can only target enemies visible in Fog of War
      if (this.fogLimitsTargeting(myPlayerId) && !this.fog.isVisible(u.pos.x, u.pos.y)) continue;

      const d = Math.hypot(u.pos.x - pos.x, u.pos.y - pos.y);
      if (d > maxRange) continue;

      let score = d + (isLarvaKind(u.type) ? 1000 : 0); // larva / eggs are the last thing a unit picks
      if (mode === 'low_hp') {
        // Focus-fire wounded enemies to eliminate enemy DPS sources rapidly
        score = (u.health / u.maxHealth) * 12.0 + d * 0.25 + (isLarvaKind(u.type) ? 1000 : 0);
      } else if (mode === 'high_threat') {
        // Prioritize high-DPS threats (Hydralisk, Mutalisk, Roach, Siege Tank) over workers
        const dps = u.damage * u.attackSpeed;
        score = -dps * 0.8 + d * 0.35 + (isLarvaKind(u.type) ? 1000 : 0);
      }

      if (score < bestScore) {
        bestScore = score;
        bestUnit = u;
      }
    }

    if (bestUnit) return bestUnit;

    if (!canTargetGround && !canTargetAir) return null;

    let nearestBuilding: Building | null = null;
    let minBldDist = maxRange;
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i]!;
      if (b.playerId === myPlayerId || b.isDead) continue;
      if (this.fogLimitsTargeting(myPlayerId) && !this.fog.isExplored(b.pos.x, b.pos.y)) continue;
      if (b.isAirborne ? !canTargetAir : !canTargetGround) continue;
      const d = Math.hypot(b.pos.x - pos.x, b.pos.y - pos.y);
      if (d < minBldDist) {
        minBldDist = d;
        nearestBuilding = b;
      }
    }
    return nearestBuilding;
  }

  /** Cost, time and effect label for the next step of an upgrade, or an error. */
  public researchInfo(type: UpgradeType, pid: PlayerId): { name: string; minerals: number; gas: number; time: number; err?: string } | { err: string } {
    const upgrades = this.getUpgrades(pid);
    const faction: FactionType = pid === 'player' ? this.matchConfig.playerFaction : this.matchConfig.enemyFaction;
    const tech = RESEARCH.find(r => r.id === type);
    if (tech) {
      if (upgrades.techs?.[type]) return { err: `${tech.name} already researched!` };
      if (tech.req && !this.hasConstructed(pid, tech.req)) return { err: `${tech.name} requires ${BUILDING_CONFIGS[tech.req].name}` };
      return { name: tech.name, minerals: tech.minerals, gas: tech.gas, time: tech.time };
    }
    if (type === 'combat_shields') {
      if (upgrades.combatShields) return { err: 'Combat Shield already researched!' };
      return { name: 'Combat Shield', minerals: 100, gas: 100, time: 79 };
    }
    const line = UPGRADE_LEVELS[type]?.[faction];
    if (!line) return { err: 'Unknown upgrade' };
    const lvl = this.upgradeLevel(upgrades, type);
    if (lvl >= 3) return { err: `${line.name} already at maximum level!` };
    const c = line.levels[lvl]!;
    if (lvl >= 1) {
      // Level 2 needs Lair / Twilight Council / Armory, level 3 needs Hive / Twilight Council / Armory
      const need: BuildingType | null = faction === 'zerg' ? (lvl === 1 ? 'lair' : 'hive') : faction === 'protoss' ? 'twilight_council' : 'armory';
      if (need && !this.hasConstructed(pid, need)) return { err: `${line.name} Level ${lvl + 1} requires ${BUILDING_CONFIGS[need].name}` };
    }
    return { name: `${line.name} Level ${lvl + 1}`, minerals: c.minerals, gas: c.gas, time: c.time };
  }

  public upgradeLevel(u: PlayerUpgrades, type: UpgradeType): number {
    switch (type) {
      case 'weapons': return u.weaponsLevel;
      case 'melee_attacks': return u.meleeLevel ?? 0;
      case 'missile_attacks': return u.missileLevel ?? 0;
      case 'armor': return u.armorLevel;
      case 'vehicle_weapons': return u.vehicleWeaponsLevel;
      case 'vehicle_armor': return u.vehicleArmorLevel;
      case 'ship_weapons': return u.shipWeaponsLevel;
      case 'ship_armor': return u.shipArmorLevel;
      case 'shield_upgrade': return u.shieldLevel;
      default: return 0;
    }
  }

  /** True while any of pid's buildings is already researching this upgrade. */
  public isResearching(pid: PlayerId, type: UpgradeType): boolean {
    return this.buildings.some(b => b.playerId === pid && !b.isDead && b.research?.type === type);
  }

  /** Start researching: pays up front, then ticks on a free host building (one research at a time per building, like SC2). */
  public researchUpgrade(type: UpgradeType, pid: PlayerId = 'player'): { ok: boolean; msg: string } {
    if (this.shouldRoute({ playerId: pid })) {
      this.net.sendResearch(type);
      return { ok: true, msg: 'Research ordered' };
    }
    const res = this.resources[pid];
    const faction: FactionType = pid === 'player' ? this.matchConfig.playerFaction : this.matchConfig.enemyFaction;
    const hostType = researchHost(type, faction);
    if (!this.hasConstructed(pid, hostType)) return { ok: false, msg: `Requires a completed ${BUILDING_CONFIGS[hostType].name}` };
    const parent = techlabParentFor(type);
    const onRightParent = (b: Building) => !parent || b.addonParent(this)?.type === parent;
    if (parent && !this.buildings.some(b => b.playerId === pid && b.isConstructed && !b.isDead && b.type === hostType && onRightParent(b))) {
      return { ok: false, msg: `Requires a ${BUILDING_CONFIGS[parent].name} with a Tech Lab` };
    }
    const info = this.researchInfo(type, pid);
    if ('err' in info && info.err) return { ok: false, msg: info.err };
    const c = info as { name: string; minerals: number; gas: number; time: number };
    if (this.isResearching(pid, type)) return { ok: false, msg: `${c.name} is already being researched` };
    const host = this.buildings.find(b => b.playerId === pid && b.isConstructed && !b.isDead && prerequisiteMatches(hostType, b.type) && onRightParent(b) && !b.research && b.morphT <= 0);
    if (!host) return { ok: false, msg: `${BUILDING_CONFIGS[hostType].name} is busy` };
    if (res.minerals < c.minerals || res.gas < c.gas) return { ok: false, msg: `Requires ${c.minerals} Minerals${c.gas ? ` & ${c.gas} Gas` : ''}!` };
    res.minerals -= c.minerals; res.gas -= c.gas;
    host.research = { type, t: c.time, total: c.time, name: c.name, minerals: c.minerals, gas: c.gas };
    return { ok: true, msg: `Researching ${c.name} (${c.time}s)` };
  }

  /** Begin an in-place unit morph (Overlord->Overseer, Hydralisk->Lurker, Zergling->Baneling, Roach->Ravager, Corruptor->Brood Lord). */
  public startUnitMorph(u: Unit, to: string): string | null {
    const m = UNIT_MORPHS.find(x => x.to === to && x.from === u.type);
    if (!m) return 'Cannot morph';
    if (u.morph) return 'Already morphing';
    if (!this.hasConstructed(u.playerId, m.need)) return `Requires ${BUILDING_CONFIGS[m.need].name}`;
    const r = this.resources[u.playerId];
    if (r.minerals < m.minerals || r.gas < m.gas) return `Requires ${m.minerals} Minerals & ${m.gas} Gas`;
    const dSup = Math.max(0, UNIT_CONFIGS[m.to].supplyCost - UNIT_CONFIGS[m.from].supplyCost);
    if (r.supply + dSup > r.maxSupply) return 'Not enough supply';
    r.minerals -= m.minerals; r.gas -= m.gas; r.supply += dSup;
    u.burrowed = false;
    u.morph = { to: m.to, t: m.time, total: m.time, minerals: m.minerals, gas: m.gas, supply: dSup };
    return null;
  }

  /** Cancel a unit morph and refund it. */
  public cancelUnitMorph(u: Unit) {
    if (!u.morph) return;
    const r = this.resources[u.playerId];
    r.minerals += u.morph.minerals; r.gas += u.morph.gas; r.supply = Math.max(0, r.supply - u.morph.supply);
    u.morph = undefined;
  }

  private tickMorphs(dt: number) {
    for (const u of [...this.units]) {
      const m = u.morph;
      if (!m || u.isDead) continue;
      m.t -= dt;
      if (m.t > 0) continue;
      u.morph = undefined;
      const n = this.spawnUnit(m.to as UnitType, u.playerId, { x: u.pos.x, y: u.pos.y });
      n.rotation = u.rotation;
      n.health = Math.max(1, n.maxHealth * (u.health / u.maxHealth));
      n.isSelected = u.isSelected;
      if (u.isSelected) this.selectedEntities = this.selectedEntities.map(e => (e === u ? n : e));
      u.silent = true; u.isDead = true; // the cocoon is consumed; its supply now belongs to the new unit
      this.particles.spawnMuzzleFlash(n.getPosition3D(), 0x84cc16, 1.2);
    }
  }

  /** Cancel a building's research and refund 100%. */
  public cancelResearch(b: Building) {
    if (!b.research) return;
    const r = this.resources[b.playerId];
    r.minerals += b.research.minerals; r.gas += b.research.gas;
    b.research = null;
  }

  /** Per-frame research progress for every building. */
  private tickResearch(dt: number) {
    for (const b of this.buildings) {
      const r = b.research;
      if (!r || b.isDead) continue;
      r.t -= dt * (b.chronoTimer > 0 ? 1.5 : 1);
      if (r.t <= 0) { b.research = null; this.completeResearch(r.type, b.playerId); }
    }
  }

  /** Apply the effect of a finished research. */
  private completeResearch(type: UpgradeType, pid: PlayerId) {
    const upgrades = this.getUpgrades(pid);
    const say = (m: string) => { if (pid === this.localPid()) this.sound.playAdjutant('research', m); };
    const tech = RESEARCH.find(r => r.id === type);
    if (tech) {
      upgrades.techs = upgrades.techs ?? {};
      upgrades.techs[type] = true;
      this.units.forEach(u => { if (u.playerId === pid) this.applyTechToUnit(u, upgrades); });
      say(`${tech.name} research complete.`); return;
    }
    if (type === 'melee_attacks') { upgrades.meleeLevel = (upgrades.meleeLevel ?? 0) + 1; say(`Melee Attacks Level ${upgrades.meleeLevel} complete.`); return; }
    if (type === 'missile_attacks') { upgrades.missileLevel = (upgrades.missileLevel ?? 0) + 1; say(`Missile Attacks Level ${upgrades.missileLevel} complete.`); return; }
    if (type === 'weapons') { upgrades.weaponsLevel++; say(`Weapons Level ${upgrades.weaponsLevel} upgrade complete.`); return; }
    if (type === 'armor') {
      upgrades.armorLevel++;
      this.units.forEach(u => { if (u.playerId === pid && upgradeClassOf(u.type, u.isFlying) === 'infantry') u.armor += 1; });
      say(`Armor Level ${upgrades.armorLevel} upgrade complete.`); return;
    }
    const classUpg: Partial<Record<UpgradeType, { key: keyof PlayerUpgrades; cls: UpgradeClass; armor: boolean }>> = {
      vehicle_weapons: { key: 'vehicleWeaponsLevel', cls: 'vehicle', armor: false },
      vehicle_armor: { key: 'vehicleArmorLevel', cls: 'vehicle', armor: true },
      ship_weapons: { key: 'shipWeaponsLevel', cls: 'ship', armor: false },
      ship_armor: { key: 'shipArmorLevel', cls: 'ship', armor: true }
    };
    const cu = classUpg[type];
    if (cu) {
      (upgrades as any)[cu.key] = (upgrades[cu.key] as number) + 1;
      if (cu.armor) this.units.forEach(u => { if (u.playerId === pid && upgradeClassOf(u.type, u.isFlying) === cu.cls) u.armor += 1; });
      say('Upgrade complete.'); return;
    }
    if (type === 'shield_upgrade') {
      const nextLv = ++upgrades.shieldLevel;
      this.units.forEach(u => { if (u.playerId === pid) u.shieldArmor = nextLv; });
      this.buildings.forEach(b => { if (b.playerId === pid) b.shieldArmor = nextLv; });
      say(`Shield level ${nextLv} complete.`); return;
    }
    if (type === 'combat_shields') {
      upgrades.combatShields = true;
      this.units.forEach(u => { if (u.playerId === pid && u.type === 'marine') { u.maxHealth += 10; u.health += 10; } });
      say('Combat Shield research complete.'); return;
    }
  }

  private localPid(): PlayerId { return 'player'; }

  /** True when `pid` owns a fully constructed building of the given type. */
  public hasConstructed(pid: PlayerId, type: BuildingType): boolean {
    return this.buildings.some(b => b.playerId === pid && b.isConstructed && !b.isDead && (prerequisiteMatches(type, b.type)
      || (b.type === 'hatchery' && ((type === 'lair' && b.tier >= 1) || (type === 'hive' && b.tier >= 2)))));
  }

  /** Why a unit can't be produced yet (tech requirement), or null if OK. */
  /** The production roster for this match (see UNIT_SETS in config.ts). */
  public get unitSet(): UnitSetId { return this.matchConfig.unitSet ?? defaultUnitSet(this.matchConfig.mode); }
  /** True when the match's unit set offers this unit in production menus. */
  public unitAvailable(unitType: UnitType): boolean { return unitInSet(this.unitSet, unitType); }

  public unitLockReason(pid: PlayerId, unitType: UnitType): string | null {
    const morph = UNIT_MORPHS.find(m => m.to === unitType);
    if (morph) return `Morphs from a ${UNIT_CONFIGS[morph.from].name}`;
    if (unitType === 'mothership' && (this.units.some(u => u.playerId === pid && !u.isDead && u.type === 'mothership')
      || this.buildings.some(b => b.playerId === pid && !b.isDead && b.queue.some(q => q.type === 'mothership')))) return 'Only one Mothership at a time';
    const req = UNIT_TECH_REQUIREMENT[unitType];
    if (req && !this.hasConstructed(pid, req)) {
      return `Requires ${BUILDING_CONFIGS[req].name}`;
    }
    return null;
  }

  /** Why a building can't be placed yet (tech/cost/geyser), or null if OK. */
  public buildingLockReason(pid: PlayerId, type: BuildingType): string | null {
    const cfg = BUILDING_CONFIGS[type];
    if (cfg.prerequisite && !this.hasConstructed(pid, cfg.prerequisite)) {
      return `Requires ${BUILDING_CONFIGS[cfg.prerequisite].name}`;
    }
    return null;
  }

  /** Rebuild a building's 3D model after its type changed (e.g. Supply Depot raised/lowered). */
  public refreshBuildingModel(b: Building) {
    if (b.mesh) this.scene.remove(b.mesh);
    const mesh = modelFactory.createBuildingModel(b.type === 'hatchery' && b.tier >= 2 ? 'hive' : b.type, b.playerId === 'player');
    mesh.position.set(b.pos.x, b.height, b.pos.y);
    this.scene.add(mesh);
    b.mesh = mesh;
    b.updateConstructionVisuals();
  }

  /**
   * SC2-style placement rules. Returns the exact centre the structure will occupy and whether it is legal:
   *  - footprints snap to the cell grid: odd sizes (3x3, 5x5) centre on a cell centre, even sizes (2x2, 4x4) on a cell corner;
   *  - every footprint cell must be buildable (walkable, not a ramp, not already occupied);
   *  - gas structures can only go on a Vespene Geyser: the cursor snaps to the nearest free geyser's exact centre (one valid spot per geyser);
   *  - town halls may not sit within 3 cells of a mineral field or geyser (the resource no-build zone).
   */
  public resolvePlacement(type: BuildingType, raw: Vector2D): { pos: Vector2D; ok: boolean; msg: string } {
    const cfg = BUILDING_CONFIGS[type];
    const fw = cfg.footprint.width, fh = cfg.footprint.height;
    if (cfg.requiresRefineryGeyser) {
      let best: ResourceNode | null = null, bd = Infinity;
      for (const r of this.resourceNodes) {
        if (r.type !== 'vespene') continue;
        const d = Math.hypot(r.pos.x - raw.x, r.pos.y - raw.y);
        if (d < bd) { bd = d; best = r; }
      }
      if (!best || bd > 3.2) return { pos: { x: raw.x, y: raw.y }, ok: false, msg: 'Must be built on a Vespene Geyser' };
      const pos = { x: best.pos.x, y: best.pos.y };
      const taken = this.buildings.some(b => !b.isDead && BUILDING_CONFIGS[b.type].requiresRefineryGeyser && Math.hypot(b.pos.x - pos.x, b.pos.y - pos.y) < 1.5);
      return { pos, ok: !taken, msg: taken ? 'This geyser already has a structure' : '' };
    }
    const snap = (v: number, size: number) => (size % 2 === 1 ? Math.floor(v) + 0.5 : Math.round(v));
    const pos = { x: snap(raw.x, fw), y: snap(raw.y, fh) };
    if (!this.pathfinding.isAreaWalkable(pos.x - fw / 2, pos.y - fh / 2, fw, fh)) return { pos, ok: false, msg: 'Invalid building location!' };
    // Creep Tumors don't block pathing, but nothing can be built on top of one
    for (const b of this.buildings) {
      if (b.isDead || b.type !== 'creep_tumor') continue;
      if (Math.abs(b.pos.x - pos.x) < (fw + b.width) / 2 && Math.abs(b.pos.y - pos.y) < (fh + b.heightTiles) / 2) return { pos, ok: false, msg: 'Invalid building location!' };
    }
    // Zerg structures grow only on creep (Hatcheries and Extractors excepted): every tile of the footprint must be covered
    if (needsCreep(type)) {
      for (let x = pos.x - fw / 2 + 0.5; x < pos.x + fw / 2; x++) for (let y = pos.y - fh / 2 + 0.5; y < pos.y + fh / 2; y++)
        if (!this.creep.hasCreep(x, y)) return { pos, ok: false, msg: 'Must be built on creep' };
    }
    if (type === 'command_center' || type === 'orbital_command' || type === 'planetary_fortress' || type === 'hatchery' || type === 'nexus') {
      for (const r of this.resourceNodes) {
        const rw = r.type === 'vespene' ? 3 : 2, rh = r.type === 'vespene' ? 3 : 1;
        const gapX = Math.abs(r.pos.x - pos.x) - (fw + rw) / 2;
        const gapY = Math.abs(r.pos.y - pos.y) - (fh + rh) / 2;
        if (Math.max(gapX, gapY) < 3) return { pos, ok: false, msg: 'Too close to resources' };
      }
    }
    return { pos, ok: true, msg: '' };
  }

  /**
   * Authoritative building placement used by local input, the AI-free network host and PvP guests.
   * Deducts cost, spawns the structure under construction and dispatches the worker.
   */
  public placeBuilding(
    pid: PlayerId,
    type: BuildingType,
    pos: Vector2D,
    workerId: string | null,
    queued = false
  ): { ok: boolean; msg: string; building?: Building } {
    const cfg = BUILDING_CONFIGS[type];
    const res = this.resources[pid];
    // A structure is always placed by a living worker (a dead SCV left in the selection must not start one)
    const worker = workerId ? this.units.find(u => u.id === workerId && u.playerId === pid && !u.isDead && isWorkerType(u.type)) : undefined;
    if (!worker) return { ok: false, msg: 'Select a worker to build' };
    const lock = this.buildingLockReason(pid, type);
    if (lock) return { ok: false, msg: lock };
    const placed = this.resolvePlacement(type, pos);
    if (!placed.ok) return { ok: false, msg: placed.msg };
    pos = placed.pos;
    if (res.minerals < cfg.costMinerals) return { ok: false, msg: 'Not enough minerals!' };
    if (res.gas < cfg.costGas) return { ok: false, msg: 'Not enough Vespene gas!' };

    if (worker.type === 'drone' && cfg.race === 'zerg') {
      // Zerg: the drone walks to the spot and morphs into the structure; nothing is spent until it gets there
      worker.setCommand({ type: 'build', targetPos: { x: pos.x, y: pos.y }, buildingTypeToConstruct: type, queued });
      return { ok: true, msg: 'Drone is moving to build' };
    }
    res.minerals -= cfg.costMinerals;
    res.gas -= cfg.costGas;
    const building = this.spawnBuilding(type, pid, pos, false);
    if (worker.type === 'scv' && cfg.race === 'terran') {
      // SC2: the SCV walks over and builds it; the structure only progresses while that SCV welds (Shift queues it after current orders)
      building.needsBuilder = true;
      worker.setCommand({ type: 'repair', targetEntityId: building.id, queued });
    } else if (worker.type === 'probe') {
      // Protoss: the Probe warps the structure in and is free at once; it just walks to the spot like SC2
      worker.setCommand({ type: 'move', targetPos: { x: pos.x, y: pos.y + building.heightTiles * 0.5 + 1 }, queued });
      if (cfg.requiresRefineryGeyser) building.builderId = worker.id; // it starts harvesting the Assimilator when it finishes (if still idle)
    }
    return { ok: true, msg: 'Construction started', building };
  }

  /**
   * SC2: a Pylon's power field shows only when that Pylon is selected, or (for all of your own Pylons) while placing a
   * Protoss structure or aiming a Warp-In. Unfinished Pylons give no power, so they show nothing.
   */
  public updatePowerFields(showAllOwn: boolean) {
    for (const b of this.buildings) {
      if (!b.powerField) continue;
      b.powerField.visible = b.isConstructed && !b.isDead &&
        ((showAllOwn && b.playerId === 'player') || this.selectedEntities.includes(b));
    }
  }

  /** A Zerg drone reached its build spot: charge for the structure, start it, and the drone is consumed (its supply is freed). */
  private larvaRallyShown = new Set<string>();

  public droneBecomesBuilding(drone: Unit, type: BuildingType, pos: Vector2D) {
    drone.finishCommand();
    if (this.isNetGuest) return;
    const pid = drone.playerId, cfg = BUILDING_CONFIGS[type], res = this.resources[pid];
    const placed = this.resolvePlacement(type, pos);
    if (!placed.ok || res.minerals < cfg.costMinerals || res.gas < cfg.costGas) {
      if (pid === 'player') this.sound.playError?.();
      return; // the spot got blocked (or the money is gone): the drone just stays a drone
    }
    res.minerals -= cfg.costMinerals;
    res.gas -= cfg.costGas;
    this.spawnBuilding(type, pid, placed.pos, false);
    res.supply = Math.max(0, res.supply - UNIT_CONFIGS[drone.type].supplyCost);
    drone.silent = true; drone.isDead = true; // consumed without a death animation
    this.selectedEntities = this.selectedEntities.filter(e => e !== drone);
  }

  /** Queue production on a building on behalf of `pid`, with tech gating. */
  public produceFor(pid: PlayerId, buildingId: string, unitType: UnitType, larvaId?: string): { ok: boolean; msg: string } {
    const b = this.buildings.find(x => x.id === buildingId && x.playerId === pid);
    if (!b) return { ok: false, msg: 'No production building selected' };
    if (!BUILDING_CONFIGS[b.type].produces.includes(unitType) || !this.unitAvailable(unitType)) return { ok: false, msg: 'Cannot build that here' };
    const lock = this.unitLockReason(pid, unitType);
    if (lock) return { ok: false, msg: lock };
    if (b.isAirborne) return { ok: false, msg: 'Land the structure first' };
    if (b.type === 'gateway' && b.warpGate) return { ok: false, msg: 'Warp Gates warp units in at a Pylon: use the warp-in buttons' };
    if (TECHLAB_UNITS.has(unitType) && ['barracks', 'factory', 'starport'].includes(b.type) && !b.hasTechLab(this)) return { ok: false, msg: 'Requires a Tech Lab' };
    const cfg = UNIT_CONFIGS[unitType];
    const res = this.resources[pid];
    const supplyNeed = b.type === 'hatchery' && usesLarva(unitType) ? larvaSupply(unitType) : cfg.supplyCost;
    if (res.supply + supplyNeed > res.maxSupply) return { ok: false, msg: 'Additional supply required!' };
    if (res.minerals < cfg.costMinerals) return { ok: false, msg: `Not enough minerals! (Need ${cfg.costMinerals})` };
    if (res.gas < cfg.costGas) return { ok: false, msg: `Not enough Vespene gas! (Need ${cfg.costGas})` };
    if (b.type === 'hatchery' && usesLarva(unitType) && !this.isNetGuest && !larvaOf(this, b.id).length) return { ok: false, msg: 'No larva available!' };
    if (!b.queueUnit(unitType, this, larvaId)) return { ok: false, msg: b.isConstructed ? 'Production queue is full (max 5)!' : 'Still under construction!' };
    return { ok: true, msg: `Training ${cfg.name}...` };
  }

  /** Cancel a morphing egg: full refund and the larva comes back (host / single player; guests send `ecancel`). */
  public cancelEgg(pid: PlayerId, eggId: string): boolean {
    const egg = this.units.find(u => u.id === eggId && u.playerId === pid && u.type === 'egg');
    return !!egg && cancelEgg(this, egg);
  }

  public findHostilesInRange(pos: Vector2D, myPlayerId: PlayerId, range: number): (Unit | Building)[] {
    const list: (Unit | Building)[] = [];
    this.units.forEach(u => {
      if (u.playerId !== myPlayerId && !u.isDead && Math.hypot(u.pos.x - pos.x, u.pos.y - pos.y) <= range) {
        list.push(u);
      }
    });
    return list;
  }

  public findWoundedFriendlyBio(pos: Vector2D, myPlayerId: PlayerId, range: number): Unit | null {
    let candidate: Unit | null = null;
    let lowestHp = Infinity;

    this.units.forEach(u => {
      if (u.playerId === myPlayerId && !u.isDead && (u.type === 'marine' || u.type === 'marauder' || u.type === 'firebat' || u.type === 'medic')) {
        if (u.health < u.maxHealth) {
          const d = Math.hypot(u.pos.x - pos.x, u.pos.y - pos.y);
          if (d <= range && u.health < lowestHp) {
            lowestHp = u.health;
            candidate = u;
          }
        }
      }
    });

    return candidate;
  }

  public getNearbyUnits(pos: Vector2D, radius: number): Unit[] {
    const r2 = radius * radius;
    const out = this.nearbyScratch;
    out.length = 0;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i]!;
      const dx = u.pos.x - pos.x;
      const dy = u.pos.y - pos.y;
      if (dx * dx + dy * dy <= r2) {
        out.push(u);
      }
    }
    return out;
  }

  // Main Simulation Tick (60 FPS)
  /** Mission pathing blocker (data missions' `block` action, e.g. a point of no return): every tile whose centre is inside
   *  `shape` becomes an obstacle (on) or is released again (off). Only tiles this call blocked are released. */
  private missionBlocked = new Map<string, number[]>();
  public missionBlock(id: string, shape: Shape, on: boolean) {
    const prev = this.missionBlocked.get(id);
    if (!on) { for (const i of prev ?? []) this.pathfinding.setObstacle(i % MAP_SIZE, Math.floor(i / MAP_SIZE), false); this.missionBlocked.delete(id); return; }
    if (prev) return;
    const cells: number[] = [];
    for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) {
      if (!inShape(shape, x + 0.5, y + 0.5) || !this.pathfinding.isWalkable(x + 0.5, y + 0.5)) continue;
      this.pathfinding.setObstacle(x, y, true); cells.push(y * MAP_SIZE + x);
    }
    this.missionBlocked.set(id, cells);
  }

  /** Dead units / destroyed structures leave the selection at once, so the command card never acts for something gone. */
  public pruneDeadSelection() {
    // dead, and mission-scripted allies (Liberation Day civilians): never selectable, whatever path put them in the selection
    const dead = (e: unknown) => !!(e as { isDead?: boolean }).isDead || !!(e as { scripted?: boolean }).scripted;
    if (!this.selectedEntities.some(dead)) return;
    this.selectedEntities.forEach(e => { if (dead(e)) e.isSelected = false; });
    this.selectedEntities = this.selectedEntities.filter(e => !dead(e));
  }

  public update(dt: number) {
    if (this.isGameOver) return;
    this.inSim = true;
    try { this.step(dt); } finally { this.inSim = false; }
  }

  private step(dt: number) {
    useSimRng(this.rng);
    this.gameTime += dt;
    for (let i = this.delayed.length - 1; i >= 0; i--) { const d = this.delayed[i]!; d.t -= dt; if (d.t <= 0) { this.delayed.splice(i, 1); d.fn(); } }
    const guest = this.isNetGuest;
    if (this.net) this.net.update(dt);
    this.pruneDeadSelection();
    // waypoint lines for the selected Larva / Eggs
    const shown = new Set<string>();
    for (const e of this.selectedEntities) {
      if (e instanceof Unit && isLarvaKind(e.type) && e.rally && !e.isDead) { this.decals.updateRallyLine(e.id, e.getPosition3D(), e.rally); shown.add(e.id); }
    }
    // a selected production structure shows only its own waypoint (nothing for utility structures / when several are selected)
    if (this.selectedEntities.length === 1) {
      const sb = this.selectedEntities[0];
      if (sb instanceof Building && sb.canRally && sb.rallyPoint && !sb.isDead && sb.playerId === 'player' && !sb.isAirborne) {
        this.decals.updateRallyLine(sb.id, sb.getPosition3D(), sb.rallyPoint); shown.add(sb.id);
      }
    }
    for (const id of this.larvaRallyShown) if (!shown.has(id)) this.decals.removeRallyLine(id);
    this.larvaRallyShown = shown;
    if (!guest) { this.tickResearch(dt); this.tickMorphs(dt); }
    this.creep.update(dt, this.buildings, (x, y) => this.pathfinding.isCliff(x, y));

    // 1. Update Fog of War (Vision stamp grid updated at 20 Hz; smooth GPU texture interpolation at 60 Hz)
    PerformanceProfiler.get().start('fog');
    for (let i = this.scans.length - 1; i >= 0; i--) {
      this.scans[i]!.t -= dt;
      if (this.scans[i]!.t <= 0) this.scans.splice(i, 1);
    }
    if (this.fogTickCounter++ % 3 === 0) {
      this.fog.resetVision();
      for (const sc of this.scans) {
        if (sc.owner === 'player') this.fog.revealCircle(sc.x, sc.y, sc.r, 99, true);
      }
      for (let i = 0; i < this.units.length; i++) {
        const u = this.units[i]!;
        if (u.playerId === 'player') {
          this.fog.revealCircle(u.pos.x, u.pos.y, u.sightRange, u.height, u.isFlying);
        }
      }
      for (let i = 0; i < this.buildings.length; i++) {
        const b = this.buildings[i]!;
        if (b.playerId === 'player') {
          this.fog.revealCircle(b.pos.x, b.pos.y, b.sightRange, b.height, false);
        }
      }
      for (let i = 0; i < this.resourceNodes.length; i++) {
        const r = this.resourceNodes[i]!;
        if (r.mesh) {
          // a Refinery / Extractor / Assimilator replaces the geyser's rock vents (which would otherwise swallow the building)
          const capped = r.type === 'vespene' && this.buildings.some(b => (b.type === 'refinery' || b.type === 'extractor' || b.type === 'assimilator')
            && !b.isDead && Math.hypot(b.pos.x - r.pos.x, b.pos.y - r.pos.y) < 2.6);
          r.mesh.visible = !capped && this.fog.isExplored(r.pos.x, r.pos.y);
        }
      }
    }
    this.fog.updateTexture(dt);
    PerformanceProfiler.get().end('fog');

    // Mineral patches thin out crystal by crystal as they are mined (proportional to what is left)
    for (const r of this.resourceNodes) {
      const cs = r.mesh?.userData.crystals as THREE.Object3D[] | undefined;
      if (!cs || r.type !== 'minerals') continue;
      const want = r.amount <= 0 ? 0 : Math.max(1, Math.ceil(cs.length * r.amount / r.maxAmount));
      if (r.mesh!.userData.shown === want) continue;
      r.mesh!.userData.shown = want;
      for (let i = 0; i < cs.length; i++) cs[i]!.visible = i < want;
    }

    // 2. Update Units
    PerformanceProfiler.get().start('units');
    for (let i = this.units.length - 1; i >= 0; i--) {
      const unit = this.units[i]!;
      if (guest) unit.updatePuppet(dt, this); else unit.update(dt, this);

      if (unit.isDead && unit.silent) {
        // a hatched egg: just remove it (its supply now belongs to the units it hatched)
        if (unit.mesh) { this.scene.remove(unit.mesh); Outline.set(unit.mesh, false); }
        this.decals.removeHealthBar(unit.id);
        this.units.splice(i, 1);
        continue;
      }
      if (unit.isDead) {
        if (GameWorld.raceOf(unit.type) === 'zerg') this.sound.at(unit.pos.x, unit.pos.y).playZergDeath(['ultralisk', 'broodlord'].includes(unit.type), unit.type);
        else if (['marine', 'marauder', 'scv', 'medic', 'firebat', 'ghost', 'reaper'].includes(unit.type)) this.sound.at(unit.pos.x, unit.pos.y).playTerranDeath();
        else if (GameWorld.raceOf(unit.type) === 'protoss' && this.sound.at(unit.pos.x, unit.pos.y).playProtossDeath(unit.type)) { /* played */ }
        else this.sound.at(unit.pos.x, unit.pos.y).playExplosion(unit.type.includes('tank') || ['thor', 'thor_ap', 'archon', 'battlecruiser'].includes(unit.type));
        const seen = !unit.mesh || unit.mesh.visible;
        if (seen) {
          const dp = unit.mesh ? unit.mesh.position.clone() : new THREE.Vector3(unit.pos.x, unit.height, unit.pos.y);
          this.deathFx.unitDied(unit.type, dp, unit.radius, unit.mesh, unit.isFlying, unit.killedBy);
        } else if (unit.mesh) {
          this.scene.remove(unit.mesh);
        }
        if (unit.mesh) { Outline.set(unit.mesh, false); }
        this.decals.removeHealthBar(unit.id);
        
        // Return supply
        const config = UNIT_CONFIGS[unit.type];
        this.resources[unit.playerId].supply = Math.max(0, this.resources[unit.playerId].supply - (unit.egg ? unit.egg.supply : config.supplyCost)); // a killed egg frees the supply it reserved
        if (config.supplyProvided) this.resources[unit.playerId].maxSupply = Math.max(0, this.resources[unit.playerId].maxSupply - config.supplyProvided);
        
        this.units.splice(i, 1);
        continue;
      }

      if (unit.loadedIn) continue; // climbed into a Bunker during its own update

      // Update 3D mesh & visibility
      unit.updateMeshTransform();
      Outline.set(unit.mesh, unit.isSelected);
      if (unit.mesh && unit.mesh.userData.baseScale && !unit.isDead) {
        const bs = unit.mesh.userData.baseScale as THREE.Vector3;
        const zb = this.zoomBoost;
        unit.mesh.scale.set(bs.x * zb, bs.y * zb, bs.z * zb);
      }
      if (unit.mesh) {
        if (unit.playerId === 'enemy') {
          // Hide enemy units in fog of war!
          unit.mesh.visible = this.fog.isVisible(unit.pos.x, unit.pos.y) && !isHiddenFrom(this, unit, 'player');
        } else {
          unit.mesh.visible = true;
        }
        // Stealth / burrow visuals for units we can still see (own cloaked units shimmer, burrowed units sink)
        GameWorld.applyStealthVisual(unit.mesh, unit.cloaked || unit.burrowed);
        if (unit.burrowed) unit.mesh.position.y -= 0.55 * unit.mesh.scale.y;
      }

      // Health bar display for damaged units or selected
      // Health bars are always shown for every visible unit
      if (unit.mesh && unit.mesh.visible) {
        this.decals.updateBars(unit);
      } else {
        this.decals.removeHealthBar(unit.id);
      }
    }
    PerformanceProfiler.get().end('units');

    // 3. Update Buildings
    PerformanceProfiler.get().start('buildings');
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i]!;
      if (guest) b.updatePuppet(dt, this); else b.update(dt, this);

      if (b.isDead) {
        this.buildingFire.forget(b.id);
        if (b.cargo.length) unloadAll(this, b); // garrisoned units survive a destroyed Bunker
        if (b.salvaged) {
          if (b.mesh) this.scene.remove(b.mesh);
        } else {
          this.sound.at(b.pos.x, b.pos.y).playBuildingDeath(GameWorld.buildingRaceOf(b.type) === 'zerg');
          if (!b.mesh || b.mesh.visible) {
            this.deathFx.buildingDied(b.type, new THREE.Vector3(b.pos.x, b.height, b.pos.y), b.radius, b.mesh);
          } else if (b.mesh) {
            this.scene.remove(b.mesh);
          }
        }
        if (b.mesh) Outline.set(b.mesh, false);
        this.decals.removeHealthBar(b.id);
        this.decals.removeRallyLine(b.id);

        // Free footprint from pathfinding
        if (b.type !== 'creep_tumor') this.pathfinding.setAreaObstacle(
          b.pos.x - b.width / 2,
          b.pos.y - b.heightTiles / 2,
          b.width,
          b.heightTiles,
          false
        );

        // Remove supply provided
        const config = BUILDING_CONFIGS[b.type];
        if (config.supplyProvided > 0) {
          this.resources[b.playerId].maxSupply = Math.max(
            15,
            this.resources[b.playerId].maxSupply - config.supplyProvided
          );
        }

        this.buildings.splice(i, 1);
        continue;
      }

      Outline.set(b.mesh, b.isSelected);
      // Visibility
      if (b.mesh) {
        if (b.playerId === 'enemy') {
          b.mesh.visible = this.fog.isExplored(b.pos.x, b.pos.y);
        } else {
          b.mesh.visible = true;
        }
      }

      // Crippled structures smoke and burn (SC2-style); more fire the lower the health
      if (b.mesh && b.mesh.visible && b.isConstructed && BUILDING_CONFIGS[b.type]?.race === 'terran') {
        // Terran: fixed hot spots on the hull that catch one by one as health drops (BuildingFire)
        this.buildingFire.update(b.id, b.mesh, b.radius, b.health / b.maxHealth, dt);
      } else if (b.mesh && b.mesh.visible && b.isConstructed && b.health / b.maxHealth < 0.55) {
        const t = (this.burnTimers.get(b.id) ?? Math.random() * 0.3) - dt;
        if (t <= 0) {
          const sev = 1 - b.health / b.maxHealth / 0.55;
          const roof = b.roofY();
          this.particles.spawnBuildingBurn({ x: b.pos.x, y: roof, z: b.pos.y }, b.radius, sev);
          this.deathFx.burnSmoke(new THREE.Vector3(b.pos.x, roof, b.pos.y), b.radius, sev);
          this.burnTimers.set(b.id, 0.28 - sev * 0.14);
        } else this.burnTimers.set(b.id, t);
      } else if (this.burnTimers.size) this.burnTimers.delete(b.id);

      // Health bar for damaged or under construction
      if (b.mesh && b.mesh.visible) {
        this.decals.updateBars(b, true);
      } else {
        this.decals.removeHealthBar(b.id);
      }
    }
    PerformanceProfiler.get().end('buildings');

    // 3b. Destructible rocks: show when explored, remove (and unblock the path) when destroyed
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i]!;
      if (r.isDead) {
        const seen = !r.mesh || r.mesh.visible;
        if (seen) {
          for (let k = 0; k < 5; k++) {
            this.particles.spawnExplosionPuff(new THREE.Vector3(r.pos.x + (Math.random() - 0.5) * r.size, r.height + 0.8, r.pos.y + (Math.random() - 0.5) * r.size), 1.6);
          }
          this.sound.at(r.pos.x, r.pos.y).playExplosion(true);
        }
        if (r.mesh) { Outline.set(r.mesh, false); this.scene.remove(r.mesh); }
        this.decals.removeHealthBar(r.id);
        this.pathfinding.setAreaObstacle(r.pos.x - r.size / 2, r.pos.y - r.size / 2, r.size, r.size, false);
        this.selectedEntities = this.selectedEntities.filter(e => e !== (r as any));
        this.rocks.splice(i, 1);
        continue;
      }
      if (r.mesh) {
        r.mesh.visible = this.fog.isExplored(r.pos.x, r.pos.y);
        if (r.mesh.visible && r.health < r.maxHealth) {
          this.decals.updateHealthBar(r.id, r.getPosition3D(), r.health / r.maxHealth, false, 2.6, 2.6);
        } else this.decals.removeHealthBar(r.id);
      }
    }

    // 4. Update Decals & Selection Indicators (4 corners + inner ring)
    const selectedList = this.selectedEntities.map(ent => ({
      id: ent.id,
      pos: ent.getPosition3D(),
      radius: ent.radius,
      isPlayer: 'playerId' in ent ? (ent as any).playerId === 'player' : false,
      isNeutral: !('playerId' in ent) || (ent as any).playerId === 'neutral',
      isMineral: 'type' in ent && (ent as any).type === 'minerals'
    }));
    this.decals.updateSelectionRings(selectedList);

    // 5. Update Particles
    PerformanceProfiler.get().start('vfx');
    this.mission?.update(dt);
    this.particles.update(dt);
    this.particles.voidBeams?.update(dt, this.units, this.buildings, this.gameTime, this.sound);
    this.deathFx.update(dt);
    this.rangeRings.update(this.selectedEntities);
    PerformanceProfiler.get().end('vfx');

    // 6. Update AI (host / single-player only)
    if (!guest) this.ai.update(dt);

    // 7. Update Dynamic Classical Soundtrack
    this.sound.updateDynamicMusic(dt, this);

    // 7b. Adjutant "under attack" alerts (player entities that took damage this frame)
    if (!guest) this.checkUnderAttack();

    // 8. Victory / Defeat check (guest receives the result from the host)
    if (!guest) this.checkWinConditions();
  }

  /** Attack alert for the local player when an enemy Widow Mine starts burrowing with their units or structures in its range (already-burrowed mines never alert). */
  public mineBurrowAlert(mine: Unit) { mineBurrowAlertFor(this, mine, this.localPid()); }

  private checkUnderAttack() {
    let baseHit: { x: number; y: number } | null = null;
    let armyHit: { x: number; y: number } | null = null;
    for (const b of this.buildings) {
      if (b.playerId === 'player' && !b.isDead && b.sinceDamaged < 0.1 && !baseHit) baseHit = { x: b.pos.x, y: b.pos.y };
    }
    for (const u of this.units) {
      if (u.playerId !== 'player' || u.isDead || u.sinceDamaged >= 0.1 || u.type === 'mule') continue;
      if (isWorkerType(u.type)) { if (!baseHit) baseHit = { x: u.pos.x, y: u.pos.y }; } else if (!armyHit) armyHit = { x: u.pos.x, y: u.pos.y };
    }
    if (baseHit) this.sound.playAdjutant('base_attack', 'Our base is under attack.');
    else if (armyHit) this.sound.playAdjutant('army_attack', 'Our forces are under attack.');
  }

  /** Ends the match with a result decided by mission logic (campaign missions with their own win/lose rules). */
  public endMission(result: 'victory' | 'defeat') {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.gameResult = result;
    if (result === 'victory') this.units.forEach(u => { if (u.playerId === 'player' && !u.isDead) RiggedAnimator.victory(u); });
    this.sound.playAdjutant(result, result === 'victory' ? 'Mission accomplished.' : 'Mission failed.');
  }

  private checkWinConditions() {
    if (this.mission?.def.customWin) {
      // mission script decides victory; the only automatic rule is total loss of the player's forces
      const alive = this.buildings.some(b => b.playerId === 'player') || this.units.some(u => u.playerId === 'player' && !u.isDead && u.type !== 'mule' && !isLarvaKind(u.type));
      if (!alive) this.mission.lose('All friendly forces have been eliminated.');
      return;
    }
    const playerBuildings = this.buildings.filter(b => b.playerId === 'player');
    const enemyBuildings = this.buildings.filter(b => b.playerId === 'enemy');

    if (playerBuildings.length === 0 && this.units.filter(u => u.playerId === 'player' && u.type !== 'mule').length === 0) {
      this.isGameOver = true;
      this.gameResult = 'defeat';
      this.sound.playAdjutant('defeat', 'Defeat. All friendly forces have been eliminated.');
    } else if (enemyBuildings.length === 0 && this.units.filter(u => u.playerId === 'enemy' && u.type !== 'mule').length === 0) {
      this.isGameOver = true;
      this.gameResult = 'victory';
      this.units.forEach(u => { if (u.playerId === 'player' && !u.isDead) RiggedAnimator.victory(u); });
      this.sound.playAdjutant('victory', 'Victory! Sector cleared of enemy infestation!');
    }
  }
}
