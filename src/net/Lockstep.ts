/**
 * Deterministic lockstep turn scheduler. It has no game or network code, so tests can drive it directly.
 *
 * The simulation runs at a fixed `hz`. Ticks are grouped into turns of `turnTicks`. An order given during turn N is
 * scheduled for turn N + `delayTurns`, sent to the other player straight away, and run by both computers at the start of
 * that turn. A computer may start turn K only once it holds the other player's packet for K (an empty packet still
 * counts), so neither side can run ahead and both apply the same orders on the same tick.
 *
 * Each packet also carries a hash of the sender's state at the turn it was sent; the owner compares those to spot desyncs.
 */
export interface LockstepConfig {
  /** Simulation ticks per second. */
  hz: number;
  /** Ticks per turn (one packet per turn each way). */
  turnTicks: number;
  /** Input delay in turns: covers the network trip so play never waits on a normal connection. */
  delayTurns: number;
  /** Most ticks run in one frame (catching up after a hitch or a keyframe). */
  maxStepsPerFrame: number;
  /** Turns of order history kept (lets a keyframe rewind the guest and replay). */
  historyTurns: number;
}

/** 60 Hz ticks, 15 turns a second, 200 ms of input delay (absorbs ~200 ms one-way latency before play has to wait). */
export const LOCKSTEP_DEFAULTS: LockstepConfig = { hz: 60, turnTicks: 4, delayTurns: 3, maxStepsPerFrame: 8, historyTurns: 1200 };

export interface TurnPacket {
  t: 'ls';
  /** Turn the orders run on. */
  k: number;
  /** Orders (NetCommand objects). */
  c: unknown[];
  /** State hash of turn `hk` (absent on filler packets). */
  h?: number;
  hk?: number;
  /** Sender's keyframe epoch: hashes are only compared between packets of the same epoch. */
  e?: number;
}

export class Lockstep {
  public readonly cfg: LockstepConfig;
  public tick = 0;
  /** Called when both hashes for a turn are known and differ. */
  public onDesync: ((turn: number) => void) | null = null;
  /**
   * Bumped by every healing keyframe (host: when sending, guest: when applying). Packets carry it, and hashes from an older
   * epoch are ignored: the guest's packets still in flight were hashed before it took the keyframe.
   */
  public epoch = 0;

  private queue: unknown[] = [];
  private sentUpTo: number;
  private remoteUpTo: number;
  private local = new Map<number, unknown[]>();
  private remote = new Map<number, unknown[]>();
  private myHash = new Map<number, number>();
  private theirHash = new Map<number, number>();

  constructor(private send: (p: TurnPacket) => void, cfg: Partial<LockstepConfig> = {}) {
    this.cfg = { ...LOCKSTEP_DEFAULTS, ...cfg };
    // the first `delayTurns` turns have no orders on either side
    this.sentUpTo = this.cfg.delayTurns - 1;
    this.remoteUpTo = this.cfg.delayTurns - 1;
  }

  public get dt(): number { return 1 / this.cfg.hz; }
  public get turn(): number { return Math.floor(this.tick / this.cfg.turnTicks); }
  public get atTurnStart(): boolean { return this.tick % this.cfg.turnTicks === 0; }

  /** Turns the other player is ahead of us (positive: we should run extra ticks to catch up). */
  public get lead(): number { return this.remoteUpTo - this.sentUpTo; }

  /** Queue a local order for the next packet. */
  public queueLocal(cmd: unknown) { this.queue.push(cmd); }

  /** Orders queued but not yet sent (used when leaving lockstep). */
  public takeUnsent(): unknown[] { const q = this.queue; this.queue = []; return q; }

  /** Received orders for turns from `turn` on that have not run yet, in turn order (used when leaving lockstep). */
  public remoteFrom(turn: number): unknown[] {
    const out: unknown[] = [];
    for (let k = turn; k <= this.remoteUpTo; k++) out.push(...(this.remote.get(k) ?? []));
    return out;
  }

  public receive(p: TurnPacket) {
    if (!p || !Number.isInteger(p.k) || !Array.isArray(p.c)) return;
    this.remote.set(p.k, p.c);
    if (p.k > this.remoteUpTo) this.remoteUpTo = p.k;
    if (Number.isInteger(p.hk) && typeof p.h === 'number' && (p.e ?? 0) === this.epoch) {
      this.theirHash.set(p.hk!, p.h);
      this.compare(p.hk!);
    }
  }

  /** False while waiting for the other player's packet for the turn about to start. */
  public canStep(): boolean {
    if (!this.atTurnStart) return true;
    const k = this.turn;
    return k < this.cfg.delayTurns || this.remote.has(k);
  }

  /** Call at a turn start, before running its orders: records `hash`, sends our packet, returns the orders for this turn. */
  public beginTurn(hash: number): { local: unknown[]; remote: unknown[] } {
    const k = this.turn;
    this.myHash.set(k, hash);
    this.flushUpTo(k + this.cfg.delayTurns, hash, k);
    this.compare(k);
    return { local: this.local.get(k) ?? [], remote: this.remote.get(k) ?? [] };
  }

  /** Call after each simulation tick. */
  public endTick() {
    this.tick++;
    if (this.atTurnStart) {
      const old = this.turn - this.cfg.historyTurns;
      for (const m of [this.local, this.remote, this.myHash, this.theirHash]) m.delete(old);
    }
  }

  /** A keyframe put the state back (or forward) to the start of `turn`: continue from there with the stored orders. */
  public rewindTo(turn: number, epoch: number) {
    this.tick = turn * this.cfg.turnTicks;
    this.epoch = epoch;
    for (const m of [this.myHash, this.theirHash]) for (const k of [...m.keys()]) if (k >= turn) m.delete(k);
  }

  /** Host: a healing keyframe is on its way; hashes the guest made before taking it no longer count. */
  public newEpoch(): number {
    this.epoch++;
    this.theirHash.clear();
    return this.epoch;
  }

  /** Send every packet up to `target` that is still unsent: queued orders go in the first, the hash in the last. */
  private flushUpTo(target: number, hash: number, hk: number) {
    while (this.sentUpTo < target) {
      const k = ++this.sentUpTo;
      const c = this.queue;
      this.queue = [];
      this.local.set(k, c);
      const p: TurnPacket = { t: 'ls', k, c };
      if (k === target) { p.h = hash; p.hk = hk; if (this.epoch) p.e = this.epoch; }
      this.send(p);
    }
  }

  private compare(k: number) {
    const a = this.myHash.get(k), b = this.theirHash.get(k);
    if (a !== undefined && b !== undefined && a !== b) this.onDesync?.(k);
  }
}
