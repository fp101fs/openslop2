import { PREFIX, ICE_SERVERS } from './p2pConfig';
import { createPeer, preparePeers, type PeerLike } from './peerFactory';

export interface ProbeResult {
  /** Round-trip time to the host over the WebRTC data channel, or null when the host did not answer (stale / unreachable). */
  ping: number | null;
  /** Host says it is still waiting for a guest. */
  open: boolean;
}

const CACHE_MS = 20_000;
const UNREACHABLE: ProbeResult = { ping: null, open: false };

/**
 * Measures ping to listed games with the same 'peek' handshake the slot scan uses (the host replies with its details and
 * never treats the prober as a guest). One shared peer (peerFactory.ts) serves every probe; call release() when the list is closed.
 * Doubles as a liveness check: a listed room that does not answer is stale and gets hidden.
 */
export class RoomProber {
  private peerP: Promise<PeerLike | null> | null = null;
  private cache = new Map<string, { at: number; res: ProbeResult }>();
  private inflight = new Map<string, Promise<ProbeResult>>();
  private waiting = new Map<string, (r: ProbeResult) => void>();

  private getPeer(): Promise<PeerLike | null> {
    if (this.peerP) return this.peerP;
    this.peerP = preparePeers().then(() => new Promise<PeerLike | null>(resolve => {
      let peer: PeerLike;
      try { peer = createPeer(undefined, ICE_SERVERS); } catch { resolve(null); return; }
      let opened = false;
      const t = window.setTimeout(() => { if (!opened) { this.reset(); resolve(null); } }, 8000);
      peer.on('open', () => { opened = true; window.clearTimeout(t); resolve(peer); });
      peer.on('error', (err: any) => {
        // peer-unavailable names the id it could not reach: settle that probe right away
        const m = String(err?.message || '').match(/svg-([A-Z]{4,5})/);
        if (m && this.waiting.has(m[1]!)) { this.waiting.get(m[1]!)!(UNREACHABLE); return; }
        if (!opened) { window.clearTimeout(t); this.reset(); resolve(null); }
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch {} });
      peer.on('close', () => { this.peerP = null; });
    }));
    return this.peerP;
  }

  private reset() {
    const p = this.peerP;
    this.peerP = null;
    p?.then(peer => { try { peer?.destroy(); } catch {} });
  }

  public cached(code: string): ProbeResult | undefined {
    const c = this.cache.get(code);
    return c && Date.now() - c.at < CACHE_MS ? c.res : undefined;
  }

  public probe(code: string, timeoutMs = 6000): Promise<ProbeResult> {
    const hit = this.cached(code);
    if (hit) return Promise.resolve(hit);
    const running = this.inflight.get(code);
    if (running) return running;
    const p = this.run(code, timeoutMs).then(res => {
      this.cache.set(code, { at: Date.now(), res });
      return res;
    }).finally(() => { this.inflight.delete(code); });
    this.inflight.set(code, p);
    return p;
  }

  private async run(code: string, timeoutMs: number): Promise<ProbeResult> {
    const peer = await this.getPeer();
    if (!peer) return UNREACHABLE;
    return new Promise<ProbeResult>(resolve => {
      let done = false;
      let conn: any = null;
      const finish = (r: ProbeResult) => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        this.waiting.delete(code);
        try { conn?.close(); } catch {}
        resolve(r);
      };
      const timer = window.setTimeout(() => finish(UNREACHABLE), timeoutMs);
      this.waiting.set(code, finish);
      try { conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' }); } catch { finish(UNREACHABLE); return; }
      let sent = 0;
      conn.on('open', () => { sent = performance.now(); try { conn.send({ k: 's', t: 'peek' }); } catch { finish(UNREACHABLE); } });
      conn.on('data', (d: any) => {
        if (d?.k === 's' && d.t === 'info') finish({ ping: Math.max(1, Math.round(performance.now() - sent)), open: !!d.open });
      });
      conn.on('error', () => finish(UNREACHABLE));
      conn.on('close', () => finish(UNREACHABLE));
    });
  }

  /** Drop the shared peer (the broker connection) when nobody is looking at the list. */
  public release() {
    this.reset();
    this.cache.clear();
  }
}

export const roomProber = new RoomProber();
