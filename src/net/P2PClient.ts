import { MatchConfig } from '../types';
import { PREFIX, QUICK_CODES } from './p2pConfig';
import { iceServers, prefetchIceServers } from './iceServers';
import { lobbyApi, ListedRoom } from './lobbyApi';
import { RoomDirectory } from './RoomDirectory';
import { roomProber } from './RoomProber';
import { createPeer, preparePeers, type PeerLike, type ConnLike } from './peerFactory';

/**
 * Serverless peer-to-peer multiplayer transport (WebRTC data channel; peers come from peerFactory.ts).
 *
 * It exposes the same surface as NetClient (host / join / quick / start / leave / relay / on ...) and emits the
 * same lobby messages the relay server does ('hosted', 'joined', 'guest_joined', 'config', 'start', 'peer_left',
 * 'guest_left', 'error', 'no_rooms', 'disconnected'), so the menu, NetSync and the rest of the game don't care
 * which transport is underneath. That makes it work on static hosts such as Vercel: the initial WebRTC handshake goes
 * through our own broker (api/signal.ts) when Upstash is configured, else the free PeerJS broker - all game data then
 * flows directly browser-to-browser.
 *
 * Room code <-> peer id:  "svg-<CODE>".  Quick Match uses the fixed code QUIK: the first player to claim the id
 * hosts, the next player to look for a game connects to it.
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

type Handler = (msg: any) => void;

function makeCode(): string {
  let c = '';
  for (let i = 0; i < 4; i++) c += ALPHABET[crypto.getRandomValues(new Uint32Array(1))[0]! % ALPHABET.length];
  return QUICK_CODES.includes(c) ? makeCode() : c;
}

export class P2PClient {
  private handlers = new Set<Handler>();
  private peer: PeerLike | null = null;
  private conn: ConnLike | null = null;   // host: the guest; guest: the host
  private role: 'host' | 'guest' | null = null;
  private code = '';
  private config: any = {};
  private hostName = '';
  private started = false;
  private timer: number | null = null;
  private lastJoinTimedOut = false;
  private seq = 0; // bumped by every teardown: lets async work (list lookups, probes) notice it was superseded
  private quickTimer: number | null = null;
  private directory = new RoomDirectory(ok => this.emit({ t: 'listing', ok }));
  public connected = true; // there is no persistent server connection to wait for

  constructor() {
    void prefetchIceServers(); // our own TURN relay credentials (api/turn.ts), ready before the player hosts or joins
    // free the broker id immediately when the tab closes so the room code / quick-match slot doesn't linger
    window.addEventListener('pagehide', () => this.teardown());
  }
  public name = 'Commander';

  public on(fn: Handler): () => void {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  /** Pick the handshake broker (our own when this deployment has one, else PeerJS). */
  public connect(): Promise<void> {
    return preparePeers();
  }

  private emit(msg: any) {
    this.handlers.forEach(h => h(msg));
  }

  private newPeer(id?: string): PeerLike {
    return createPeer(id, iceServers());
  }

  private teardown() {
    this.seq++;
    this.directory.stop();
    if (this.quickTimer !== null) { window.clearInterval(this.quickTimer); this.quickTimer = null; }
    if (this.timer !== null) { window.clearTimeout(this.timer); this.timer = null; }
    try { this.conn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.conn = null;
    this.peer = null;
    this.role = null;
    this.started = false;
  }

  // -------------------------------------------------------------------------
  // Host
  // -------------------------------------------------------------------------
  public host(config: Partial<MatchConfig>, forceCode?: string, onTaken?: () => void, opts: { quick?: boolean } = {}) {
    if (config?.isPublic && !forceCode) { this.hostPublic(config, opts); return; }
    this.hostDirect(config, forceCode, onTaken, false, opts);
  }

  /** Public game: list it in the public game list when that service is up; otherwise claim a matchmaking slot (capped at 4). */
  private hostPublic(config: Partial<MatchConfig>, opts: { quick?: boolean }) {
    this.teardown();
    const seq = this.seq;
    this.emit({ t: 'status', text: 'Creating game…' });
    void lobbyApi.available().then(ok => {
      if (seq !== this.seq) return; // cancelled while waiting
      if (ok) { this.hostDirect(config, undefined, undefined, true, opts); return; }
      const trySlot = (k: number) => {
        if (k >= QUICK_CODES.length) { this.hostDirect({ ...config, isPublic: false }); return; } // every slot taken: private code
        this.hostDirect(config, QUICK_CODES[k]!, () => trySlot(k + 1), false, opts);
      };
      trySlot(0);
    });
  }

  private listing(status: 'open' | 'full' | 'live', extra: Record<string, any> = {}) {
    const c = this.config || {};
    return {
      code: this.code, host: this.hostName, name: String(c.gameName || '').trim() || `${this.hostName}'s game`,
      mode: c.mode, hostFaction: c.playerFaction, enemyFaction: c.enemyFaction, mapId: c.mapId, status, ...extra
    };
  }

  private hostDirect(config: Partial<MatchConfig>, forceCode?: string, onTaken?: () => void, publish = false, opts: { quick?: boolean } = {}) {
    this.teardown();
    this.role = 'host';
    this.config = config || {};
    this.hostName = this.name;
    this.code = forceCode || makeCode();
    const peer = this.newPeer(PREFIX + this.code);
    this.peer = peer;

    peer.on('open', () => {
      const slot = QUICK_CODES.includes(this.code);
      this.emit({ t: 'hosted', code: this.code, public: publish || slot, via: publish ? 'api' : slot ? 'slot' : null });
      if (publish) this.directory.start(this.listing('open', { quick: !!opts.quick }));
    });
    peer.on('error', (err: any) => {
      if (err?.type === 'unavailable-id') {
        if (forceCode) { onTaken?.(); return; }
        // random code collision: pick another
        this.hostDirect(config, undefined, undefined, publish, opts);
        return;
      }
      this.emit({ t: 'error', error: this.describeError(err) });
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch {} });
    peer.on('connection', (conn: ConnLike) => {
      let decided = false;
      conn.on('error', () => {});
      conn.on('data', (d: any) => {
        if (!decided) {
          decided = true;
          // 'peek' = the Open Games list asking for this game's details without joining it
          if (d?.k === 's' && d.t === 'peek') {
            const open = !(this.conn && this.conn.open) && !this.started;
            try { conn.send({ k: 's', t: 'info', code: this.code, hostName: this.hostName, config: this.config, open }); } catch {}
            setTimeout(() => conn.close(), 400);
            return;
          }
          if (this.conn && this.conn.open) {
            try { conn.send({ k: 's', t: 'error', error: 'That game is already full' }); } catch {}
            setTimeout(() => conn.close(), 300);
            return;
          }
          if (this.started) {
            try { conn.send({ k: 's', t: 'error', error: 'That game already started' }); } catch {}
            setTimeout(() => conn.close(), 300);
            return;
          }
          this.conn = conn;
          this.directory.update({ status: 'full' });
          conn.on('close', () => {
            if (this.conn === conn) {
              this.conn = null;
              this.started = false;
              this.directory.update({ status: 'open' });
              this.emit({ t: 'guest_left' });
            }
          });
        }
        if (conn === this.conn) this.onData(d);
      });
    });
  }

  // -------------------------------------------------------------------------
  // Guest
  // -------------------------------------------------------------------------
  public join(code: string, onUnavailable?: () => void) {
    this.teardown();
    this.role = 'guest';
    this.code = code.toUpperCase().trim();
    const peer = this.newPeer();
    this.peer = peer;
    let opened = false;

    peer.on('open', () => {
      const conn = peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
      this.conn = conn;
      this.timer = window.setTimeout(() => {
        if (!opened) {
          // Quick Match: a stale/unresponsive waiting host - take over the slot instead of failing
          this.lastJoinTimedOut = true;
          if (onUnavailable) { onUnavailable(); return; }
          this.emit({ t: 'error', error: 'Could not connect to that game (timed out). Check the code, or try again.' });
          this.teardown();
        }
      }, onUnavailable ? 8000 : 15000);
      conn.on('open', () => {
        opened = true;
        if (this.timer !== null) { window.clearTimeout(this.timer); this.timer = null; }
        conn.send({ k: 's', t: 'hello', name: this.name });
      });
      conn.on('data', (d: any) => this.onData(d));
      conn.on('close', () => {
        if (this.conn === conn && this.role === 'guest') {
          this.conn = null;
          this.emit({ t: this.started ? 'peer_left' : 'peer_left' });
        }
      });
      conn.on('error', () => {});
    });
    peer.on('error', (err: any) => {
      if (err?.type === 'peer-unavailable') {
        this.lastJoinTimedOut = false;
        if (onUnavailable) { onUnavailable(); return; }
        this.emit({ t: 'error', error: `No game found with code ${this.code}` });
        this.teardown();
        return;
      }
      this.emit({ t: 'error', error: this.describeError(err) });
    });
  }

  public quick(config?: Partial<MatchConfig>) {
    const cfg = config || { mode: 'multiplayer_pvp', playerFaction: 'terran', enemyFaction: 'zerg', mapId: 'sector_vanguard', difficulty: 'normal' } as any;
    this.teardown();
    const seq = this.seq;
    this.emit({ t: 'status', text: 'Searching for games…' });
    void lobbyApi.available().then(ok => {
      if (seq !== this.seq) return; // cancelled
      if (ok) void this.quickViaList(cfg, seq); else this.quickViaSlots(cfg);
    });
  }

  /** Quick Match on the public game list: join the lowest-ping open game, otherwise create one and wait. */
  private async quickViaList(cfg: Partial<MatchConfig>, seq: number) {
    let rooms: ListedRoom[];
    try { rooms = await lobbyApi.list(); } catch { if (seq === this.seq) this.quickViaSlots(cfg); return; }
    if (seq !== this.seq) return;
    const open = rooms.filter(r => r.status === 'open' && r.mode === cfg.mode).slice(0, 6);
    if (open.length) {
      this.emit({ t: 'status', text: open.length === 1 ? 'Found a game, checking connection…' : `Found ${open.length} games, picking the best connection…` });
      const probed = await Promise.all(open.map(r => roomProber.probe(r.code).then(p => ({ r, p }))));
      if (seq !== this.seq) return;
      const best = probed.filter(x => x.p.ping !== null && x.p.open).sort((a, b) => a.p.ping! - b.p.ping!).map(x => x.r);
      if (best.length) { this.joinFirst(best, 0, cfg); return; }
    }
    this.emit({ t: 'status', text: 'No games found, creating one…' });
    this.createQuickRoom(cfg);
  }

  private joinFirst(list: ListedRoom[], k: number, cfg: Partial<MatchConfig>) {
    if (k >= list.length) { this.emit({ t: 'status', text: 'No games found, creating one…' }); this.createQuickRoom(cfg); return; }
    const r = list[k]!;
    this.emit({ t: 'status', text: `Connecting to ${r.name}…` });
    this.join(r.code, () => this.joinFirst(list, k + 1, cfg)); // host unreachable: try the next best
  }

  private createQuickRoom(cfg: Partial<MatchConfig>) {
    this.hostDirect({ ...cfg, isPublic: true }, undefined, undefined, true, { quick: true });
    const seq = this.seq;
    // Two players can create a quick room at the same moment and never meet: the newer room defers to the older one.
    this.quickTimer = window.setInterval(async () => {
      if (seq !== this.seq || this.role !== 'host' || (this.conn && this.conn.open)) return;
      let rooms: ListedRoom[];
      try { rooms = await lobbyApi.list(); } catch { return; }
      if (seq !== this.seq || this.role !== 'host' || (this.conn && this.conn.open)) return;
      const me = rooms.find(r => r.code === this.code);
      if (!me) return;
      const older = rooms
        .filter(r => r.code !== this.code && r.quick && r.status === 'open' && r.mode === cfg.mode && (r.createdAt < me.createdAt || (r.createdAt === me.createdAt && r.code < me.code)))
        .sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!older) return;
      const p = await roomProber.probe(older.code);
      if (seq !== this.seq || !p.open || p.ping === null) return;
      this.emit({ t: 'status', text: `Found ${older.name}, connecting…` });
      this.join(older.code, () => this.createQuickRoom(cfg)); // it vanished: go back to waiting in our own room
    }, 3000);
  }

  private quickViaSlots(cfg: Partial<MatchConfig>) {
    const status: ('free' | 'stale')[] = [];
    const claim = (order: number[], k: number) => {
      if (k >= order.length) {
        this.emit({ t: 'error', error: 'Quick Match is busy right now - host a game and share the code instead.' });
        this.teardown();
        return;
      }
      const i = order[k]!;
      this.host(cfg, QUICK_CODES[i]!, () => claim(order, k + 1));
    };
    const scan = (i: number) => {
      if (i >= QUICK_CODES.length) {
        const idx = QUICK_CODES.map((_, n) => n);
        claim([...idx.filter(n => status[n] === 'free'), ...idx.filter(n => status[n] === 'stale')], 0);
        return;
      }
      let settled = false;
      this.join(QUICK_CODES[i]!, () => {
        if (settled) return;
        settled = true;
        status[i] = this.lastJoinTimedOut ? 'stale' : 'free';
        scan(i + 1);
      });
    };
    scan(0);
  }

  /** Open Games list: peek at every matchmaking slot and return the public games still waiting for a guest. */
  public static listOpen(timeoutMs = 8000): Promise<any[]> {
    return preparePeers().then(() => new Promise<any[]>(resolve => {
      const rooms: any[] = [];
      const settled = new Set<string>();
      let done = false;
      let peer: PeerLike | null = null;
      const finish = () => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        try { peer?.destroy(); } catch {}
        resolve(rooms);
      };
      const timer = window.setTimeout(finish, timeoutMs);
      const settle = (code: string) => { settled.add(code); if (settled.size >= QUICK_CODES.length) finish(); };
      try {
        peer = createPeer(undefined, iceServers());
      } catch { finish(); return; }
      peer.on('error', (err: any) => {
        const code = QUICK_CODES.find(c => String(err?.message || '').includes(PREFIX + c));
        if (code) settle(code); else if (err?.type !== 'peer-unavailable') finish();
      });
      peer.on('open', () => {
        for (const code of QUICK_CODES) {
          const conn = peer!.connect(PREFIX + code, { reliable: true, serialization: 'json' });
          let sentAt = 0;
          conn.on('open', () => { sentAt = performance.now(); try { conn.send({ k: 's', t: 'peek' }); } catch { settle(code); } });
          conn.on('data', (d: any) => {
            if (d?.k === 's' && d.t === 'info' && d.open) { // only Quick Match / public hosts ever sit on these slot codes
              rooms.push({
                code: d.code, host: d.hostName, mode: d.config?.mode, hostFaction: d.config?.playerFaction,
                enemyFaction: d.config?.enemyFaction, mapId: d.config?.mapId, ageSec: 0,
                pingMs: sentAt ? Math.round(performance.now() - sentAt) : undefined
              });
            }
            settle(code);
          });
          conn.on('error', () => settle(code));
        }
      });
    }));
  }

  // -------------------------------------------------------------------------
  // Messaging
  // -------------------------------------------------------------------------
  private onData(d: any) {
    if (!d || typeof d !== 'object') return;
    if (d.k === 'g') { if (d.d && typeof d.d === 'object') this.emit(d.d); return; }
    if (d.k !== 's') return;
    if (this.role === 'host') {
      if (d.t === 'hello' && this.conn) {
        const name = String(d.name || 'Commander').replace(/[^\p{L}\p{N} _.\-]/gu, '').slice(0, 20) || 'Commander';
        try { this.conn.send({ k: 's', t: 'joined', code: this.code, hostName: this.hostName, config: this.config }); } catch {}
        this.emit({ t: 'guest_joined', name });
      }
    } else if (this.role === 'guest') {
      if (d.t === 'start') this.started = true;
      this.emit(d);
    }
  }

  /** Host-side lobby updates (config changes). Other lobby verbs have dedicated methods. */
  public send(msg: any) {
    if (msg?.t === 'config' && this.role === 'host') {
      this.config = msg.config || this.config;
      const l = this.listing('open');
      this.directory.update({ name: l.name, mode: l.mode, hostFaction: l.hostFaction, enemyFaction: l.enemyFaction, mapId: l.mapId });
      this.sendSys({ t: 'config', config: this.config });
    }
  }

  private sendSys(msg: any) {
    try { if (this.conn?.open) this.conn.send({ k: 's', ...msg }); } catch {}
  }

  /** Send a game message to the other peer. */
  public relay(d: any) {
    try { if (this.conn?.open) this.conn.send({ k: 'g', d }); } catch {}
  }

  public start() {
    if (this.role === 'host' && this.conn?.open) {
      this.started = true;
      this.directory.update({ status: 'live' });
      this.sendSys({ t: 'start' });
      this.emit({ t: 'start' });
    }
  }

  public leave() {
    this.teardown();
  }

  public close() {
    this.handlers.clear();
    this.teardown();
  }

  private describeError(err: any): string {
    const type = err?.type;
    if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
      return 'Could not reach the matchmaking broker (check your internet connection, then try again).';
    }
    if (type === 'browser-incompatible') return 'This browser does not support WebRTC.';
    return `Connection problem${type ? ` (${type})` : ''}. Try again.`;
  }
}

/** True when multiplayer should use serverless WebRTC instead of the relay server. */
export function useP2P(): boolean {
  const params = new URLSearchParams(location.search);
  if (params.has('p2p')) return params.get('p2p') !== '0';
  if (params.get('relay')) return false;
  const h = location.hostname;
  const local = h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h) || h.endsWith('.local');
  return !local; // static/online deployments (Vercel) have no relay, local play uses the relay
}
