import { RiggedAnimator } from '../graphics/RiggedAnimator';
import { TerranAnimator } from '../graphics/TerranAnimator';
import { muzzleWorldPos } from '../graphics/Muzzles';
import { GameWorld } from '../simulation/GameWorld';
import { BuildingType, PlayerId, UnitType } from '../types';
import { BUILDING_CONFIGS, UNIT_CONFIGS } from '../config';

/**
 * Snapshot sync (the original multiplayer mode, and the fallback when lockstep keeps desyncing): the host runs the game
 * and sends compact state snapshots at 15 Hz; the guest shows them on puppet entities and runs no simulation.
 * PvP guests swap labels so their own side is always 'player'.
 */
export class SnapshotCodec {
  private seq = 0;
  private firstSnapshot = true;
  private overSent = false;
  public pendingFx: any[] = [];
  public lastSnapshotAt = 0;

  constructor(private world: GameWorld, private swap: boolean) {}

  private mapPid(p: number): PlayerId {
    const base: PlayerId = p === 0 ? 'player' : 'enemy';
    if (!this.swap) return base;
    return base === 'player' ? 'enemy' : 'player';
  }

  private pcode(pid: PlayerId): number {
    return pid === 'player' ? 0 : 1;
  }

  /** Host: queue a shot so the guest can draw its muzzle flash / tracer. */
  public addShot(attackerId: string, targetId: string) {
    if (this.pendingFx.length <= 40) this.pendingFx.push([attackerId, targetId]);
  }

  /** Host: the current state as one compact snapshot message. */
  public build(): any {
    const w = this.world;
    const r2 = (n: number) => Math.round(n * 100) / 100;

    const units = [];
    for (const u of w.units) {
      if (u.isDead) continue;
      units.push([
        u.id, u.type, this.pcode(u.playerId), r2(u.pos.x), r2(u.pos.y), r2(u.rotation),
        Math.round(u.health), Math.round(u.maxHealth), (u.isStimmed ? 1 : 0) | (u.isAfterburning ? 2 : 0) | (u.burrowed ? 4 : 0) | (u.burrowTransition ? 8 | (u.burrowTransition.to ? 16 : 0) : 0) | (u.type === 'widow_mine' && u.attackCooldown > 0 ? 32 : 0),
        ...(u.hatcheryId ? [u.hatcheryId, u.larvaSlot, u.egg ? r2(u.egg.t / u.egg.total) : 0] : [])   // larva / egg: owner Hatchery, slot, hatch progress
      ]);
    }
    const buildings = [];
    for (const b of w.buildings) {
      if (b.isDead) continue;
      buildings.push([
        b.id, b.type, this.pcode(b.playerId), r2(b.pos.x), r2(b.pos.y), Math.round(b.health), Math.round(b.maxHealth),
        r2(b.buildProgress), b.isConstructed ? 1 : 0, b.queue.map(q => [q.type, r2(q.progress), q.totalTime]),
        b.rallyPoint ? [r2(b.rallyPoint.x), r2(b.rallyPoint.y)] : null
      ]);
    }
    const nodes = w.resourceNodes.map(n => [n.id, Math.round(n.amount)]);
    const res = (p: PlayerId) => {
      const r = w.resources[p];
      return [Math.floor(r.minerals), Math.floor(r.gas), r.supply, r.maxSupply];
    };
    const upg = (p: PlayerId) => {
      const u = w.getUpgrades(p);
      return [u.weaponsLevel, u.armorLevel, u.combatShields ? 1 : 0, 0 /* unused slot */, u.techs?.drilling_claws ? 1 : 0];
    };

    const msg: any = {
      t: 'snap', n: ++this.seq, gt: r2(w.gameTime), u: units, b: buildings, r: nodes,
      res: [res('player'), res('enemy')], up: [upg('player'), upg('enemy')]
    };
    if (this.pendingFx.length) {
      msg.fx = this.pendingFx;
      this.pendingFx = [];
    }
    if (w.isGameOver && w.gameResult && !this.overSent) {
      this.overSent = true;
      const pvp = w.matchConfig.mode === 'multiplayer_pvp';
      const hostWon = w.gameResult === 'victory';
      msg.over = pvp ? (hostWon ? 'defeat' : 'victory') : w.gameResult;
    }
    return msg;
  }

  /** Guest: mirror an authoritative snapshot onto puppet entities. */
  public apply(s: any) {
    const w = this.world;
    this.lastSnapshotAt = performance.now();

    if (this.firstSnapshot) {
      this.firstSnapshot = false;
      // Discard locally generated starting entities; adopt the host's authoritative ids.
      w.clearEntities(true);
    }
    w.gameTime = s.gt;

    // Resources / upgrades (swap sides for PvP guest)
    const [rp, re] = this.swap ? [s.res[1], s.res[0]] : [s.res[0], s.res[1]];
    const setRes = (p: PlayerId, a: number[]) => {
      const r = w.resources[p];
      r.minerals = a[0]!; r.gas = a[1]!; r.supply = a[2]!; r.maxSupply = a[3]!;
    };
    setRes('player', rp);
    setRes('enemy', re);
    const [up, ue] = this.swap ? [s.up[1], s.up[0]] : [s.up[0], s.up[1]];
    const setUpg = (target: any, a: number[]) => {
      target.weaponsLevel = a[0]; target.armorLevel = a[1]; target.combatShields = !!a[2];
      target.techs = { ...(target.techs ?? {}), drilling_claws: !!a[4] };
    };
    setUpg(w.upgrades, up);
    setUpg(w.enemyUpgrades, ue);

    // Resource nodes
    const nodeMap = new Map(w.resourceNodes.map(n => [n.id, n]));
    for (const [id, amt] of s.r as [string, number][]) {
      const n = nodeMap.get(id);
      if (n) n.amount = amt;
    }

    // Units
    const existing = new Map(w.units.map(u => [u.id, u]));
    const seen = new Set<string>();
    for (const row of s.u as any[]) {
      const [id, type, pc, x, y, rot, hp, maxHp, flags, hatcheryId, slot, eggP] = row;
      seen.add(id);
      let u = existing.get(id);
      if (!u) {
        if (!UNIT_CONFIGS[type as UnitType]) continue;
        u = w.spawnUnit(type, this.mapPid(pc), { x, y }, id);
        u.rotation = rot;
      } else if (u.type !== type && UNIT_CONFIGS[type as UnitType]) {
        w.morphUnit(u, type);
      }
      u.netTarget = { x, y, rot };
      if (hatcheryId) { u.hatcheryId = hatcheryId; u.larvaSlot = slot; u.eggProgress = eggP || 0; }
      u.health = hp;
      u.maxHealth = maxHp;
      u.isStimmed = !!(flags & 1);
      // Widow Mine burrow state is host-authoritative: mirror it, and stay immobile while the host's burrow / unburrow runs
      u.burrowed = !!(flags & 4);
      u.burrowTransition = flags & 8 ? { to: !!(flags & 16), t: u.burrowTransition?.t ?? 99 } : null;
      if (u.type === 'widow_mine') u.attackCooldown = flags & 32 ? 1 : 0;
      if (flags & 2) {
        if (!u.isAfterburning) u.afterburnerTimer = 3.2;
        u.isAfterburning = true;
      } else {
        u.isAfterburning = false;
      }
    }
    for (const u of w.units) {
      if (!seen.has(u.id) && !u.isDead) u.isDead = true;
    }

    // Buildings
    const existingB = new Map(w.buildings.map(b => [b.id, b]));
    const seenB = new Set<string>();
    for (const row of s.b as any[]) {
      const [id, type, pc, x, y, hp, maxHp, prog, built, queue, rally] = row;
      seenB.add(id);
      let b = existingB.get(id);
      if (!b) {
        if (!BUILDING_CONFIGS[type as BuildingType]) continue;
        b = w.spawnBuilding(type, this.mapPid(pc), { x, y }, !!built, id);
      } else if (b.type !== type && BUILDING_CONFIGS[type as BuildingType]) {
        b.type = type;
        b.isLowered = type === 'supply_depot_lowered';
        w.refreshBuildingModel(b);
        w.pathfinding.setAreaObstacle(b.pos.x - b.width / 2, b.pos.y - b.heightTiles / 2, b.width, b.heightTiles, !b.isLowered);
      }
      b.health = hp;
      b.maxHealth = maxHp;
      b.buildProgress = prog;
      b.isConstructed = !!built;
      b.queue = (queue as any[]).map(q => ({
        type: q[0], progress: q[1], totalTime: q[2],
        costMinerals: UNIT_CONFIGS[q[0] as UnitType]?.costMinerals ?? 0,
        costGas: UNIT_CONFIGS[q[0] as UnitType]?.costGas ?? 0
      }));
      if (rally) b.rallyPoint = { x: rally[0], y: rally[1] };
    }
    for (const b of w.buildings) {
      if (!seenB.has(b.id) && !b.isDead) b.isDead = true;
    }

    // Combat FX
    if (s.fx) {
      const byId = new Map(w.units.map(u => [u.id, u]));
      for (const [aId, tId] of s.fx as [string, string][]) {
        const a = byId.get(aId);
        const t = byId.get(tId) || w.buildings.find(b => b.id === tId);
        if (!a || !t || !a.mesh || !a.mesh.visible) continue;
        TerranAnimator.triggerShoot(a, t.pos);
        RiggedAnimator.triggerAttack(a, t);
        const from = muzzleWorldPos(a) ?? { x: a.pos.x, y: a.height + (a.isFlying ? 0 : 0.9), z: a.pos.y };
        const to = { x: t.pos.x, y: t.height + 0.85, z: t.pos.y };
        if (a.type === 'marine') {
          w.sound.playMarineAttack();
          (a as any)._animRecoilTimer = 0.16;
          w.particles.spawnBulletFlash(from, to, () => {});
        } else if (a.type === 'void_ray') {
          // continuous beam: keep it lit until the next shot is due (0.36s cooldown) plus slack for network jitter
          a.beamTargetId = t.id; a.beamFired = true; a.beamBeat = w.gameTime + 0.35;
        } else if (a.isFlying || a.type === 'stalker') {
          w.particles.spawnWraithLaser(from, to, () => {});
        } else {
          w.particles.spawnBulletFlash(from, to, () => {});
        }
      }
    }

    // Game over (verdict computed on host, already oriented to this guest)
    if (s.over && !w.isGameOver) {
      w.isGameOver = true;
      w.gameResult = s.over;
    }
  }
}
