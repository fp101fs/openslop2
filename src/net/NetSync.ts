import { GameWorld } from '../simulation/GameWorld';
import { Unit } from '../simulation/Unit';
import type { Entity } from '../simulation/Entity';
import type { CastTarget } from '../simulation/Mechanics';
import { NetTransport } from './NetClient';
import { BuildingType, Command, PlayerId, UnitType, UpgradeType, Vector2D } from '../types';
import { isWorkerType } from '../config';
import { applyCommand, type NetCommand, type SimpleAbility, type StructureAction } from './commands';
import { Lockstep, type LockstepConfig, type TurnPacket } from './Lockstep';
import { SnapshotCodec } from './snapshot';
import { setTeamColorsSwapped } from '../graphics/TeamColor';
import { stateHash } from './stateHash';
import { captureKeyframe, applyKeyframe, mirrorKeyframe, encodeKeyframe, decodeKeyframe } from './keyframe';
import type { SaveData } from '../save/SaveState';
import type { SyncMode } from './syncMode';
import { NetTrace, LoadMeter, type NetStats } from './netTrace';

export type { SyncMode };

/**
 * Multiplayer sync. Two modes behind one API (the game only calls the send* methods, update/advance and onAttack):
 *
 * - 'lockstep' (default): both computers run the full simulation. Only orders cross the network, scheduled a few
 *   turns ahead (Lockstep.ts). The host sends one keyframe at the start so both begin identical, compares state hashes
 *   every turn, and sends a fresh keyframe if they ever disagree. Too many disagreements -> falls back to 'snapshot'.
 * - 'snapshot': the host runs the game and streams state at 15 Hz; the guest shows puppets (snapshot.ts).
 *
 * Host migration (co-op): if the host leaves, the guest keeps playing against the AI. In lockstep it already has the
 * full game; in snapshot mode it restores the latest keyframe, which the host sends every few seconds.
 *
 * Start (lockstep): the host builds the match, sends its tick-0 keyframe and holds. The guest applies it and answers
 * 'ready'; only then does the host's clock start, so neither side runs (or shows) a half-built match. A guest that
 * has not got the keyframe within a few seconds asks for it again ('kf_req').
 *
 * PvP: the guest controls the host's 'enemy' side but sees itself as 'player' (UI conventions unchanged). Lockstep
 * keyframes are mirrored for it, and the local player is 'player' on both computers.
 * `?sync=snapshot` in the URL (on the host) forces the old mode (syncMode.ts).
 */

const SNAPSHOT_HZ = 15;
/** Snapshot co-op: how often the host sends a keyframe the guest can continue from if the host leaves. */
const MIGRATION_KEYFRAME_SEC = 8;
/** Desync heals allowed per minute before lockstep gives up and switches to snapshot sync. */
const MAX_HEALS_PER_MINUTE = 4;
/** Keyframes are split into pieces below WebRTC's safe message size. */
const CHUNK = 48_000;
/** Longest a frame may bank time while waiting for the other player (stops a burst of fast-forward afterwards). */
const MAX_BANKED_SEC = 0.25;
/** Guest: ask for the starting keyframe again if it has not arrived after this long. */
const KF_RETRY_SEC = 4;
/** How often each side sends its load numbers (fps, sim time, waits) and measures the round trip. */
const STATS_MS = 2000;
/** Waits shorter than this are normal turn jitter and not logged. */
const STALL_LOG_MS = 100;

export class NetSync {
  public readonly role: 'host' | 'guest';
  public mode: SyncMode;
  /** Peer gone (the app decides what happens to the match). */
  public onPeerLost: (() => void) | null = null;
  /** Short status lines for the player (desync healed, switched mode ...). */
  public onNotice: ((msg: string, isError?: boolean) => void) | null = null;
  /** The player's control groups, kept across keyframes (set by the app). */
  public controlGroups: Map<number, Entity[]> | undefined;
  /** Snapshot co-op guest: the latest full state, for host migration. */
  public lastKeyframe: SaveData | null = null;
  /** True while waiting for the other player (their turn packet, or the guest's starting keyframe). */
  public waiting = false;
  /** Called when the other player's turn packet arrives (the app uses it to keep a hidden tab's game moving). */
  public onRemoteTurn: (() => void) | null = null;
  /** Debug hook: called at every lockstep turn start, before its orders run. */
  public onTurn: ((turn: number, world: GameWorld) => void) | null = null;
  /** Called once when the match clock starts on this computer (lockstep: after the start handshake). */
  public onStarted: (() => void) | null = null;
  /** Latest load numbers: ours (last window) and the other player's. */
  public localStats: NetStats | null = null;
  public remoteStats: NetStats | null = null;
  /** Counters for tests and debugging. */
  public readonly stats = { desyncs: 0, keyframesSent: 0, keyframesApplied: 0 };

  private world: GameWorld;
  private client: NetTransport;
  private pvp: boolean;
  /** This computer's id for the other player. */
  private remotePid: PlayerId;
  private offMsg: (() => void) | null = null;
  private snap: SnapshotCodec;
  private snapTimer = 0;
  private keyTimer = 0;
  private ls: Lockstep | null = null;
  private acc = 0;
  /** Lockstep clock running (host: guest said ready; guest: starting keyframe applied). Always true in snapshot mode. */
  private started: boolean;
  /** Guest: seconds waited for the starting keyframe since the last request. */
  private kfWait = 0;
  private meter = new LoadMeter();
  private statsAt = performance.now();
  private rtt = 0;
  private waitFrom = 0;
  private healWanted = false;
  private ignoreDesyncBefore = 0;
  private heals: number[] = [];
  private kfSeq = 0;
  private kfParts = new Map<string, string[]>();
  private kfLatest = -1;

  constructor(world: GameWorld, client: NetTransport, role: 'host' | 'guest', mode: SyncMode = 'lockstep', lockstep: Partial<LockstepConfig> = {}) {
    this.world = world;
    this.client = client;
    this.role = role;
    this.mode = mode;
    this.pvp = world.matchConfig.mode === 'multiplayer_pvp';
    this.remotePid = this.pvp ? 'enemy' : 'player';
    this.snap = new SnapshotCodec(world, this.pvp && role === 'guest');
    this.started = mode !== 'lockstep';
    this.offMsg = client.on(m => this.onMessage(m));
    const mirror = this.pvp && role === 'guest';
    setTeamColorsSwapped(mirror); // the host's side is blue on both screens
    const cfg = world.matchConfig;
    // a PvP guest's world is the host's mirrored: its own side (and faction) is 'player', its base is the NE one
    world.matchConfig = {
      ...cfg, localPlayerSlot: mirror ? 'enemy' : 'player', isMultiplayerHost: role === 'host',
      ...(mirror ? { playerFaction: cfg.enemyFaction, enemyFaction: cfg.playerFaction } : {})
    };
    Unit.commandHook = (unit, command) => {
      // the hook is static: only take orders for units of this world (tests run two worlds in one process)
      if (!world.shouldRoute(unit) || world.findEntityById(unit.id) !== unit) return false;
      this.sendUnitCommand([unit.id], command);
      return true;
    };
    if (mode === 'lockstep') {
      this.ls = new Lockstep(p => this.client.relay(p), lockstep);
      this.ls.onDesync = k => this.onDesync(k);
      // the guest builds its own starting state, which differs (PvP ramp defence, ids ...): it copies the host's instead
      if (role === 'host') this.sendKeyframe(0, 0);
    }
    NetTrace.mark('netsync', { role, mode });
  }

  /** Messages that arrived before this object existed (the app buffers them while models load). */
  public feed(msgs: unknown[]) { for (const m of msgs) this.onMessage(m); }

  /** True once the match clock runs on this computer. */
  public get isStarted(): boolean { return this.started; }

  /** Snapshot guest: entities are puppets of the host's snapshots. */
  public get puppet(): boolean { return this.mode === 'snapshot' && this.role === 'guest'; }
  /** Local orders go through send* (lockstep: both players; snapshot: the guest). */
  public get routesOrders(): boolean { return this.mode === 'lockstep' || this.role === 'guest'; }
  public get lastSnapshotAt(): number { return this.snap.lastSnapshotAt; }
  /** Lockstep input delay in seconds (0 in snapshot mode). */
  public get inputDelay(): number { return this.ls ? (this.ls.cfg.delayTurns * this.ls.cfg.turnTicks) / this.ls.cfg.hz : 0; }

  public dispose() {
    this.offMsg?.();
    this.offMsg = null;
    Unit.commandHook = null;
    this.ls = null;
  }

  /** Host labels for hashing: the host's 'player' is slot 0 on both computers. */
  private hostSlot = (pid: PlayerId): number => {
    const mine = pid === 'player' ? 0 : 1;
    return this.pvp && this.role === 'guest' ? 1 - mine : mine;
  };

  // -------------------------------------------------------------------------
  // Clock
  // -------------------------------------------------------------------------

  /**
   * Run the simulation for one frame. Snapshot mode: one variable step, as before. Lockstep: whole fixed ticks, only when
   * the other player's orders for the coming turn are in, with extra ticks to catch up when they are ahead of us.
   */
  public advance(frameDt: number, step: (dt: number) => void) {
    const ls = this.ls;
    if (!ls) { step(frameDt); return; }
    const t0 = performance.now();
    if (!this.started) { this.waiting = true; this.acc = 0; this.askForKeyframe(frameDt); return; }
    this.acc = Math.min(this.acc + frameDt, MAX_BANKED_SEC + ls.dt * ls.cfg.maxStepsPerFrame);
    this.waiting = false;
    for (let n = 0; n < ls.cfg.maxStepsPerFrame && this.ls === ls; n++) {
      const behind = ls.lead > 1;
      if (this.acc < ls.dt && !behind) break;
      if (!ls.canStep()) { this.waiting = true; this.acc = Math.min(this.acc, MAX_BANKED_SEC); break; }
      if (ls.atTurnStart) this.beginTurn(ls);
      step(ls.dt);
      ls.endTick();
      this.acc = Math.max(0, this.acc - ls.dt);
    }
    const now = performance.now();
    if (this.waiting && !this.waitFrom) this.waitFrom = now;
    else if (!this.waiting && this.waitFrom) {
      const ms = now - this.waitFrom;
      this.waitFrom = 0;
      this.meter.stall(ms);
      if (ms >= STALL_LOG_MS) NetTrace.mark('stall', { ms: Math.round(ms), turn: ls.turn, them: this.remoteStats ? `${this.remoteStats.fps}fps sim ${this.remoteStats.simAvg}ms` : '?' });
    }
    this.meter.frame(frameDt * 1000, now - t0);
    if (now - this.statsAt >= STATS_MS) this.sendStats(now, ls.turn);
  }

  /** Guest: the starting keyframe is late (lost, or the host loaded later than us): ask again. */
  private askForKeyframe(frameDt: number) {
    if (this.role !== 'guest' || (this.kfWait += frameDt) < KF_RETRY_SEC) return;
    this.kfWait = 0;
    NetTrace.mark('kf_req');
    this.client.relay({ t: 'kf_req' });
  }

  private sendStats(now: number, turn: number) {
    this.statsAt = now;
    const s = this.localStats = this.meter.take(turn, this.rtt);
    this.client.relay({ t: 'nstat', s, at: now });
    if (s.waitMs > 400) {
      const r = this.remoteStats;
      console.warn(`[net] waited ${s.waitMs}ms for the other player in the last ${STATS_MS / 1000}s (us: ${s.fps}fps sim ${s.simAvg}/${s.simMax}ms; them: ${r ? `${r.fps}fps sim ${r.simAvg}/${r.simMax}ms frame max ${r.frameMax}ms` : 'unknown'}; rtt ${s.rtt}ms)`);
    }
  }

  private start(reason: string) {
    if (this.started) return;
    this.started = true;
    this.acc = 0;
    NetTrace.mark('started', { reason });
    if (this.role === 'guest') console.info('[net] guest start timeline\n' + NetTrace.format(NetTrace.startEvents()));
    this.onStarted?.();
  }

  private beginTurn(ls: Lockstep) {
    const w = this.world;
    if (this.healWanted && this.role === 'host') {
      this.healWanted = false;
      this.ignoreDesyncBefore = ls.turn;
      this.sendKeyframe(ls.turn, ls.newEpoch());
    }
    this.onTurn?.(ls.turn, w);
    const { local, remote } = ls.beginTurn(stateHash(w, this.hostSlot));
    // fixed order on both computers: the host's orders first, then the guest's
    const batches: [unknown[], PlayerId, boolean][] = this.role === 'host'
      ? [[local, 'player', true], [remote, this.remotePid, false]]
      : [[remote, this.remotePid, false], [local, 'player', true]];
    w.inSim = true;
    try {
      for (const [cmds, pid, mine] of batches) {
        for (const m of cmds) {
          const err = applyCommand(w, pid, m);
          if (err && mine) this.onNotice?.(err, true);
        }
      }
    } finally {
      w.inSim = false;
    }
  }

  // -------------------------------------------------------------------------
  // Per-tick (called from GameWorld.update)
  // -------------------------------------------------------------------------
  public update(dt: number) {
    if (this.role !== 'host' || this.mode !== 'snapshot') return;
    this.snapTimer += dt;
    if (this.snapTimer >= 1 / SNAPSHOT_HZ) {
      this.snapTimer = 0;
      this.client.relay(this.snap.build());
    }
    if (!this.pvp && !this.world.isGameOver && (this.keyTimer += dt) >= MIGRATION_KEYFRAME_SEC) {
      this.keyTimer = 0;
      this.sendKeyframe(-1);
    }
  }

  /** Host: called when a unit fires so a snapshot guest can render muzzle/tracer FX. */
  public onAttack(attacker: Unit, target: { id: string }) {
    if (this.role === 'host' && this.mode === 'snapshot') this.snap.addShot(attacker.id, target.id);
  }

  // -------------------------------------------------------------------------
  // Local orders
  // -------------------------------------------------------------------------
  private issue(m: NetCommand) {
    if (this.ls) this.ls.queueLocal(m);
    else if (this.role === 'guest') this.client.relay(m);
    else {
      // snapshot host: nothing is routed, but run it rather than lose it
      this.world.inSim = true;
      try { const err = applyCommand(this.world, 'player', m); if (err) this.onNotice?.(err, true); } finally { this.world.inSim = false; }
    }
  }

  public sendUnitCommand(ids: string[], command: Command) { this.issue({ t: 'cmd', ids, c: command }); }
  public sendProduce(buildingId: string, unitType: UnitType, larvaId?: string) { this.issue({ t: 'prod', b: buildingId, u: unitType, l: larvaId }); }
  public sendCancelEgg(eggId: string) { this.issue({ t: 'ecancel', e: eggId }); }
  public sendCancel(buildingId: string, index: number) { this.issue({ t: 'cancel', b: buildingId, i: index }); }
  public sendPlace(type: BuildingType, pos: Vector2D, workerId: string | null, queued = false) { this.issue({ t: 'place', type, pos, w: workerId, q: queued || undefined }); }
  public sendResearch(type: UpgradeType) { this.issue({ t: 'research', type }); }
  public sendAbility(id: string, ability: SimpleAbility) { this.issue({ t: 'abil', id, a: ability }); }
  public sendCast(casterId: string, ability: string, target: CastTarget) {
    this.issue({ t: 'cast', id: casterId, a: ability, pos: target.pos ? { x: target.pos.x, y: target.pos.y } : undefined, e: target.entity?.id ?? null, n: target.nodeId ?? null });
  }
  public sendLarvaRally(ids: string[], pos: Vector2D, targetId: string | null) { this.issue({ t: 'lrally', ids, pos, target: targetId }); }
  public sendRally(buildingId: string, pos: Vector2D, targetId: string | null) { this.issue({ t: 'rally', b: buildingId, pos, target: targetId }); }
  public sendStructureAction(buildingId: string, action: StructureAction, extra: { u?: string; pos?: Vector2D } = {}) { this.issue({ t: 'act', id: buildingId, a: action, ...extra }); }

  // -------------------------------------------------------------------------
  // Desync healing and fallback
  // -------------------------------------------------------------------------
  private onDesync(turn: number) {
    if (this.role !== 'host' || turn < this.ignoreDesyncBefore || this.healWanted) return;
    this.stats.desyncs++;
    const now = performance.now();
    this.heals = this.heals.filter(t => now - t < 60_000);
    this.heals.push(now);
    if (this.heals.length > MAX_HEALS_PER_MINUTE) { this.switchToSnapshot(); return; }
    this.healWanted = true; // sent at the next turn start, from a clean turn boundary
    console.warn(`[net] lockstep desync at turn ${turn}: sending a keyframe`);
  }

  /** Host: give up on lockstep for this match. Orders already received still run. */
  private switchToSnapshot() {
    const ls = this.ls;
    if (!ls || this.role !== 'host') return;
    console.warn('[net] repeated desyncs: switching to snapshot sync');
    this.client.relay({ t: 'ls_off' });
    const mine = ls.takeUnsent(), theirs = ls.remoteFrom(ls.turn);
    this.ls = null;
    this.mode = 'snapshot';
    Unit.commandHook = null;
    this.world.inSim = true;
    try {
      for (const m of mine) applyCommand(this.world, 'player', m);
      for (const m of theirs) applyCommand(this.world, this.remotePid, m);
    } finally { this.world.inSim = false; }
    this.onNotice?.('Connection unstable: switched to host-run sync');
  }

  /** Guest: the host switched to snapshot sync. */
  private leaveLockstep() {
    const ls = this.ls;
    if (!ls) return;
    this.ls = null;
    this.mode = 'snapshot';
    for (const m of ls.takeUnsent()) this.client.relay(m);
    this.onNotice?.('Connection unstable: switched to host-run sync');
  }

  // -------------------------------------------------------------------------
  // Keyframes
  // -------------------------------------------------------------------------

  /** Host: send the whole state. `turn` >= 0: a lockstep keyframe for that turn; -1: a migration backup (snapshot mode). */
  private sendKeyframe(turn: number, epoch = 0) {
    const data = captureKeyframe(this.world);
    const id = `${++this.kfSeq}`;
    this.stats.keyframesSent++;
    const t0 = performance.now();
    void encodeKeyframe(data).then(text => {
      const n = Math.max(1, Math.ceil(text.length / CHUNK));
      if (turn === 0 && !this.started) NetTrace.mark('kf_sent', { kb: Math.round(text.length / 1024), parts: n, encodeMs: Math.round(performance.now() - t0) });
      for (let i = 0; i < n; i++) this.client.relay({ t: 'kf', id, k: turn, e: epoch, i, n, s: text.slice(i * CHUNK, (i + 1) * CHUNK) });
    }).catch(e => console.warn('[net] keyframe encode failed', e));
  }

  private onKeyframePart(m: any) {
    if (typeof m.id !== 'string' || !Number.isInteger(m.i) || !Number.isInteger(m.n) || m.n < 1 || m.n > 2000 || typeof m.s !== 'string') return;
    let parts = this.kfParts.get(m.id);
    if (!parts) { parts = new Array(m.n); this.kfParts.set(m.id, parts); }
    parts[m.i] = m.s;
    if (parts.filter(p => p !== undefined).length < m.n) return;
    this.kfParts.delete(m.id);
    const seq = Number(m.id);
    const t0 = performance.now();
    if (!this.started) NetTrace.mark('kf_received', { parts: m.n });
    void decodeKeyframe(parts.join('')).then(data => {
      if (!this.started) NetTrace.mark('kf_decoded', { ms: Math.round(performance.now() - t0) });
      if (seq < this.kfLatest) return; // an older one finished decoding late
      this.kfLatest = seq;
      const local = this.pvp ? mirrorKeyframe(data) : data;
      if (m.k >= 0 && this.ls) {
        applyKeyframe(this.world, local, this.controlGroups);
        this.stats.keyframesApplied++;
        this.ls.rewindTo(m.k, Number.isInteger(m.e) ? m.e : 0);
        this.acc = 0;
        if (this.started) this.onNotice?.('Resynced with the host');
        else {
          NetTrace.mark('kf_applied', { turn: m.k });
          this.client.relay({ t: 'ready', trace: NetTrace.startEvents() });
          this.start('keyframe applied');
        }
      } else if (m.k < 0) {
        this.lastKeyframe = local;
      }
    }).catch(e => console.warn('[net] keyframe decode failed', e));
  }

  /** Snapshot co-op guest whose host left: continue from the latest keyframe. Returns false if there is none. */
  public restoreLastKeyframe(): boolean {
    if (!this.lastKeyframe) return false;
    applyKeyframe(this.world, this.lastKeyframe, this.controlGroups);
    return true;
  }

  // -------------------------------------------------------------------------
  // Incoming
  // -------------------------------------------------------------------------
  private onMessage(m: any) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'peer_left':
      case 'guest_left':
      case 'disconnected':
        this.onPeerLost?.();
        return;
      case 'ls':
        this.ls?.receive(m as TurnPacket);
        this.onRemoteTurn?.();
        return;
      case 'kf':
        if (this.role === 'guest') this.onKeyframePart(m);
        return;
      case 'ready':
        if (this.role === 'host' && this.ls) {
          if (Array.isArray(m.trace)) console.info('[net] guest start timeline\n' + NetTrace.format(m.trace.slice(0, 40)));
          this.start('guest ready');
          console.info('[net] host start timeline\n' + NetTrace.format(NetTrace.startEvents()));
        }
        return;
      case 'kf_req':
        // the guest never got the starting keyframe: the host has not run a tick yet, so the same state goes again
        if (this.role === 'host' && this.ls && !this.started) { NetTrace.mark('kf_resend'); this.sendKeyframe(0, 0); }
        return;
      case 'nstat':
        if (m.s && typeof m.s === 'object') this.remoteStats = m.s as NetStats;
        this.client.relay({ t: 'nack', at: m.at });
        return;
      case 'nack':
        if (typeof m.at === 'number') this.rtt = performance.now() - m.at;
        return;
      case 'ls_off':
        if (this.role === 'guest') this.leaveLockstep();
        return;
      case 'lpct': // the other player's loading progress (shown by the start modal)
        return;
      case 'toast':
        if (this.role === 'guest') this.onNotice?.(String(m.msg ?? '').slice(0, 200), !!m.err);
        return;
      case 'snap':
        if (this.puppet) this.snap.apply(m);
        return;
    }
    // snapshot host: a guest order, run at once
    if (this.role === 'host' && !this.ls) {
      this.world.inSim = true;
      try {
        const err = applyCommand(this.world, this.remotePid, m);
        if (err) this.client.relay({ t: 'toast', msg: err, err: true });
      } finally { this.world.inSim = false; }
    }
  }
}

export { isWorkerType };
