import { isLarvaKind, larvaOf } from '../simulation/Larva';
import { LAYOUT, expansionSpots } from '../maps';
import { GameWorld } from '../simulation/GameWorld';
import { DIFFICULTY_CONFIGS, MAP_CONFIGS, UNIT_CONFIGS, BUILDING_CONFIGS, TECHLAB_UNITS, UNIT_MORPHS, isWorkerType } from '../config';
import { castAbility, abilityBlocked, ABILITIES } from '../simulation/Mechanics';
import { Building } from '../simulation/Building';
import { unloadAll } from '../simulation/Bunker';
import type { Unit } from '../simulation/Unit';
import type { BuildingType, UnitType } from '../types';
import { TECH_PLANS, UNIT_PLANS, RESEARCH_PLANS, techCap, paceOf, workerCap, terranAddonFor, type Race, type UnitPlan } from './plans';

/**
 * Computer opponent for all three races (the name is historical). Every think it:
 *  - runs the economy (workers, gas, supply) and follows its race's tech plan (src/ai/plans.ts) at a difficulty-scaled pace;
 *  - produces through the same gated paths a player uses (produceFor, unit morphs, Warp Gate warp-ins, Archon merges, add-ons),
 *    picking each unit by its weighted share of the planned army, adjusted for what it has scouted;
 *  - scouts, harasses, expands, uses abilities and sends attack waves.
 */
export class ZergAI {
  private world: GameWorld;
  private thinkTimer: number = 0;
  private waveCount: number = 0;
  private attackThreshold: number = 8;
  private isAttacking: boolean = false;
  public attackTargetPos: { x: number; y: number } | null = null;

  // --- Tiered AI: scouting, composition counters, harassment, expansion, ability use ---
  private gameClock = 0;
  private scoutId: string | null = null;
  private scoutDone = false;
  /** Largest number of each player unit type this AI has laid eyes on (cheater: perfect knowledge). */
  private seen: Record<string, number> = {};
  private harassIds: string[] = [];
  private harassNext = 70;
  private harassUntil = 0;
  private expandNext = 150;
  private abilityTimer = 0;
  /** Unit id -> game clock of its last AI mode switch (keeps Thors / Vikings from flip-flopping). */
  private modeSwitchedAt = new Map<string, number>();

  constructor(world: GameWorld) {
    this.world = world;
    this.reset();
  }

  public reset() {
    delete (this as any).update; // drop any instance-level override (e.g. a console / test hook that muted the AI) so every new match starts with a live AI
    this.thinkTimer = 0;
    this.waveCount = 0;
    const diffCfg = DIFFICULTY_CONFIGS[this.world.matchConfig?.difficulty || 'normal'];
    this.attackThreshold = diffCfg.attackThreshold;
    this.isAttacking = false;
    this.attackTargetPos = null;
    this.gameClock = 0;
    this.scoutId = null;
    this.scoutDone = false;
    this.seen = {};
    this.harassIds = [];
    this.harassNext = 70;
    this.harassUntil = 0;
    this.expandNext = 150;
    this.abilityTimer = 0;
    this.modeSwitchedAt = new Map();
    this.pendingWarps = [];
    this.built = new Set();
    this.addonBlocked = new Set();
    this.stats = { warpIns: new Set(), merges: 0, nydus: 0 };
    this.nydusLoaded = false;
    this.nydusNext = 0;
  }

  /** 0 = Recruit ... 5 = Cheater */
  private tier(): number {
    return ['easy', 'normal', 'hard', 'insane', 'elite', 'cheater'].indexOf(this.world.matchConfig?.difficulty || 'normal');
  }

  /** Fraction (0..1) of the player's army this AI believes is air / armored / light-bio (from scouting). */
  private playerProfile() {
    let air = 0, armored = 0, bio = 0, total = 0;
    for (const [t, n] of Object.entries(this.seen)) {
      const c = (UNIT_CONFIGS as any)[t];
      if (!c || !c.damage) continue;
      total += n;
      if (c.isFlying) air += n;
      if (c.armorType === 'armored' || c.armorType === 'massive') armored += n;
      if (c.armorType === 'light' || c.armorType === 'biological') bio += n;
    }
    const k = total || 1;
    return { total, air: air / k, armored: armored / k, bio: bio / k };
  }

  public update(dt: number) {
    // Disable AI when playing 1v1 Multiplayer PvP
    if (this.world.matchConfig?.mode === 'multiplayer_pvp') return;

    const diffCfg = DIFFICULTY_CONFIGS[this.world.matchConfig?.difficulty || 'normal'];
    this.thinkTimer += dt;
    if (this.thinkTimer < diffCfg.thinkInterval) return;
    this.thinkTimer = 0;

    // Bonus AI passive income scaling for Hard / Insane difficulties
    const enemyRes = this.world.resources['enemy'];
    if (diffCfg.incomeMultiplier > 1.0) {
      enemyRes.minerals += Math.round((diffCfg.incomeMultiplier - 1.0) * 18);
      enemyRes.gas += Math.round((diffCfg.incomeMultiplier - 1.0) * 8);
    }

    const faction = (this.world.matchConfig?.enemyFaction || 'zerg') as Race;
    const myUnits = this.world.units.filter(u => u.playerId === 'enemy' && !isLarvaKind(u.type));
    const myBuildings = this.world.buildings.filter(b => b.playerId === 'enemy' && !b.isDead);
    const townHalls = myBuildings.filter(b => this.hallTypes.has(b.type));

    // Combat-mode switches run even without a base (campaign enemies are often just an army)
    this.updateModes(myUnits);

    if (townHalls.length === 0) return; // Defeated or no base
    // the main is the oldest finished hall
    townHalls.sort((a, b) => Number(b.isConstructed) - Number(a.isConstructed) || a.id.localeCompare(b.id, undefined, { numeric: true }));
    const mainBase = townHalls[0]!;

    const workers = myUnits.filter(u => isWorkerType(u.type));
    const combatUnits = myUnits.filter(u => !isWorkerType(u.type) && u.type !== 'overlord' && u.type !== 'mule' && !u.morph);

    // 1. Worker Automation: idle workers mine at the nearest base
    workers.forEach(w => {
      if (!w.isGathering && !w.carriedResourceType && !w.currentCommand) {
        const minPatch = this.world.findNearestResource(w.pos, 'minerals');
        if (minPatch) w.setCommand({ type: 'gather', targetEntityId: minPatch.id });
      }
    });

    // 2. Economy, tech tree and production (src/ai/plans.ts)
    this.macro(faction, myUnits, myBuildings, townHalls, workers, enemyRes);

    // 2b. Tier features: scouting, abilities, expansion, harassment
    this.gameClock += diffCfg.thinkInterval;
    const tier = this.tier();
    this.updateScouting(myUnits, myBuildings, combatUnits, tier);
    this.updateAbilities(myUnits, myBuildings, mainBase, diffCfg.thinkInterval, tier);
    this.updateExpansion(townHalls, workers, enemyRes, faction, tier);
    this.updateHarass(combatUnits, tier, faction);
    this.updateNydus(combatUnits, tier);
    const harass = new Set(this.harassIds);
    // Queens stay home to inject; units riding the Nydus are handled by updateNydus
    const army = combatUnits.filter(u => !harass.has(u.id) && u.id !== this.scoutId && u.type !== 'queen' && !u.loadedIn && u.currentCommand?.type !== 'load');

    // 3. Tactical Defense & Attack Waves
    const invaders = this.world.findHostilesInRange(mainBase.pos, 'enemy', 18);
    if (invaders.length > 0) {
      [...army, ...combatUnits.filter(u => u.type === 'queen')].forEach(u => {
        if (!u.currentCommand || u.currentCommand.type !== 'attack') {
          u.setCommand({ type: 'attack_move', targetPos: invaders[0]!.pos });
        }
      });
      return;
    }

    // Launch Attack Wave if threshold reached
    if (army.length >= this.attackThreshold) {
      this.isAttacking = true;
      this.waveCount++;
      this.attackThreshold += diffCfg.waveGrowth;

      const playerTownHall = this.world.findNearestTownHall(mainBase.pos, 'player');
      const targetPos = playerTownHall ? playerTownHall.pos : { ...LAYOUT.playerBase };
      this.attackTargetPos = targetPos;

      army.forEach(u => {
        u.setCommand({ type: 'attack_move', targetPos });
      });

      if (this.waveCount === 1) {
        this.world.sound.playAdjutant('incoming', 'Warning! Enemy strike force detected marching on our position!');
      }
    } else if (this.isAttacking && army.length <= 2) {
      this.isAttacking = false;
    }
  }

  // ------------------------------------------------------------------ tier features
  private updateScouting(myUnits: any[], myBuildings: any[], combatUnits: any[], tier: number) {
    // Intel: a cheater knows everything; everyone else only remembers what their units / buildings actually see
    const counts: Record<string, number> = {};
    this.world.units.forEach(u => {
      if (u.playerId !== 'player' || u.isDead || u.type === 'mule' || isLarvaKind(u.type)) return;
      let known = tier >= 5;
      if (!known) {
        for (const m of myUnits) { if (Math.hypot(m.pos.x - u.pos.x, m.pos.y - u.pos.y) <= m.sightRange + 1) { known = true; break; } }
      }
      if (!known) for (const b of myBuildings) { if (Math.hypot(b.pos.x - u.pos.x, b.pos.y - u.pos.y) <= b.sightRange + 1) { known = true; break; } }
      if (known) counts[u.type] = (counts[u.type] || 0) + 1;
    });
    for (const [t, n] of Object.entries(counts)) this.seen[t] = Math.max(this.seen[t] || 0, n);

    if (tier < 1 || this.scoutDone || this.gameClock < 45) return;
    let scout = this.scoutId ? myUnits.find(u => u.id === this.scoutId && !u.isDead) : null;
    if (!scout) {
      // Cheapest non-worker goes on a tour of the player's base
      scout = [...combatUnits].sort((a, b) => (UNIT_CONFIGS as any)[a.type].costMinerals - (UNIT_CONFIGS as any)[b.type].costMinerals)[0];
      if (!scout) return;
      this.scoutId = scout.id;
      const p = this.world.findNearestTownHall(scout.pos, 'player')?.pos ?? { ...LAYOUT.playerBase };
      scout.setCommand({ type: 'move', targetPos: { x: p.x + 8, y: p.y + 8 } });
      scout.setCommand({ type: 'move', targetPos: { x: p.x - 8, y: p.y + 8 }, queued: true });
      scout.setCommand({ type: 'move', targetPos: { x: p.x - 8, y: p.y - 8 }, queued: true });
      scout.setCommand({ type: 'move', targetPos: { x: LAYOUT.enemyBase.x, y: LAYOUT.enemyBase.y }, queued: true });
      return;
    }
    if (!scout.currentCommand && scout.commandQueue.length === 0) { this.scoutDone = this.gameClock > 200; this.scoutId = null; }
  }

  /**
   * Thor and Viking mode switches, the way a sensible SC2 player uses them:
   *   Thor   - High Impact Payload when the nearby air is mostly Massive / armored capital ships (Battlecruiser, Carrier,
   *            Brood Lord, Tempest...), Explosive Payload when it is a swarm of Light flyers (Mutalisks, Banshees, Phoenixes).
   *   Viking - lands (Assault Mode) to fight ground units when no enemy air is within 18; lifts off (Fighter Mode) as soon as
   *            enemy air shows up, or when nothing on the ground is left to shoot.
   * Easy AIs never switch; a unit that just switched holds its mode for a few seconds.
   */
  private updateModes(myUnits: Unit[]) {
    const tier = this.tier();
    if (tier < 1) return;
    const w = this.world;
    const now = w.gameTime;
    for (const [id, t] of this.modeSwitchedAt) if (now - t > 30) this.modeSwitchedAt.delete(id);
    const hostiles = w.units.filter(x => x.playerId !== 'enemy' && !x.isDead && !x.cloaked && x.type !== 'larva' && x.type !== 'egg');
    const near = (u: Unit, r: number, air: boolean) => hostiles.filter(h => h.isFlying === air && Math.hypot(h.pos.x - u.pos.x, h.pos.y - u.pos.y) <= r);
    const hold = tier >= 3 ? 4 : 7; // seconds a unit keeps a mode before the AI may switch it again
    const sw = (u: Unit, key: 'E' | 'D') => { if (u.transformMode(w, key)) this.modeSwitchedAt.set(u.id, now); };
    for (const u of myUnits) {
      if (u.isDead || u.isTransforming || u.loadedIn) continue;
      if (now - (this.modeSwitchedAt.get(u.id) ?? -99) < hold) continue;
      if (u.type === 'thor' || u.type === 'thor_ap') {
        const air = near(u, 14, true);
        if (!air.length) continue;
        let massive = 0, light = 0;
        for (const a of air) { if (a.attrs.includes('massive')) massive++; else if (a.attrs.includes('light')) light++; }
        if (u.type === 'thor' && massive > 0 && light < massive * 3) sw(u, 'E');
        else if (u.type === 'thor_ap' && (massive === 0 ? light >= 1 : light >= massive * 4)) sw(u, 'D');
      } else if (u.type === 'viking') {
        if (tier < 2 || near(u, 18, true).length) continue; // wider than the lift-off radius (12) so it doesn't bob up and down at the edge
        const ground = near(u, 9, false).filter(h => !UNIT_CONFIGS[h.type]?.isFlying);
        if (ground.length && w.pathfinding.isWalkable(u.pos.x, u.pos.y)) sw(u, 'D');
      } else if (u.type === 'siege_tank') {
        // siege up when ground targets come into siege range (13)
        if (near(u, 13, false).filter(h => !UNIT_CONFIGS[h.type]?.isFlying).length) sw(u, 'E');
      } else if (u.type === 'siege_tank_sieged') {
        const structures = w.buildings.some(b => b.playerId !== 'enemy' && !b.isDead && Math.hypot(b.pos.x - u.pos.x, b.pos.y - u.pos.y) <= 13);
        if (!near(u, 15, false).length && !structures) sw(u, 'D');
      } else if (u.type === 'viking_assault') {
        const structures = w.buildings.some(b => b.playerId !== 'enemy' && !b.isDead && Math.hypot(b.pos.x - u.pos.x, b.pos.y - u.pos.y) <= 8);
        if (near(u, 12, true).length || (!near(u, 11, false).length && !structures)) sw(u, 'E');
      }
    }
  }

  private updateAbilities(myUnits: any[], myBuildings: any[], mainBase: any, dtThink: number, tier: number) {
    this.abilityTimer += dtThink;
    if (this.abilityTimer < 1.5 || tier < 1) return;
    this.abilityTimer = 0;
    const w = this.world;
    const cast = (c: any, id: string, target: any = {}) => { if (!abilityBlocked(w, c, ABILITIES[id]!)) castAbility(w, c, id, target); };

    for (const b of myBuildings as Building[]) {
      if (!b.isConstructed) continue;
      if (b.type === 'command_center' && b.queue.length === 0 && b.morphT <= 0) {
        const er = w.resources['enemy'];
        if (b !== mainBase) {
          // expansions are fortified: Planetary Fortress (needs an Engineering Bay)
          if (er.minerals >= 175 && er.gas >= 150 && w.hasConstructed('enemy', 'engineering_bay')) cast(b, 'planetary');
        } else if (er.minerals >= 250 && w.hasConstructed('enemy', 'barracks')) cast(b, 'orbital'); // the main gets MULEs / scans
      }
      if (b.type === 'orbital_command' && b.energy >= 50) {
        const patch = w.findNearestResource(b.pos, 'minerals');
        if (patch) cast(b, 'mule', { nodeId: patch.id });
      }
      if (b.type === 'nexus' && b.energy >= 50) {
        const target = (myBuildings as Building[]).find(x => x.isConstructed && x.queue.length > 0 && x.chronoTimer <= 0);
        if (target) cast(b, 'chrono', { entity: target });
      }
    }
    for (const u of myUnits as Unit[]) {
      if (u.isDead) continue;
      if (u.type === 'queen') {
        const hatch = (myBuildings as Building[]).filter(x => x.type === 'hatchery' && x.isConstructed)
          .sort((a, b) => Math.hypot(a.pos.x - u.pos.x, a.pos.y - u.pos.y) - Math.hypot(b.pos.x - u.pos.x, b.pos.y - u.pos.y))[0];
        if (hatch && u.energy >= 25 && hatch.injects.length < 2) {
          if (Math.hypot(hatch.pos.x - u.pos.x, hatch.pos.y - u.pos.y) > 6) { if (!u.currentCommand) u.setCommand({ type: 'move', targetPos: { x: hatch.pos.x, y: hatch.pos.y + 3 } }); }
          else cast(u, 'inject', { entity: hatch });
        }
        const hurt = (myUnits as Unit[]).find(x => x !== u && x.health < x.maxHealth * 0.45 && Math.hypot(x.pos.x - u.pos.x, x.pos.y - u.pos.y) < 6);
        if (hurt && u.energy >= 50 && tier >= 2) cast(u, 'transfuse', { entity: hurt });
      } else if (u.type === 'sentry' && u.energy >= 75 && w.findNearestHostile(u.pos, 'enemy', 8)) {
        cast(u, 'guardian');
      } else if (u.type === 'wraith' && tier >= 3 && !u.cloaked && u.energy >= 40 && w.findNearestHostile(u.pos, 'enemy', 9)) {
        cast(u, 'cloak');
      } else if (u.type === 'stalker' && tier >= 3 && u.health < u.maxHealth * 0.3 && !u.abilityCd.blink) {
        const threat = w.findNearestHostile(u.pos, 'enemy', 7);
        if (threat) {
          const dx = u.pos.x - threat.pos.x, dy = u.pos.y - threat.pos.y, d = Math.hypot(dx, dy) || 1;
          cast(u, 'blink', { pos: { x: u.pos.x + (dx / d) * 8, y: u.pos.y + (dy / d) * 8 } });
        }
      } else if ((u.type === 'marine' || u.type === 'marauder') && tier >= 2 && !u.isStimmed && u.health > 35 && u.attackCooldown > 0) {
        u.activateStimpack(w);
      } else if (u.type === 'roach' && tier >= 3 && u.health < u.maxHealth * 0.3 && !u.burrowed) {
        cast(u, 'burrow');
      } else if (u.type === 'roach' && u.burrowed && u.health > u.maxHealth * 0.8) {
        cast(u, 'burrow');
      }
    }
    // Scanner Sweep on an unseen cloaked / burrowed player unit near our base
    if (tier >= 2) {
      const cc = (myBuildings as Building[]).find(x => x.type === 'orbital_command' && x.isConstructed && x.energy >= 50);
      const ghost = w.units.find(x => x.playerId === 'player' && (x.cloaked || x.burrowed) && Math.hypot(x.pos.x - mainBase.pos.x, x.pos.y - mainBase.pos.y) < 22);
      if (cc && ghost) cast(cc, 'scan', { pos: { x: ghost.pos.x, y: ghost.pos.y } });
    }
    // Spellcasters and units that only fight in a special state
    const foesNear = (p: { x: number; y: number }, r: number, ground?: boolean) => w.units.filter(x => x.playerId !== 'enemy' && !x.isDead && !isLarvaKind(x.type) && !x.loadedIn
      && (ground === undefined || x.isFlying !== ground) && Math.hypot(x.pos.x - p.x, x.pos.y - p.y) <= r);
    /** Centre of the densest enemy clump (>= `min` units within 2) in range `r`, or null. */
    const clump = (u: Unit, r: number, min: number) => {
      const foes = foesNear(u.pos, r);
      let best: { x: number; y: number } | null = null, bestN = min - 1;
      for (const f of foes) {
        const n = foes.filter(o => Math.hypot(o.pos.x - f.pos.x, o.pos.y - f.pos.y) <= 2).length;
        if (n > bestN) { bestN = n; best = { x: f.pos.x, y: f.pos.y }; }
      }
      return best;
    };
    for (const u of myUnits as Unit[]) {
      if (u.isDead || u.loadedIn || u.morph) continue;
      if (u.type === 'high_templar' && tier >= 2 && u.energy >= 75) {
        const c = clump(u, 9, 4); if (c) cast(u, 'psionic_storm', { pos: c });
      } else if (u.type === 'infestor' && tier >= 2 && u.energy >= 75) {
        const c = clump(u, 10, 4); if (c) cast(u, 'fungal', { pos: c });
      } else if (u.type === 'raven' && u.energy >= 50) {
        const f = foesNear(u.pos, 6)[0]; if (f) cast(u, 'auto_turret', { pos: { x: (u.pos.x + f.pos.x) / 2, y: (u.pos.y + f.pos.y) / 2 } });
      } else if (u.type === 'lurker' || u.type === 'widow_mine') {
        // they only attack while burrowed: dig in when ground targets come close, pop up when nothing is around
        const near = foesNear(u.pos, u.type === 'lurker' ? 9 : 6, u.type === 'lurker' ? false : undefined).length > 0;
        if (near !== !!u.burrowed && !(u as any).burrowTransition && !u.abilityCd.burrow) cast(u, 'burrow');
      }
    }
    // Queens past the injectors spread creep; tumors pass it on towards the player
    const queens = (myUnits as Unit[]).filter(u => u.type === 'queen' && !u.isDead).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const halls = (myBuildings as Building[]).filter(b => b.type === 'hatchery' && b.isConstructed).length;
    const tumors = (myBuildings as Building[]).filter(b => b.type === 'creep_tumor' && !b.isDead);
    const towards = this.world.findNearestTownHall(mainBase.pos, 'player')?.pos ?? LAYOUT.playerBase;
    const spreadFrom = (c: Unit | Building, reach: number, id: string) => {
      const base = Math.atan2(towards.y - c.pos.y, towards.x - c.pos.x);
      for (let k = 0; k < 7; k++) {
        const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5;
        const p = { x: c.pos.x + Math.cos(a) * reach, y: c.pos.y + Math.sin(a) * reach };
        if (w.creep?.hasCreep(p.x, p.y) && w.resolvePlacement('creep_tumor', p).ok && !castAbility(w, c, id, { pos: p })) return true;
      }
      return false;
    };
    if (tier >= 1 && tumors.length < 4 + tier * 3) {
      for (const q of queens.slice(halls)) if (q.energy >= 25 && !w.findNearestHostile(q.pos, 'enemy', 8)) spreadFrom(q, 5, 'creep_tumor');
      for (const t of tumors) if (t.isConstructed && !(t as any).tumorSpent && !t.abilityCd.spread_tumor) spreadFrom(t, 8, 'spread_tumor');
    }
  }

  private updateExpansion(townHalls: any[], workers: any[], res: any, faction: string, tier: number) {
    if (tier < 1 || this.gameClock < this.expandNext || this.gameClock < 150 * paceOf(tier)) return;
    const maxHalls = [1, 2, 3, 3, 4, 4][tier]!;
    if (townHalls.length >= maxHalls) return;
    const type = faction === 'zerg' ? 'hatchery' : faction === 'protoss' ? 'nexus' : 'command_center';
    const cost = BUILDING_CONFIGS[type as keyof typeof BUILDING_CONFIGS].costMinerals;
    if (res.minerals < cost + 50) return;
    const mapCfg = MAP_CONFIGS[this.world.matchConfig.mapId] || MAP_CONFIGS.sector_vanguard;
    const mine = townHalls[0]!;
    const taken = (p: any) => townHalls.some(t => Math.hypot(t.pos.x - p.x, t.pos.y - p.y) < 12) || this.world.buildings.some(b => b.playerId === 'player' && Math.hypot(b.pos.x - p.x, b.pos.y - p.y) < 12);
    const spot = [...expansionSpots(mapCfg.expansionPositions)].filter(p => !taken(p)).sort((a, b) => Math.hypot(a.x - mine.pos.x, a.y - mine.pos.y) - Math.hypot(b.x - mine.pos.x, b.y - mine.pos.y))[0];
    this.expandNext = this.gameClock + (res.minerals > 800 ? 45 : 90); // a mineral bank means it's time for more bases (and their gas)
    if (!spot) return;
    // the expansion's own spot (its resources sit 3 cells from a hall placed there, like SC2); old offset spot as a fallback
    const exact = this.world.resolvePlacement(type as any, { x: spot.x, y: spot.y });
    const pos = exact.ok ? exact.pos : this.world.pathfinding.findNearestWalkable({ x: spot.x, y: spot.y + 4 }, 6);
    this.world.spawnBuilding(type as any, 'enemy', pos, false);
    res.minerals -= cost;
    // Send a handful of workers to saturate the new base
    workers.slice(0, 4).forEach(wk => {
      const node = this.world.findNearestResource(spot, 'minerals');
      if (node) wk.setCommand({ type: 'gather', targetEntityId: node.id });
    });
  }

  /**
   * Nydus play (Hard+): once the Nydus Network is up and the army is big enough, summon a Worm outside the player's main,
   * send a squad of ground units into the Network and pour them out of the Worm (SC2: every Nydus structure shares its cargo).
   */
  private nydusNext = 0;
  private updateNydus(combat: Unit[], tier: number) {
    if (tier < 2) return;
    const w = this.world;
    const net = this.m.buildings.find(b => b.type === 'nydus_network' && b.isConstructed);
    if (!net) return;
    const worm = this.m.buildings.find(b => b.type === 'nydus_worm' && !b.isDead);
    const target = w.findNearestTownHall(net.pos, 'player');
    const ground = combat.filter(u => !u.isFlying && u.type !== 'queen' && !u.burrowed && !u.loadedIn && !this.harassIds.includes(u.id));
    if (!worm) {
      this.nydusLoaded = false;
      if (!target || ground.length < 10 || this.gameClock < this.nydusNext) return;
      const base = Math.atan2(net.pos.y - target.pos.y, net.pos.x - target.pos.x);
      for (let k = 0; k < 9; k++) {
        const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.35;
        const p = { x: target.pos.x + Math.cos(a) * 15, y: target.pos.y + Math.sin(a) * 15 };
        if (w.resolvePlacement('nydus_worm', p).ok && !castAbility(w, net, 'nydus_worm', { pos: p })) { this.stats.nydus++; this.nydusNext = this.gameClock + 150; return; }
      }
      this.nydusNext = this.gameClock + 20;
      return;
    }
    if (!worm.isConstructed) return;
    if (!this.nydusLoaded) {
      ground.slice(0, 8).forEach(u => u.setCommand({ type: 'load', targetEntityId: net.id }));
      this.nydusLoaded = true;
    }
    if (net.cargo.length) {
      const riders = [...net.cargo];
      net.cargo.length = 0;
      for (const u of riders) { u.loadedIn = worm.id; worm.cargo.push(u); }
      unloadAll(w, worm);
      const goal = target ? { x: target.pos.x, y: target.pos.y } : { ...LAYOUT.playerBase };
      riders.forEach(u => u.setCommand({ type: 'attack_move', targetPos: goal }));
    }
  }

  private updateHarass(combatUnits: any[], tier: number, faction: string) {
    if (tier < 2) return;
    this.harassIds = this.harassIds.filter(id => this.world.units.some(u => u.id === id && !u.isDead));
    if (this.harassIds.length > 0) {
      if (this.gameClock >= this.harassUntil) {
        // Pull the squad back home
        this.harassIds.forEach(id => { this.world.units.find(x => x.id === id)?.setCommand({ type: 'move', targetPos: { x: LAYOUT.enemyBase.x - 4, y: LAYOUT.enemyBase.y - 4 } }); });
        this.harassIds = [];
      }
      return;
    }
    if (this.gameClock < this.harassNext) return;
    const fast = faction === 'zerg' ? ['mutalisk', 'zergling'] : faction === 'terran' ? ['hellion', 'banshee', 'marine'] : ['void_ray', 'stalker', 'zealot'];
    const squad = combatUnits.filter(u => fast.includes(u.type) && !u.isDead && u.id !== this.scoutId).slice(0, tier >= 4 ? 6 : 4);
    if (squad.length < 3) return;
    this.harassIds = squad.map(u => u.id);
    this.harassNext = this.gameClock + (tier >= 4 ? 55 : 85);
    this.harassUntil = this.gameClock + 28;
    // Strike the player's workers: mineral line of their main (or nearest base)
    const base = this.world.findNearestTownHall(LAYOUT.playerBase, 'player');
    const patch = base ? this.world.findNearestResource(base.pos, 'minerals') : null;
    const target = patch ? { x: patch.pos.x, y: patch.pos.y } : { ...LAYOUT.playerBase };
    squad.forEach(u => u.setCommand({ type: 'attack_move', targetPos: target }));
  }

  // ================================================================== macro engine (all three races)
  /** Per-think snapshot used by the macro helpers. */
  private m!: {
    race: Race; tier: number; cap: 1 | 2 | 3; pace: number; res: any;
    units: Unit[]; buildings: Building[]; halls: Building[]; workers: Unit[];
    /** minerals / gas set aside for the tech step the AI is saving for */
    saveM: number; saveG: number;
  };
  /** Warp-ins in flight (they appear 5s after the cast). */
  private pendingWarps: { type: string; until: number }[] = [];
  /** Add-on spots that turned out to be blocked (don't retry every think). */
  private addonBlocked = new Set<string>();
  /** What this AI has produced or started (debugging / audits). */
  public stats = { warpIns: new Set<string>(), merges: 0, nydus: 0 };
  private nydusLoaded = false;

  private macro(race: Race, myUnits: Unit[], myBuildings: Building[], halls: Building[], workers: Unit[], res: any) {
    const tier = this.tier();
    this.m = { race, tier, cap: techCap(tier), pace: paceOf(tier), res, units: myUnits, buildings: myBuildings, halls, workers, saveM: 0, saveG: 0 };
    this.pendingWarps = this.pendingWarps.filter(p => p.until > this.gameClock);
    this.countAll();
    this.manageGas();
    this.makeWorkers();
    this.manageSupply();
    this.followTechPlan();
    if (race === 'terran') this.buildAddons();
    if (race === 'zerg') this.makeQueens();
    this.doResearch();
    this.morphUnits();
    this.produceArmy();
  }

  private hallTypes = new Set(['command_center', 'orbital_command', 'planetary_fortress', 'hatchery', 'nexus']);
  private gasType = (): BuildingType => (this.m.race === 'zerg' ? 'extractor' : this.m.race === 'protoss' ? 'assimilator' : 'refinery');
  private workerType = (): UnitType => (this.m.race === 'zerg' ? 'drone' : this.m.race === 'protoss' ? 'probe' : 'scv');
  private canSpend(min: number, gas: number) { const r = this.m.res; return (min <= 0 || r.minerals - this.m.saveM >= min) && (gas <= 0 || r.gas - this.m.saveG >= gas); }

  /** Unit counts for this think: alive + in production + eggs + morphing into + warping in. */
  private counts = new Map<string, number>();
  private countAll() {
    const c = new Map<string, number>();
    const add = (t: string, n = 1) => c.set(t, (c.get(t) ?? 0) + n);
    for (const u of this.world.units) {
      if (u.playerId !== 'enemy' || u.isDead) continue;
      if (u.morph) add(u.morph.to);
      else if (u.type === 'egg') { if (u.egg) add(u.egg.type, u.egg.type === 'zergling' ? 2 : 1); }
      else add(u.type);
    }
    for (const b of this.m.buildings) for (const q of b.queue) add(q.type);
    for (const p of this.pendingWarps) add(p.type);
    this.counts = c;
  }
  private count(t: string): number { return this.counts.get(t) ?? 0; }
  private bump(t: string, n = 1) { this.counts.set(t, this.count(t) + n); if (n > 0) this.built.add(t); }
  /** Unit types this AI has made itself (the free starting units from map setup don't count). */
  private built = new Set<string>();

  /** Structures owned (placed or finished) of a tech-step kind; morph steps count morphs in progress. */
  private owned(kind: string): number {
    const bs = this.m.buildings.filter(b => !b.isDead);
    switch (kind) {
      case 'lair': return bs.some(b => b.type === 'hatchery' && (b.tier >= 1 || b.morphTo === 'lair' || b.morphTo === 'hive')) ? 1 : 0;
      case 'hive': return bs.some(b => b.type === 'hatchery' && (b.tier >= 2 || b.morphTo === 'hive')) ? 1 : 0;
      case 'greater_spire': return bs.some(b => b.type === 'greater_spire' || (b.type === 'spire' && b.morphTo === 'greater_spire')) ? 1 : 0;
      case 'orbital': return bs.some(b => b.type === 'orbital_command' || b.morphTo === 'orbital_command') ? 1 : 0;
      case 'spire': return bs.filter(b => b.type === 'spire' || b.type === 'greater_spire').length;
      case 'supply_depot': return bs.filter(b => b.type === 'supply_depot' || b.type === 'supply_depot_lowered').length;
      default: return bs.filter(b => b.type === kind).length;
    }
  }

  // ------------------------------------------------------------------ economy
  private manageGas() {
    const { res, halls, workers, tier, cap } = this.m;
    const w = this.world;
    const gasType = this.gasType();
    const gasB = this.m.buildings.filter(b => b.type === gasType && !b.isDead);
    // 1 gas early; 2 once tech level 2 starts; then 2 per base on Hard+
    const t = this.gameClock / this.m.pace;
    const built = halls.filter(h => h.isConstructed).length;
    let want = workers.length >= 10 ? 1 : 0;
    if (cap >= 2 && t > 120 && workers.length >= 16) want = 2;
    if (tier >= 1 && t > 240) want = Math.min(2 * built, tier >= 2 ? 99 : 3);   // both geysers of every base (Normal: 3)
    if (gasB.length < want && this.canSpend(BUILDING_CONFIGS[gasType].costMinerals, 0)) {
      const free = w.resourceNodes.filter(n => n.type === 'vespene' && n.amount > 0 && !w.buildings.some(x => !x.isDead && x.attachedGeyserId === n.id)
        && halls.some(h => h.isConstructed && Math.hypot(h.pos.x - n.pos.x, h.pos.y - n.pos.y) < 12));
      const g = free.sort((a, b) => Math.hypot(a.pos.x - halls[0]!.pos.x, a.pos.y - halls[0]!.pos.y) - Math.hypot(b.pos.x - halls[0]!.pos.x, b.pos.y - halls[0]!.pos.y))[0];
      if (g) {
        const ext = w.spawnBuilding(gasType, 'enemy', g.pos, false);
        ext.attachedGeyserId = g.id;
        res.minerals -= BUILDING_CONFIGS[gasType].costMinerals;
      }
    }
    // 3 workers per finished gas building
    for (const gb of gasB) {
      if (!gb.isConstructed || !gb.attachedGeyserId) continue;
      const node = w.resourceNodes.find(n => n.id === gb.attachedGeyserId);
      if (!node || node.amount <= 0) continue;
      const on = workers.filter(u => u.targetNodeId === node.id || u.miningNodeId === node.id).length;
      if (on >= 3) continue;
      const free = workers.filter(u => u.isGathering && !u.carriedResourceType && u.targetNodeId !== node.id && !gasB.some(o => o.attachedGeyserId === u.targetNodeId))
        .sort((a, b) => Math.hypot(a.pos.x - gb.pos.x, a.pos.y - gb.pos.y) - Math.hypot(b.pos.x - gb.pos.x, b.pos.y - gb.pos.y));
      free.slice(0, 3 - on).forEach(u => u.setCommand({ type: 'gather', targetEntityId: node.id }));
    }
  }

  private makeWorkers() {
    const { halls, workers, tier, race } = this.m;
    const gasCount = this.m.buildings.filter(b => b.type === this.gasType() && !b.isDead).length;
    const target = Math.min(workerCap(tier), 16 * halls.length + 3 * gasCount);
    let have = this.count(this.workerType());
    if (have >= target) return;
    if (race === 'zerg') return; // drones come out of larva in produceArmy (they compete with the army for larva)
    for (const h of halls) {
      if (have >= target) break;
      if (!h.isConstructed || h.morphT > 0 || h.queue.length >= 1) continue;
      if (this.world.produceFor('enemy', h.id, this.workerType()).ok) { have++; this.bump(this.workerType()); }
    }
  }

  private manageSupply() {
    const { res, race } = this.m;
    if (res.maxSupply >= 200) return;
    const producers = this.m.buildings.filter(b => BUILDING_CONFIGS[b.type]?.produces.length && !this.hallTypes.has(b.type)).length + this.m.halls.length;
    const buffer = Math.min(16, 3 + 2 * producers);
    let pending = 0;
    for (const b of this.m.buildings) if (!b.isConstructed && !b.isDead) pending += BUILDING_CONFIGS[b.type].supplyProvided;
    pending += 8 * Math.max(0, this.count('overlord') - this.m.units.filter(u => u.type === 'overlord').length); // Overlord eggs
    if (res.supply + buffer < res.maxSupply + pending) return;
    if (race === 'zerg') {
      for (const h of this.m.halls) if (h.isConstructed && this.world.produceFor('enemy', h.id, 'overlord').ok) { this.bump('overlord'); return; }
      // no larva at all and supply-blocked: an Overlord Pod gestates supply without larva
      if (res.supply + 2 > res.maxSupply && pending === 0 && this.canSpend(100, 0)) this.placeNear('overlord_pod', this.m.halls[0]!, res);
      return;
    }
    const type: BuildingType = race === 'protoss' ? 'pylon' : 'supply_depot';
    if (pending >= 16) return;
    const base = this.m.halls[this.owned(type) % this.m.halls.length]!;
    this.placeNear(type, base, res);
  }

  // ------------------------------------------------------------------ tech tree
  private followTechPlan() {
    const { race, tier, cap, pace, res } = this.m;
    const w = this.world;
    for (const step of TECH_PLANS[race]) {
      if (step.level > cap || (step.minTier ?? 0) > tier || this.gameClock < step.at * pace) continue;
      if (step.perBase) {
        // one per finished town hall
        const hall = this.m.halls.find(h => h.isConstructed && !this.m.buildings.some(b => b.type === step.b && !b.isDead && Math.hypot(b.pos.x - h.pos.x, b.pos.y - h.pos.y) < 14));
        if (!hall) continue;
        if (w.buildingLockReason('enemy', step.b as BuildingType)) continue;
        const c = BUILDING_CONFIGS[step.b as BuildingType];
        if (!this.canSpend(c.costMinerals, c.costGas)) continue; // static defense never blocks the rest of the plan
        this.placeNear(step.b, hall, res, true);
        return;
      }
      if (this.owned(step.b) >= (step.n ?? 1)) continue;
      const main = this.m.halls[0]!;
      if (step.b === 'orbital' || step.b === 'lair' || step.b === 'hive' || step.b === 'greater_spire') {
        const caster = step.b === 'greater_spire'
          ? this.m.buildings.find(b => b.type === 'spire' && b.isConstructed && b.morphT <= 0)
          : this.m.halls.find(h => h.isConstructed && h.morphT <= 0 && (step.b === 'orbital' ? h.type === 'command_center' : h.type === 'hatchery' && h.tier === (step.b === 'lair' ? 0 : 1)));
        if (!caster) continue;
        const ab = ABILITIES[step.b]!;
        const why = abilityBlocked(w, caster, ab);
        if (!why) { castAbility(w, caster, step.b); return; }
        if (why.startsWith('Requires')) continue;
        this.m.saveM = ab.minerals ?? 0; this.m.saveG = ab.gas ?? 0; // save up for it (or wait for the queue to clear)
        return;
      }
      if (w.buildingLockReason('enemy', step.b)) continue; // prerequisite not finished yet
      const c = BUILDING_CONFIGS[step.b];
      if (this.placeNear(step.b, main, res)) return;
      if (res.minerals < c.costMinerals || res.gas < c.costGas) { this.m.saveM = c.costMinerals; this.m.saveG = c.costGas; return; }
    }
  }

  /** Barracks / Factory / Starport get a Tech Lab or Reactor once finished. */
  private buildAddons() {
    const w = this.world;
    for (const type of ['barracks', 'factory', 'starport']) {
      const list = this.m.buildings.filter(b => b.type === type && !b.isDead).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      list.forEach((b, k) => {
        if (!b.isConstructed || b.isAirborne || b.addon(w) || b.addonBuildingId || b.queue.length || this.addonBlocked.has(b.id)) return;
        const kind = terranAddonFor(type, k);
        const ab = ABILITIES[kind]!;
        if (abilityBlocked(w, b, ab) || !this.canSpend(ab.minerals ?? 0, ab.gas ?? 0)) return;
        const err = castAbility(w, b, kind);
        if (err && err.startsWith('No room')) this.addonBlocked.add(b.id);
      });
    }
  }

  private makeQueens() {
    const { tier, halls } = this.m;
    if (!this.world.hasConstructed('enemy', 'spawning_pool')) return;
    const want = Math.min(halls.length + (tier >= 1 ? 1 : 0), tier >= 4 ? 5 : 3); // one injector per Hatchery + a creep queen
    if (this.count('queen') >= want) return;
    const h = halls.find(x => x.isConstructed && x.morphT <= 0 && x.queue.length === 0);
    if (h && this.canSpend(150, 0) && this.world.produceFor('enemy', h.id, 'queen').ok) this.bump('queen');
  }

  private doResearch() {
    const { tier, cap, race, res } = this.m;
    if (tier < 1) return;
    const w = this.world;
    for (const r of RESEARCH_PLANS[race]) {
      if (r.level > cap) continue;
      if (tier < 2 && !['warp_gate', 'metabolic_boost', 'combat_shields'].includes(r.id)) continue;
      const info: any = w.researchInfo(r.id as any, 'enemy');
      if (info.err || w.isResearching('enemy', r.id as any)) continue;
      const key = ['warp_gate', 'metabolic_boost', 'combat_shields'].includes(r.id);
      // key techs first; the rest only from spare money so the army keeps coming
      if (!key && (res.minerals - this.m.saveM < info.minerals + 150 || res.gas - this.m.saveG < info.gas + 75)) continue;
      w.researchUpgrade(r.id as any, 'enemy');
    }
  }

  // ------------------------------------------------------------------ army
  /** Planned units this AI may build now, with weights adjusted for what it has scouted. */
  private plan(): UnitPlan[] {
    return UNIT_PLANS[this.m.race].filter(p => p.level <= this.m.cap && this.world.unitAvailable(p.unit));
  }

  private weightOf(p: UnitPlan): number {
    const prof = this.playerProfile();
    let wgt = p.weight;
    if (this.m.tier >= 1 && prof.total >= 4) {
      const tags = p.tags ?? [];
      if (tags.includes('aa')) wgt *= 1 + 2 * prof.air;
      if (tags.includes('armor')) wgt *= 1 + 1.5 * prof.armored;
      if (tags.includes('light') || tags.includes('splash')) wgt *= 1 + 1.5 * prof.bio;
      if (!tags.includes('aa') && prof.air > 0.6 && !tags.includes('detector') && !tags.includes('support')) wgt *= 0.5;
    }
    // a big army is topped up with higher-tech units rather than more of the cheap ones (keeps supply for them)
    if (this.m.res.supply >= 90 && p.level === 1 && this.m.cap >= 2) wgt *= 0.35;
    return wgt;
  }

  private capOf(p: UnitPlan): number {
    if (p.cap === undefined) return Infinity;
    return p.cap === 1 ? 1 : Math.ceil(p.cap * (this.m.tier >= 4 ? 1.5 : 1));
  }

  /** Apportionment score: the unit furthest below its weighted share of the army has the highest score. */
  private score(p: UnitPlan, extra = 0): number {
    const n = this.count(p.unit) + extra;
    if (n >= this.capOf(p)) return 0;
    // a morph / merge that has never been made gets its source units first (a pair of High Templar for the first Archon,
    // a Corruptor for the first Brood Lord once the Greater Spire is done, ...)
    for (const t of UNIT_PLANS[this.m.race]) {
      const src = t.via === 'merge' ? 'high_templar' : t.from;
      if (src !== p.unit || t.level > this.m.cap || this.built.has(t.unit) || !this.world.unitAvailable(t.unit)) continue;
      const need = UNIT_MORPHS.find(m => m.to === t.unit)?.need;
      if (need && !this.world.hasConstructed('enemy', need)) continue;
      if (n < (t.via === 'merge' ? 2 : 1)) return 1.3;
    }
    const per = p.unit === 'zergling' ? 2 : 1; // Zerglings hatch in pairs: one larva = one "unit" of the plan
    const wgt = this.weightOf(p);
    // every newly unlocked unit gets fielded once early (detectors, casters, capital ships), then it's down to its share
    return !this.built.has(p.unit) ? Math.max(wgt, 2) / (n / per + 1) * (n === 0 ? 1 : 2) : wgt / (n / per + 1);
  }

  /** In-place morphs (Baneling, Ravager, Lurker, Overseer, Brood Lord) and Archon merges, when they improve the army's mix. */
  private morphUnits() {
    const w = this.world;
    const plans = this.plan();
    for (const p of plans) {
      if (p.via !== 'morph' && p.via !== 'merge') continue;
      if (this.score(p) <= 0) continue;
      if (p.via === 'merge') {
        const ht = this.m.units.filter(u => u.type === 'high_templar' && !u.morph && !u.isDead && !u.loadedIn).sort((a, b) => a.energy - b.energy);
        const src = plans.find(x => x.unit === 'high_templar');
        if (ht.length < 2 || (this.built.has('archon') && src && this.score(p) < this.weightOf(src) / Math.max(1, ht.length - 1))) continue;
        if (!castAbility(w, ht[0]!, 'archon_merge')) { this.stats.merges++; this.bump('archon'); this.bump('high_templar', -2); }
        continue;
      }
      const from = plans.find(x => x.unit === p.from);
      const pool = this.m.units.filter(u => u.type === p.from && !u.morph && !u.burrowed && !u.isDead && !u.loadedIn);
      if (!pool.length) continue;
      if (this.built.has(p.unit) && from && this.score(p) < this.weightOf(from) / Math.max(1, pool.length)) continue; // the first one is always made
      const ab = ABILITIES['morph_' + p.unit]!;
      if (abilityBlocked(w, pool[0]!, ab) || !this.canSpend(ab.minerals ?? 0, ab.gas ?? 0)) continue;
      if (!castAbility(w, pool[0]!, 'morph_' + p.unit)) { this.bump(p.unit); this.bump(p.from!, -1); }
    }
  }

  /** Best unit a producer could make now, ignoring cost (tech, Tech Lab, unit lock and caps respected); null = nothing. */
  private bestFor(producer: Building, options: UnitPlan[]): { p: UnitPlan; s: number } | null {
    const w = this.world;
    let best: { p: UnitPlan; s: number } | null = null;
    for (const p of options) {
      const s = this.score(p);
      if (s <= 0 || (best && s <= best.s)) continue;
      if (w.unitLockReason('enemy', p.unit)) continue;
      if (TECHLAB_UNITS.has(p.unit) && ['barracks', 'factory', 'starport'].includes(producer.type) && !producer.hasTechLab(w)) continue;
      best = { p, s };
    }
    return best;
  }

  /** Gas-free fallback when the top pick is waiting on gas: spend spare minerals, but keep the last 40 supply for tech units. */
  private fallbackFor(producer: Building, options: UnitPlan[]): UnitPlan | null {
    if (this.m.res.supply >= 160) return null;
    const cheap = options.filter(p => UNIT_CONFIGS[p.unit].costGas === 0);
    const b = this.bestFor(producer, cheap);
    return b && this.canSpend(UNIT_CONFIGS[b.p.unit].costMinerals, 0) ? b.p : null;
  }

  /** Try to make `p` at `b` (queue, larva or warp-in). */
  private make(b: Building, p: UnitPlan): boolean {
    const w = this.world;
    if (b.type === 'gateway' && b.warpGate) {
      const ab = ABILITIES['warp_' + p.unit]!;
      if (abilityBlocked(w, b, ab)) return false;
      const pylons = this.m.buildings.filter(x => x.type === 'pylon' && x.isConstructed && !x.isDead);
      if (!pylons.length) return false;
      const py = pylons[(this.pendingWarps.length + Math.floor(this.gameClock)) % pylons.length]!;
      for (let k = 0; k < 8; k++) {
        const a = k * 0.785 + this.gameClock;
        if (!castAbility(w, b, 'warp_' + p.unit, { pos: { x: py.pos.x + Math.cos(a) * 3.2, y: py.pos.y + Math.sin(a) * 3.2 } })) {
          this.pendingWarps.push({ type: p.unit, until: this.gameClock + 5.5 });
          this.stats.warpIns.add(p.unit);
          this.bump(p.unit);
          return true;
        }
      }
      return false;
    }
    if (!w.produceFor('enemy', b.id, p.unit).ok) return false;
    this.bump(p.unit);
    return true;
  }

  /**
   * Army production. Every free production slot (a queue slot, a Reactor's second slot, a larva, a ready Warp Gate) is
   * filled in order of the score of its best unit, across all structures at once: when the top pick can't be afforded yet
   * its cost is held back, so cheap units elsewhere don't keep eating the gas a Banshee / Carrier / Brood Lord is waiting for.
   */
  private produceArmy() {
    const w = this.world;
    const { race, res } = this.m;
    const plans = this.plan();
    type Slot = { b: Building; options: UnitPlan[] };
    const slots: Slot[] = [];
    if (race === 'zerg') {
      const gasCount = this.m.buildings.filter(b => b.type === 'extractor' && !b.isDead).length;
      const target = Math.min(workerCap(this.m.tier), 16 * this.m.halls.length + 3 * gasCount);
      const army = this.m.units.filter(u => !isWorkerType(u.type) && u.type !== 'overlord' && u.type !== 'queen').length;
      const larvaUnits = plans.filter(p => p.via === 'larva');
      for (const h of this.m.halls) {
        if (!h.isConstructed) continue;
        let larva = larvaOf(w, h.id).length;
        // drones first up to the worker target (keeping an army alongside)
        while (larva > 0 && this.count('drone') < target && (this.count('drone') < 14 || army >= this.count('drone') * 0.35) && this.canSpend(50, 0) && res.supply < res.maxSupply) {
          if (!this.make(h, { unit: 'drone', level: 1, via: 'larva', weight: 0 })) break;
          larva--;
        }
        for (let k = 0; k < Math.min(larva, 4); k++) slots.push({ b: h, options: larvaUnits });
      }
    } else {
      for (const b of this.m.buildings) {
        if (!b.isConstructed || b.isDead || b.isAirborne || b.morphT > 0 || b.addonBuildingId) continue;
        if (this.hallTypes.has(b.type) && b.type !== 'nexus') continue;
        const produces = BUILDING_CONFIGS[b.type].produces;
        if (!produces.length) continue;
        if (b.type === 'nexus' && this.m.workers.length < 16) continue; // probes first
        const options = plans.filter(p => produces.includes(p.unit) && (p.via === 'queue' || p.via === 'warp'));
        if (b.type === 'gateway' && b.warpGate) {
          if (!b.abilityCd['warp_zealot']) slots.push({ b, options });
          continue;
        }
        for (let k = b.queue.length; k < b.productionSlots(w); k++) slots.push({ b, options });
      }
    }
    let reserved = false;
    while (slots.length) {
      let bi = -1, best: { p: UnitPlan; s: number } | null = null;
      slots.forEach((sl, i) => { const c = this.bestFor(sl.b, sl.options); if (c && (!best || c.s > best.s)) { best = c; bi = i; } });
      if (!best || bi < 0) return;
      const { b, options } = slots.splice(bi, 1)[0]!;
      const p = (best as { p: UnitPlan }).p;
      const c = UNIT_CONFIGS[p.unit];
      if (this.canSpend(c.costMinerals, c.costGas)) {
        if (!this.make(b, p)) continue;
      } else {
        // hold the money for it; a gas-free unit may still use this slot early on if minerals are piling up
        const alt = c.costGas > 0 && res.gas - this.m.saveG < c.costGas ? this.fallbackFor(b, options) : null;
        if (alt && this.make(b, alt)) continue;
        // only the single best waiting pick holds money back; lower picks just wait their turn
        if (!reserved) { this.m.saveM += c.costMinerals; this.m.saveG += c.costGas; reserved = true; }
      }
    }
  }

  // ------------------------------------------------------------------ placement
  /** Add-on squares (2x2) of this AI's Barracks / Factories / Starports: kept free for their Tech Lab / Reactor. */
  private addonSquares(): { x: number; y: number }[] {
    return this.world.buildings.filter(b => !b.isDead && b.playerId === 'enemy' && ['barracks', 'factory', 'starport'].includes(b.type)).map(b => Building.addonSpot(b.pos));
  }

  /**
   * Place a structure on the first legal spot in rings around `base` (honours creep / footprint rules); pays on success.
   * Terran production structures also need their add-on square free; nothing is placed on another structure's add-on square.
   */
  private placeNear(type: string, base: any, res: any, tight = false): boolean {
    const cfg = (BUILDING_CONFIGS as any)[type];
    if (res.minerals < cfg.costMinerals || res.gas < cfg.costGas) return false;
    const w = this.world;
    const needsAddon = ['barracks', 'factory', 'starport'].includes(type);
    const squares = this.addonSquares();
    const around = tight ? 4 : type === 'spawning_pool' || cfg.race !== 'zerg' ? 6 : 7;
    for (let r = around; r <= 18; r += 2) {
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2 + r * 0.37;
        const spot = w.resolvePlacement(type as any, { x: base.pos.x + Math.cos(a) * r, y: base.pos.y + Math.sin(a) * r });
        if (!spot.ok) continue;
        const hw = cfg.footprint.width / 2, hh = cfg.footprint.height / 2;
        if (squares.some(s => Math.abs(s.x - spot.pos.x) < hw + 1 && Math.abs(s.y - spot.pos.y) < hh + 1)) continue;
        if (needsAddon) {
          const ad = Building.addonSpot(spot.pos);
          if (!w.pathfinding.isAreaWalkable(ad.x - 1, ad.y - 1, 2, 2)) continue;
          // the add-on square must not overlap this structure's own footprint neighbours either
          if (w.buildings.some(o => !o.isDead && Math.abs(o.pos.x - ad.x) < o.width / 2 + 1 && Math.abs(o.pos.y - ad.y) < o.heightTiles / 2 + 1)) continue;
        }
        w.spawnBuilding(type as any, 'enemy', spot.pos, false);
        res.minerals -= cfg.costMinerals; res.gas -= cfg.costGas;
        return true;
      }
    }
    return false;
  }
}
