import * as THREE from 'three';
import { RiggedAnimator } from '../graphics/RiggedAnimator';
import { WarpIn } from '../graphics/WarpIn';
import { ZergMorph } from '../graphics/ZergMorph';
import { TerranBuildingAnimator } from '../graphics/TerranBuildingAnimator';
import { muzzleWorldPos } from '../graphics/Muzzles';
import { Entity } from './Entity';
import type { Unit } from './Unit';
import { updateBunker } from './Bunker';
import { BuildingType, PlayerId, Vector2D, UnitType, UpgradeType, ProductionItem } from '../types';
import { BUILDING_CONFIGS, UNIT_CONFIGS, TECHLAB_UNITS, ZERG_REGEN_RATE } from '../config';
import { usesLarva } from './Mechanics';
import { larvaOf, larvaSupply, morphLarva, tickHatchery, initialLarva, larvaCount } from './Larva';
import { ProceduralGrassSystem } from '../graphics/ProceduralGrass';
import { needsCreep, OFF_CREEP_BLEED } from './CreepSystem';

/** SC2 structure radii by footprint size (BurnySc2/sc2-techtree data.json): 5x5 town halls, 3x3 production/tech, 2x2 depots/turrets/pylons, 1x1 Sensor Tower. */
const FOOTPRINT_RADIUS: Record<number, number> = { 5: 2.75, 3: 1.8125, 2: 1.125, 1: 0.75 };
/** Structures whose SC2 radius differs from the usual one for their footprint. */
const BUILDING_RADIUS: Partial<Record<BuildingType, number>> = {
  refinery: 1.6875, assimilator: 1.6875, extractor: 1.6875, dark_shrine: 1.5, spore_crawler: 0.875, creep_tumor: 1,
};

export class Building extends Entity {
  public override type: BuildingType;
  public width: number;
  public heightTiles: number;
  public isConstructed: boolean = false;
  public buildProgress: number = 0; // 0 to 1
  /** SC2 Terran rule: construction only advances while one SCV is welding it (it pauses if the SCV leaves or dies).
   *  Set for structures an SCV started; Protoss / Zerg, add-ons and computer-placed structures build on their own. */
  public needsBuilder = false;
  /** The SCV currently constructing this structure, and when it last welded (game seconds). */
  public builderId: string | null = null;
  /** Pylon only: the ground power-field decal (shown by GameWorld.updatePowerFields). */
  public powerField: THREE.Object3D | null = null;
  public lastWeldAt = -Infinity;
  public totalBuildTime: number;
  public queue: ProductionItem[] = [];
  public rallyPoint: Vector2D | null = null;
  public rallyTargetId: string | null = null;
  public isLowered: boolean = false;
  /** Ground units walk over it (SC2: a lowered Supply Depot or a Creep Tumor). */
  public get walkable(): boolean { return this.isLowered || this.type === 'creep_tumor'; }
  public attachedGeyserId: string | null = null;
  public attackCooldown: number = 0;
  public attackRange: number = 0;
  public damage: number = 0;
  public attackSpeed: number = 0;
  public canTargetAir: boolean = false;
  public canTargetGround: boolean = false;

  // --- Terran lift-off / landing (SC2: Command Center, Orbital Command, Barracks, Factory, Starport) ---
  public liftState: 'grounded' | 'rising' | 'flying' | 'landing' = 'grounded';
  /** 0..1 progress through the current rise / descent. */
  public liftT = 0;
  /** Height above the ground while airborne. */
  public flyY = 0;
  /** Where a flying structure is heading (move order) and where it will land (land order). */
  public flyDest: Vector2D | null = null;
  public landAt: Vector2D | null = null;
  /** In-place morph (Command Center -> Orbital Command): seconds left. */
  /** Upgrade being researched here (one at a time, like SC2). */
  public research: { type: UpgradeType; t: number; total: number; name: string; minerals: number; gas: number } | null = null;
  /** Hatchery evolution: 0 Hatchery, 1 Lair, 2 Hive (same structure, so larva / queens / supply carry over). */
  public tier = 0;
  /** Gateway that has become a Warp Gate (units warp in at a Pylon; no production queue). */
  public warpGate = false;
  public warpMorphT = 0;
  public morphT = 0;
  public morphTotal = 0;
  public morphTo: BuildingType | null = null;
  public morphCost = { minerals: 0, gas: 0 };
  /** Add-on construction lock on the parent (a Tech Lab / Reactor being built beside it). */
  public addonBuildingId: string | null = null;

  /** True while off the ground: not blocking, targetable by anti-air only, cannot produce. */
  public get isAirborne(): boolean { return this.liftState !== 'grounded'; }
  public get isFlying(): boolean { return this.liftState !== 'grounded'; }

  /** Where an add-on attaches (SC2: right of the parent, 2.5 across and 0.5 down). */
  /** Terran structures are yawed 45deg on the grid, so "right of the parent" is the rotated offset (2.12, 1.41), snapped to the 2x2 add-on's grid corner. */
  public static addonSpot(p: { x: number; y: number }): { x: number; y: number } {
    return { x: Math.round(p.x + 2.12), y: Math.round(p.y + 1.41) };
  }

  // Bunker (see Bunker.ts)
  public cargo: Unit[] = [];
  public salvaging = false;
  public salvageLeft = 0;
  public salvaged = false;

  // SC2 mechanics
  /** Zerg town hall larva (production is gated by larva). */
  /** Cached count of free larva (the larva themselves are Units: see Larva.ts). */
  public larva: number = 0;
  private larvaReady = false;
  public larvaTimer: number = 0;
  /** Active Queen injects (seconds remaining each); each completed inject spawns 3 larva. */
  public injects: number[] = [];
  /** Nexus Chrono Boost: production runs 50% faster while > 0. */
  public chronoTimer: number = 0;

  constructor(
    id: string,
    type: BuildingType,
    playerId: PlayerId,
    pos: Vector2D,
    instantlyBuilt: boolean = false
  ) {
    const config = BUILDING_CONFIGS[type];
    super(id, type, playerId, pos, config.maxHealth, config.armor, config.sightRange);
    this.type = type;
    this.attrs = ['armored', 'structure'];
    this.width = config.footprint.width;
    this.heightTiles = config.footprint.height;
    this.totalBuildTime = config.buildTime;
    this.radius = BUILDING_RADIUS[type] ?? FOOTPRINT_RADIUS[Math.max(this.width, this.heightTiles)] ?? Math.max(this.width, this.heightTiles) * 0.55;
    this.height = ProceduralGrassSystem.getTerrainHeight(pos.x, pos.y);
    this.attackRange = config.attackRange || 0;
    this.damage = config.damage || 0;
    this.attackSpeed = config.attackSpeed || 0;
    this.canTargetAir = !!config.canTargetAir;
    this.canTargetGround = !!config.canTargetGround;

    if (type === 'orbital_command' || type === 'nexus') { this.maxEnergy = 200; this.energy = 50; }
    if (type === 'shield_battery') { this.maxEnergy = 100; this.energy = 100; }

    if (instantlyBuilt) {
      this.isConstructed = true;
      this.buildProgress = 1.0;
      this.health = this.maxHealth;
    } else {
      this.isConstructed = false;
      this.buildProgress = 0.05;
      this.health = Math.floor(this.maxHealth * 0.1);
    }

    // Default rally point just slightly in front (production structures only)
    this.rallyPoint = this.canRally ? { x: pos.x, y: pos.y + this.heightTiles * 0.6 + 1.5 } : null;
  }

  /** Only structures that spawn units (Command Center, Barracks, Gateway, Hatchery...) have a rally point / waypoint. */
  public get canRally(): boolean { return (BUILDING_CONFIGS[this.type]?.produces?.length ?? 0) > 0; }

  /** The finished add-on (Tech Lab / Reactor) attached to this structure's add-on spot, or null. Works after re-landing too. */
  public addon(world: any): Building | null {
    if (this.isAirborne) return null;
    const { x: ax, y: ay } = Building.addonSpot(this.pos);
    for (const b of world.buildings as Building[]) {
      if ((b.type === 'techlab' || b.type === 'reactor') && !b.isDead && b.playerId === this.playerId && Math.abs(b.pos.x - ax) < 0.6 && Math.abs(b.pos.y - ay) < 0.6) {
        return b.isConstructed ? b : null;
      }
    }
    return null;
  }

  /** Add construction progress; life grows with it (SC2: 10% at the start, full at completion) and damage taken is kept. */
  public advanceConstruction(dp: number) {
    const before = this.buildProgress;
    this.buildProgress = Math.min(1, this.buildProgress + dp);
    this.health = Math.min(this.maxHealth, this.health + this.maxHealth * 0.9 * (this.buildProgress - before) / 0.95);
  }

  /** For a Tech Lab / Reactor: the grounded Barracks / Factory / Starport it is attached to, or null. */
  public addonParent(world: any): Building | null {
    if (this.type !== 'techlab' && this.type !== 'reactor') return null;
    for (const b of world.buildings as Building[]) {
      if (b.isDead || b.isAirborne || b.playerId !== this.playerId || !['barracks', 'factory', 'starport'].includes(b.type)) continue;
      const s = Building.addonSpot(b.pos);
      if (Math.abs(s.x - this.pos.x) < 0.6 && Math.abs(s.y - this.pos.y) < 0.6) return b;
    }
    return null;
  }

  /** Concurrent production slots: 2 with a Reactor, else 1. */
  public productionSlots(world: any): number { return this.addon(world)?.type === 'reactor' ? 2 : 1; }

  /** Tech Lab present (needed for Marauders, Siege Tanks, Thors, Banshees). */
  public hasTechLab(world: any): boolean { return this.addon(world)?.type === 'techlab'; }

  public canLift(): boolean {
    return this.isConstructed && this.liftState === 'grounded' && this.queue.length === 0 && this.morphT <= 0 && !this.addonBuildingId
      && ['command_center', 'orbital_command', 'barracks', 'factory', 'starport'].includes(this.type);
  }

  /** Lift off: the footprint is released at once; the structure rises over ~2 s. */
  public liftOff(world: any) {
    if (!this.canLift()) return;
    world.pathfinding.setAreaObstacle(this.pos.x - this.width / 2, this.pos.y - this.heightTiles / 2, this.width, this.heightTiles, false);
    this.liftState = 'rising'; this.liftT = 0; this.flyDest = null; this.landAt = null;
    this.rallyTargetId = null;
    world.particles.spawnMuzzleFlash(this.getPosition3D(), 0xc8b89a, 2.2);
    world.sound.at(this.pos.x, this.pos.y).playLiftOff();
  }

  private _roofOff = -1;
  /** World height of the top of the structure's model (measured once), for fire and smoke on the roof. */
  public roofY(): number {
    if (this._roofOff < 0) {
      if (!this.mesh) return this.height + 2;
      // top of the bulkiest part (the hull), so antennas and spires don't lift the fire into the air
      this.mesh.updateMatrixWorld(true);
      const box = new THREE.Box3(), size = new THREE.Vector3();
      let best = -1, top = this.mesh.position.y + 2;
      this.mesh.traverse(o => {
        const g = (o as THREE.Mesh).geometry;
        if (!g || !o.visible) return;
        if (!g.boundingBox) g.computeBoundingBox();
        box.copy(g.boundingBox!).applyMatrix4(o.matrixWorld).getSize(size);
        const vol = size.x * size.y * size.z;
        if (vol > best) { best = vol; top = box.max.y; }
      });
      this._roofOff = Math.max(0.5, Math.min(8, top - this.mesh.position.y));
    }
    return (this.mesh?.position.y ?? this.height) + this._roofOff;
  }

  /** Order a flying structure to a spot (move) or to land there. */
  public flyTo(dest: Vector2D, land: boolean) {
    if (!this.isAirborne) return;
    this.flyDest = { x: dest.x, y: dest.y };
    this.landAt = land ? { x: dest.x, y: dest.y } : null;
    if (this.liftState === 'landing') { this.liftState = 'rising'; this.liftT = 1 - this.liftT; }
  }

  private tickLift(dt: number, world: any) {
    const RISE = 2.0;
    const MAXY = 3.2;
    const ease = (t: number) => t * t * (3 - 2 * t);
    if (this.liftState === 'rising') {
      this.liftT = Math.min(1, this.liftT + dt / RISE);
      this.flyY = ease(this.liftT) * MAXY;
      if (this.liftT >= 1) { this.liftState = 'flying'; this.liftT = 0; }
    } else if (this.liftState === 'landing') {
      this.liftT = Math.min(1, this.liftT + dt / RISE);
      this.flyY = (1 - ease(this.liftT)) * MAXY;
      if (this.liftT >= 1) this.touchDown(world);
    }
    if (this.liftState === 'flying' && this.flyDest) {
      const dx = this.flyDest.x - this.pos.x, dy = this.flyDest.y - this.pos.y;
      const d = Math.hypot(dx, dy), step = 0.94 * dt; // SC2 flying-structure speed
      if (d <= step) {
        this.pos.x = this.flyDest.x; this.pos.y = this.flyDest.y; this.flyDest = null;
        if (this.landAt) this.beginLanding(world);
      } else { this.pos.x += (dx / d) * step; this.pos.y += (dy / d) * step; }
      this.height = ProceduralGrassSystem.getTerrainHeight(this.pos.x, this.pos.y);
    }
    // keep the model on the (moving / rising) structure; buildings do not get a per-frame transform update otherwise
    if (this.mesh) {
      const bob = this.liftState === 'flying' ? Math.sin(performance.now() / 700) * 0.06 : 0;
      this.mesh.position.set(this.pos.x, this.height + this.flyY + bob, this.pos.y);
    }
    // thruster glow while airborne
    if (this.isAirborne && Math.random() < dt * 8) {
      const p = this.getPosition3D();
      world.particles.spawnMuzzleFlash({ x: p.x + (Math.random() - 0.5) * 1.2, y: this.height + this.flyY + 0.2, z: p.z + (Math.random() - 0.5) * 1.2 }, 0xff9a3c, 0.35);
    }
  }

  private beginLanding(world: any) {
    const spot = world.resolvePlacement(this.type, this.landAt!);
    if (!spot.ok) {
      this.landAt = null;
      if (this.playerId === 'player') world.ui?.showToast?.(spot.msg || 'Cannot land here', true);
      return;
    }
    this.pos.x = spot.pos.x; this.pos.y = spot.pos.y;
    this.height = ProceduralGrassSystem.getTerrainHeight(this.pos.x, this.pos.y);
    this.liftState = 'landing'; this.liftT = 0; this.landAt = null;
  }

  private touchDown(world: any) {
    world.sound.at(this.pos.x, this.pos.y).playLand();
    this.liftState = 'grounded'; this.flyY = 0; this.liftT = 0; this.flyDest = null;
    world.pathfinding.setAreaObstacle(this.pos.x - this.width / 2, this.pos.y - this.heightTiles / 2, this.width, this.heightTiles, true);
    // units caught under the footprint are shoved clear
    for (const u of world.units) {
      if (u.isFlying || u.isDead) continue;
      if (Math.abs(u.pos.x - this.pos.x) < this.width / 2 + 0.3 && Math.abs(u.pos.y - this.pos.y) < this.heightTiles / 2 + 0.3) {
        const out = world.pathfinding.findNearestWalkable({ x: u.pos.x, y: u.pos.y }, 6);
        if (out) { u.pos.x = out.x; u.pos.y = out.y; }
      }
    }
    world.particles.spawnMuzzleFlash(this.getPosition3D(), 0xc8b89a, 2.4);
  }

  public override updateMeshTransform() {
    super.updateMeshTransform();
    if (this.mesh && this.flyY > 0) {
      const bob = this.liftState === 'flying' ? Math.sin(performance.now() / 700) * 0.06 : 0;
      this.mesh.position.y = this.height + this.flyY + bob;
    }
  }

  /** Send a freshly produced unit to this building's rally point (or resource / bunker rally target). */
  public sendToRally(unit: any, world: any) {
    if (this.rallyTargetId) {
      const targetNode = world.resourceNodes.find((r: any) => r.id === this.rallyTargetId);
      const rallyBunker = world.buildings.find((x: Building) => x.id === this.rallyTargetId && x.type === 'bunker' && !x.isDead);
      if (rallyBunker) {
        if (unit.type === 'marine' || unit.type === 'marauder') unit.setCommand({ type: 'load', targetEntityId: rallyBunker.id });
        else unit.setCommand({ type: 'move', targetPos: { x: rallyBunker.pos.x, y: rallyBunker.pos.y } });
      } else if (targetNode && (unit.type === 'scv' || unit.type === 'drone' || unit.type === 'probe')) {
        unit.setCommand({ type: 'gather', targetEntityId: targetNode.id });
      } else if (this.rallyPoint) {
        unit.setCommand({ type: 'move', targetPos: this.rallyPoint });
      }
    } else if (this.rallyPoint) {
      unit.setCommand({ type: 'move', targetPos: this.rallyPoint });
    }
  }

  // Queue a unit for production
  public queueUnit(unitType: UnitType, world: any, larvaId?: string): boolean {
    if (!this.isConstructed) return false;
    if (world.shouldRoute?.(this)) {
      world.net.sendProduce(this.id, unitType, larvaId);
      return true;
    }
    if (this.isAirborne || this.morphT > 0 || this.addonBuildingId) return false;
    const viaLarva = this.type === 'hatchery' && usesLarva(unitType);
    if (!viaLarva && this.queue.length >= (this.addon(world)?.type === 'reactor' ? 8 : 5)) return false; // eggs don't use the queue

    const unitConfig = UNIT_CONFIGS[unitType];
    const playerRes = world.resources[this.playerId];

    // Zerg: every unit morphs from one Larva of this Hatchery (it becomes an Egg that hatches in place)
    const larva = viaLarva ? (larvaId ? larvaOf(world, this.id).find(l => l.id === larvaId) : larvaOf(world, this.id)[0]) : undefined;
    if (viaLarva && !larva) return false;
    const supply = viaLarva ? larvaSupply(unitType) : unitConfig.supplyCost;

    // Check cost & supply
    if (playerRes.minerals < unitConfig.costMinerals) return false;
    if (playerRes.gas < unitConfig.costGas) return false;
    if (playerRes.supply + supply > playerRes.maxSupply) return false;

    if (viaLarva) {
      playerRes.minerals -= unitConfig.costMinerals;
      playerRes.gas -= unitConfig.costGas;
      playerRes.supply += supply;
      return morphLarva(world, this, unitType, larva!.id);
    }

    // Deduct resources
    playerRes.minerals -= unitConfig.costMinerals;
    playerRes.gas -= unitConfig.costGas;
    playerRes.supply += unitConfig.supplyCost;

    this.queue.push({
      type: unitType,
      progress: 0,
      totalTime: unitConfig.buildTime,
      costMinerals: unitConfig.costMinerals,
      costGas: unitConfig.costGas
    });

    return true;
  }

  /** Cancel an in-progress Orbital / Planetary upgrade: full refund (SC2). */
  public cancelMorph(world: any) {
    if (this.morphT <= 0) return;
    const r = world.resources[this.playerId];
    r.minerals += this.morphCost.minerals; r.gas += this.morphCost.gas;
    this.morphT = 0; this.morphTo = null; this.morphCost = { minerals: 0, gas: 0 };
  }

  /** Cancel a structure (or add-on) that is still under construction: 75% refund, removed silently (SC2). */
  public cancelConstruction(world: any) {
    if (this.isConstructed || this.isDead) return;
    const cfg = BUILDING_CONFIGS[this.type];
    const r = world.resources[this.playerId];
    r.minerals += Math.floor(cfg.costMinerals * 0.75); r.gas += Math.floor(cfg.costGas * 0.75);
    if (cfg.supplyProvided > 0) r.maxSupply = Math.min(200, r.maxSupply + cfg.supplyProvided); // the death handler subtracts it again
    this.salvaged = true; this.isDead = true; this.health = 0;
  }

  // Cancel production item
  public cancelQueueItem(index: number, world: any) {
    if (world.shouldRoute?.(this)) {
      world.net.sendCancel(this.id, index);
      return;
    }
    if (index < 0 || index >= this.queue.length) return;
    const item = this.queue[index]!;
    const unitConfig = UNIT_CONFIGS[item.type];
    const playerRes = world.resources[this.playerId];


    // Refund resources
    playerRes.minerals += item.costMinerals;
    playerRes.gas += item.costGas;
    playerRes.supply = Math.max(0, playerRes.supply - unitConfig.supplyCost);

    this.queue.splice(index, 1);
  }

  // Toggle Supply Depot Raise/Lower
  public toggleDepot(world: any) {
    if (this.type !== 'supply_depot' && this.type !== 'supply_depot_lowered') return;
    if (world.shouldRoute?.(this)) {
      world.net.sendAbility(this.id, 'depot');
      return;
    }

    this.isLowered = !this.isLowered;
    this.type = this.isLowered ? 'supply_depot_lowered' : 'supply_depot';
    world.refreshBuildingModel(this);

    // Update collision grid: lowered depots are walkable!
    const blocked = !this.isLowered;
    world.pathfinding.setAreaObstacle(
      this.pos.x - this.width / 2,
      this.pos.y - this.heightTiles / 2,
      this.width,
      this.heightTiles,
      blocked
    );
  }

  /** Visual-only update for a multiplayer guest (host owns production / combat). */
  public updatePuppet(dt: number, world?: any) {
    if (this.mesh) {
      if (this.type === 'command_center' || this.type === 'nexus' || this.type === 'pylon' || this.type === 'gateway' || this.type === 'stargate') {
        const radar = this.mesh.getObjectByName('radar');
        if (radar) radar.rotation.y += dt * 1.2;
      } else if ((this.type === 'engineering_bay' || this.type === 'forge') && this.isConstructed) {
        const dish = this.mesh.getObjectByName('turret');
        if (dish) dish.rotation.y += dt * 0.85;
      }
    }
    this.updateConstructionVisuals();
    TerranBuildingAnimator.update(this, dt, world);
    RiggedAnimator.updateBuilding(this, dt);
    WarpIn.update(this, dt);
    ZergMorph.update(this, dt);
  }

  public override update(dt: number, world: any) {
    // 0. Animate Command Center radar dish, Protoss crystals, or Engineering Bay / Forge telemetry in real time
    if (this.mesh) {
      if (
        this.type === 'command_center' ||
        this.type === 'nexus' ||
        this.type === 'pylon' ||
        this.type === 'gateway' ||
        this.type === 'stargate'
      ) {
        const radar = this.mesh.getObjectByName('radar');
        if (radar) radar.rotation.y += dt * 1.2;
      } else if ((this.type === 'engineering_bay' || this.type === 'forge') && this.isConstructed) {
        const dish = this.mesh.getObjectByName('turret');
        if (dish) dish.rotation.y += dt * 0.85;
      }
    }

    // Update Barracks progressive multi-stage construction visuals
    if (!this.stagesDone) this.updateConstructionVisuals();
    TerranBuildingAnimator.update(this, dt, world);
    RiggedAnimator.updateBuilding(this, dt);
    WarpIn.update(this, dt);
    ZergMorph.update(this, dt);

    // 1. Progress construction
    if (!this.isConstructed) {
      // Passive build (Protoss warp-in, Zerg morph, add-ons, computer-placed). SCV-built structures advance in Unit's construct step.
      if (!this.needsBuilder) this.advanceConstruction(dt / this.totalBuildTime);

      if (this.buildProgress >= 1.0) {
        this.buildProgress = 1.0;
        this.isConstructed = true;
        this.health = this.maxHealth;

        this.updateConstructionVisuals();

        // the Probe that warped in an Assimilator starts harvesting it, if it has nothing else to do
        if (this.builderId && !this.needsBuilder && BUILDING_CONFIGS[this.type]?.requiresRefineryGeyser) {
          const probe = world.findEntityById(this.builderId);
          if (probe && !probe.isDead && typeof probe.autoHarvestRefinery === 'function') probe.autoHarvestRefinery(this, world);
        }

        // TTS voice announcement for completed player structures
        if (this.playerId === 'player') {
          world.sound.playAdjutant('construction', 'Construction complete.');
          if ((BUILDING_CONFIGS[this.type] as any)?.race === 'zerg') world.sound.at(this.pos.x, this.pos.y).playZergStructureDone(this.type);
        }

        // Provide supply if depot or CC
        const config = BUILDING_CONFIGS[this.type];
        if (config.supplyProvided > 0) {
          world.resources[this.playerId].maxSupply = Math.min(
            200,
            world.resources[this.playerId].maxSupply + config.supplyProvided
          );
        }
      }
      return;
    }

    // SC2 mechanics: status upkeep, energy, larva & injects, chrono
    this.tickStatus(dt);
    if (this.maxEnergy > 0 && this.energy < this.maxEnergy) this.energy = Math.min(this.maxEnergy, this.energy + 0.7875 * dt);
    if (this.chronoTimer > 0) this.chronoTimer -= dt;
    if (this.type === 'gateway' && this.isConstructed && !this.warpGate && world.getUpgrades(this.playerId).techs?.warp_gate && this.queue.length === 0) {
      if (this.warpMorphT <= 0) this.warpMorphT = 7;       // SC2: Gateway -> Warp Gate transformation takes 7s
      this.warpMorphT -= dt;
      if (this.warpMorphT <= 0) { this.warpGate = true; this.warpMorphT = 0; }
    }
    if (this.type === 'shield_battery' && this.isConstructed && this.energy > 0) {
      // SC2 Shield Battery: restores up to 50.4 shields/s to friendly units and structures in range 6, 1 energy per 3 shields
      let budget = Math.min(50.4 * dt, this.energy * 3);
      const near = (e: any) => !e.isDead && e !== this && e.playerId === this.playerId && e.maxShield > 0 && e.shield < e.maxShield && Math.hypot(e.pos.x - this.pos.x, e.pos.y - this.pos.y) <= 6 + (e.radius ?? 0);
      const targets = [...world.units.filter(near), ...world.buildings.filter(near)].sort((a: any, b: any) => (a.shield / a.maxShield) - (b.shield / b.maxShield));
      for (const t of targets) {
        if (budget <= 0) break;
        const give = Math.min(budget, t.maxShield - t.shield);
        t.shield += give; budget -= give; this.energy -= give / 3;
      }
    }
    if (this.isAirborne) this.tickLift(dt, world);
    if (this.morphT > 0) {
      this.morphT -= dt;
      if (this.morphT <= 0) {
        this.morphT = 0;
        if (this.type === 'command_center' && this.morphTo === 'planetary_fortress') {
          this.type = 'planetary_fortress';
          const c = BUILDING_CONFIGS.planetary_fortress;
          this.armor = c.armor; this.attackRange = c.attackRange!; this.damage = c.damage!; this.attackSpeed = c.attackSpeed!;
          this.canTargetGround = true; this.canTargetAir = false;
          world.refreshBuildingModel(this);
          if (this.playerId === 'player') world.sound.playAdjutant?.('construction', 'Planetary Fortress complete.');
        } else if (this.type === 'hatchery' && (this.morphTo === 'lair' || this.morphTo === 'hive')) {
          this.tier = this.morphTo === 'lair' ? 1 : 2;
          this.maxHealth = BUILDING_CONFIGS[this.morphTo].maxHealth;
          this.health = Math.min(this.maxHealth, this.health + (this.maxHealth - BUILDING_CONFIGS.hatchery.maxHealth));
          world.refreshBuildingModel(this);
          if (this.playerId === 'player') world.sound.playAdjutant?.('construction', `${BUILDING_CONFIGS[this.morphTo].name} complete.`);
        } else if (this.type === 'spire' && this.morphTo === 'greater_spire') {
          this.type = 'greater_spire';
          world.refreshBuildingModel(this);
          if (this.playerId === 'player') world.sound.playAdjutant?.('construction', 'Greater Spire complete.');
        } else if (this.type === 'command_center') {
          this.type = 'orbital_command';
          this.maxEnergy = 200; this.energy = 50;
          world.refreshBuildingModel(this);
          if (this.playerId === 'player') world.sound.playAdjutant?.('construction', 'Orbital Command complete.');
        }
        this.morphTo = null;
      }
    }
    if (this.addonBuildingId) {
      const ab = world.buildings.find((x: Building) => x.id === this.addonBuildingId);
      if (!ab || ab.isDead || ab.isConstructed) this.addonBuildingId = null;
    }
    if (this.type === 'hatchery' && this.isConstructed && !world.isNetGuest) {
      if (!this.larvaReady) { this.larvaReady = true; initialLarva(world, this); }
      tickHatchery(world, this, dt);
      this.larva = larvaCount(world, this.id);
    }

    // Zerg structures regenerate passively once finished, on or off creep
    if (this.isConstructed && BUILDING_CONFIGS[this.type]?.race === 'zerg' && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + ZERG_REGEN_RATE * dt);
    }

    // Zerg structures bleed out slowly when the creep under them is gone
    if (this.isConstructed && !world.isNetGuest && needsCreep(this.type) && world.creep && !world.creep.hasCreep(this.pos.x, this.pos.y)) {
      this.health -= this.maxHealth * OFF_CREEP_BLEED * dt;
      if (this.health <= 0) { this.health = 1; this.takeDamage(1e6); }
    }

    // IL-2 Building Component Damage Smoke
    if (this.isConstructed && this.hasSmokeDamage() && BUILDING_CONFIGS[this.type]?.race !== 'terran') { // Terran fires: BuildingFire
      this.damageSmokeTimer -= dt;
      if (this.damageSmokeTimer <= 0) {
        this.damageSmokeTimer = 0.3;
        const p = this.getPosition3D(), r = this.radius * 0.6;
        world.particles.spawnDamageSmoke({ x: p.x + (Math.random() - 0.5) * r, y: this.roofY() - 0.6, z: p.z + (Math.random() - 0.5) * r }, this.hasCriticalDamage());
      }
    }

    // 2. Production Queue progress (scaled by IL-2 Production component health)
    const busy = this.isAirborne || this.morphT > 0 || !!this.addonBuildingId;
    for (let si = busy ? -1 : Math.min(this.productionSlots(world), this.queue.length) - 1; si >= 0; si--) {
      const activeItem = this.queue[si]!;
      const prodHp = this.getComponentHp('production');
      const prodMult = prodHp < 75 ? 0.5 + 0.5 * (prodHp / 75) : 1.0;
      const chrono = this.chronoTimer > 0 ? 1.5 : 1.0;
      // Zerg larva hatch in parallel: with N units queued the hatchery works N times as fast (max 3), like having several larva eggs at once
      const parallel = 1;
      activeItem.progress += (dt * prodMult * chrono * parallel) / activeItem.totalTime;

      if (activeItem.progress >= 1.0) {
        // Unit finished! Spawn unit at building exit
        const spawnPos = {
          x: this.pos.x + (si ? 0.9 : 0),
          y: this.pos.y + this.heightTiles * 0.5 + 1.2
        };

        const unit = world.spawnUnit(activeItem.type, this.playerId, spawnPos);
        
        // Audio confirmation when player unit is trained
        if (this.playerId === 'player') {
          if (activeItem.type === 'scv') {
            world.sound.playUnitReady('scv', 'SCV ready.');
          } else if (activeItem.type === 'marine') {
            world.sound.playUnitReady('marine', 'You wanna piece of me, boy?');
          } else if (activeItem.type === 'marauder') {
            world.sound.playUnitReady('marauder', 'Kaboom, baby!');
          } else if (activeItem.type === 'siege_tank') {
            world.sound.playUnitReady('siege_tank', 'Ready to roll out!');
          } else if (activeItem.type === 'medivac') {
            world.sound.playUnitReady('medivac', 'Need a lift?');
          } else if (activeItem.type === 'wraith') {
            world.sound.playUnitReady('wraith', 'Wraith standing by.');
          } else if (activeItem.type === 'banshee') {
            world.sound.playUnitReady('banshee', 'Engines screaming.');
          } else if (['ghost', 'reaper', 'firebat'].includes(activeItem.type)) {
            world.sound.playUnitReady(activeItem.type, 'Ready.');
          } else if (activeItem.type === 'probe') {
            world.sound.at(this.pos.x, this.pos.y).playWarpIn();
          } else if (activeItem.type === 'zealot' || activeItem.type === 'stalker' || ['archon', 'void_ray', 'adept', 'immortal', 'colossus', 'carrier', 'tempest', 'observer', 'warp_prism', 'disruptor', 'phoenix', 'oracle', 'mothership'].includes(activeItem.type)) {
            world.sound.at(this.pos.x, this.pos.y).playWarpIn();
          } else if (activeItem.type === 'drone' || activeItem.type === 'zergling' || activeItem.type === 'roach' || activeItem.type === 'hydralisk' || activeItem.type === 'mutalisk' || ['baneling', 'ravager', 'ultralisk', 'broodlord', 'viper', 'overlord', 'swarm_host', 'queen', 'infestor', 'corruptor', 'lurker'].includes(activeItem.type)) {
            world.sound.at(this.pos.x, this.pos.y).playLarvaHatch(activeItem.type);
          }
        }
        
        this.sendToRally(unit, world);

        this.queue.splice(si, 1);
      }
    }

    // 2b. Bunker: loaded units fire, salvage countdown
    if (this.type === 'bunker' && this.isConstructed) updateBunker(world, this, dt);

    // 3. Automated Defensive Turret Combat (Bunker, Missile Turret, Spine Crawler, Photon Cannon)
    if (this.damage > 0 && this.attackRange > 0) {
      if (this.attackCooldown > 0) {
        this.attackCooldown -= dt;
      }
      const target = world.findTacticalTarget
        ? world.findTacticalTarget(this.pos, this.playerId, this.attackRange, this.canTargetAir, this.canTargetGround)
        : world.findNearestHostile(this.pos, this.playerId, this.attackRange);

      if (target) {
        // Rotate turret head toward target
        if (this.mesh) {
          const turret = this.mesh.getObjectByName('turret');
          if (turret) {
            const aimAngle = Math.atan2(target.pos.x - this.pos.x, target.pos.y - this.pos.y);
            turret.rotation.y = aimAngle - this.rotation;
          }
        }

        if (this.attackCooldown <= 0) {
          this.attackCooldown = 1.0 / this.attackSpeed;
          TerranBuildingAnimator.triggerShoot(this);
          RiggedAnimator.buildingShot(this);
          const myPos3D = (world.deterministic ? null : muzzleWorldPos(this)) ?? { x: this.pos.x, y: this.height + 1.4, z: this.pos.y };
          const tgtPos3D = { x: target.pos.x, y: target.height + 0.85, z: target.pos.y };
          const cfgB = BUILDING_CONFIGS[this.type];
          const upgBonus = this.type === 'bunker' && world.getUpgrades ? world.getUpgrades(this.playerId).weaponsLevel : 0; // bunker marines get Infantry Weapons
          const bonusB = cfgB.bonusDamage && target.attrs.includes(cfgB.bonusDamage.type) ? cfgB.bonusDamage.amount : 0;
          const dmgOut = this.damage + upgBonus + bonusB;
          const hits = cfgB.attackCount ?? 1;
          const dealHits = () => Entity.withSource(this, () => { for (let i = 0; i < hits; i++) target.takeDamage(dmgOut); });

          // SC2 High-Ground Attacker Reveal: if enemy structure on high ground fires at player, briefly reveal it
          if (this.playerId === 'enemy' && this.height > 1.5) {
            world.fog.revealCircle(this.pos.x, this.pos.y, 3.8, this.height, true);
          }

          if (this.type === 'bunker') {
            world.sound.at(this.pos.x, this.pos.y).playMarineAttack();
            world.particles.spawnBulletFlash(myPos3D, tgtPos3D, dealHits);
          } else if (this.type === 'missile_turret') {
            world.sound.at(this.pos.x, this.pos.y).playMarauderAttack();
            world.particles.spawnHomingMissile(myPos3D, tgtPos3D, target, () => {
              dealHits();
            }, 2); // twin missiles (12 x2)
          } else if (this.type === 'planetary_fortress') {
            world.sound.at(this.pos.x, this.pos.y).playDeepBoom(0.75);
            world.particles.spawnSiegeShell(myPos3D, tgtPos3D, () => Entity.withSource(this, () => {
              target.takeDamage(dmgOut);
              // splash: 50% within 0.5, 25% within 1.25 (ground enemies only)
              world.units.forEach((u: Unit) => {
                if (u === target || u.isDead || u.playerId === this.playerId || u.isFlying) return;
                const d = Math.hypot(u.pos.x - target.pos.x, u.pos.y - target.pos.y);
                if (d <= 1.25) u.takeDamage(Math.max(1, Math.round(dmgOut * (d <= 0.5 ? 0.5 : 0.25))));
              });
            }));
          } else if (this.type === 'spine_crawler') {
            const snd = world.sound.at(this.pos.x, this.pos.y);
            if (!snd.playZergWeapon('spine_crawler')) snd.playHydraliskAttack();
            world.particles.spawnHydraliskSpine(myPos3D, tgtPos3D, dealHits);
          } else if (this.type === 'photon_cannon') {
            world.sound.at(this.pos.x, this.pos.y).playPhotonCannon();
            world.particles.spawnPhotonBall(myPos3D, tgtPos3D, target, dealHits);
          } else if (this.type === 'spore_crawler') {
            world.sound.at(this.pos.x, this.pos.y).playZergWeapon('spore_crawler');
            world.particles.spawnRoachAcid(myPos3D, tgtPos3D, dealHits);
          }
        }
      } else if (this.mesh && (this.type === 'missile_turret' || this.type === 'photon_cannon')) {
        // Idle radar scan rotation for Missile Turret / Photon Cannon
        const turret = this.mesh.getObjectByName('turret');
        if (turret) turret.rotation.y += dt * 0.9;
      }
    }
  }

  // Progressive multi-stage construction visualization for Terran Barracks
  // Stage 0: Concrete slab/foundation appears first
  // Stage 1: Lower main structural box appears on top
  // Stage 2: Upper twin-bay module box appears
  // Stage 3: Hangar doors and rooftop gantry box
  // Stage 4: Communications antenna mast, beacons & status lights
  private stagesDone = false;
  private stageMesh: any = null;

  /** Multi-phase construction reveal (slab -> lower -> upper -> tech) for staged Terran structures. */
  public updateConstructionVisuals() {
    if (!this.mesh) return;
    if (this.stageMesh !== this.mesh) { this.stageMesh = this.mesh; this.stagesDone = false; }
    if (this.stagesDone) return;

    const stage0 = this.mesh.getObjectByName('stage_0_foundation');
    const stage1 = this.mesh.getObjectByName('stage_1_lower');
    const stage2 = this.mesh.getObjectByName('stage_2_upper');
    const stage3 = this.mesh.getObjectByName('stage_3_hangar');
    const stage4 = this.mesh.getObjectByName('stage_4_tech');
    const scaffold = this.mesh.getObjectByName('stage_scaffold');
    if (!stage0) { this.stagesDone = true; return; }

    // temporary core block (Armory): rises from 22%, is replaced by the finished hull from 78%
    const core = this.mesh.getObjectByName('stage_core');
    if (core) {
      const pc = this.isConstructed ? 1 : this.buildProgress;
      core.visible = pc >= 0.22 && pc < 0.78;
      if (core.visible) core.scale.set(1, Math.min(1, Math.max(0.05, (pc - 0.22) / 0.3)), 1);
    }
    if (this.isConstructed) {
      if (stage0) { stage0.visible = true; stage0.scale.set(1, 1, 1); }
      if (stage1) { stage1.visible = true; stage1.scale.set(1, 1, 1); }
      if (stage2) { stage2.visible = true; stage2.scale.set(1, 1, 1); }
      if (stage3) { stage3.visible = true; stage3.scale.set(1, 1, 1); }
      if (stage4) { stage4.visible = true; stage4.scale.set(1, 1, 1); }
      if (scaffold) { scaffold.visible = false; }
      this.stagesDone = true;
      return;
    }

    if (scaffold) scaffold.visible = true;

    const p = this.buildProgress;

    // Stage 0: Concrete slab / foundation (0% - 100%)
    if (stage0) {
      stage0.visible = true;
      const s0 = Math.min(1.0, Math.max(0.15, p / 0.15));
      stage0.scale.set(1, s0, 1);
    }

    // Stage 1: First box appears (22% - 50%)
    if (stage1) {
      stage1.visible = p >= 0.22;
      if (stage1.visible) {
        const s1 = Math.min(1.0, Math.max(0.05, (p - 0.22) / 0.14));
        stage1.scale.set(1, s1, 1);
      }
    }

    // Stage 2: Second box appears (48% - 72%)
    if (stage2) {
      stage2.visible = p >= 0.48;
      if (stage2.visible) {
        const s2 = Math.min(1.0, Math.max(0.05, (p - 0.48) / 0.14));
        stage2.scale.set(1, s2, 1);
      }
    }

    // Stage 3: Hangar doors and rooftop gantry box (70% - 90%)
    if (stage3) {
      stage3.visible = p >= 0.70;
      if (stage3.visible) {
        const s3 = Math.min(1.0, Math.max(0.05, (p - 0.70) / 0.12));
        stage3.scale.set(1, s3, 1);
      }
    }

    // Stage 4: Communications mast and beacons (88% - 100%)
    if (stage4) {
      stage4.visible = p >= 0.88;
      if (stage4.visible) {
        const s4 = Math.min(1.0, Math.max(0.05, (p - 0.88) / 0.10));
        stage4.scale.set(s4, s4, s4);
      }
    }
  }
}
