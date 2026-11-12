import { signalApi, signalCall } from './signalApi';

/**
 * Plain-WebRTC stand-in for a PeerJS `Peer`, using our own handshake broker (`/api/signal`) instead of the public PeerJS
 * server. It mimics only what the game uses: events 'open' | 'connection' | 'error' | 'disconnected' | 'close',
 * connect() / destroy() / reconnect(), and data connections with 'open' | 'data' | 'close' | 'error', send(), close(), open.
 * Error objects carry PeerJS's `type` names ('unavailable-id', 'peer-unavailable', 'network', 'server-error').
 *
 * Handshake: the joiner sends one offer, the host answers once (ICE candidates gathered so far are bundled in; slower ones,
 * such as TURN relay addresses, follow in one 'cand' message), then the data channel opens browser to browser.
 * Each side polls its inbox: fast while a handshake is pending, slowly otherwise.
 */

type Fn = (...a: any[]) => void;

const POLL_PENDING_MS = 400;
const POLL_IDLE_MS = 2000;
const POLL_BUSY_MS = 5000; // a guest is connected: new connections are only status peeks
const SRFLX_GRACE_MS = 150; // after the first public address: room for a fast TURN reply to make it into the SDP
const SEND_MAX_MS = 1000;    // send the SDP by then even without a public address
const GATHER_MAX_MS = 3000;  // later candidates are batched until gathering ends or this cap

class Emitter {
  private handlers = new Map<string, Set<Fn>>();
  public on(event: string, fn: Fn): this {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(fn);
    return this;
  }
  protected emit(event: string, ...args: any[]) {
    this.handlers.get(event)?.forEach(fn => { try { fn(...args); } catch (e) { console.error(e); } });
  }
}

/**
 * Resolve as soon as the local description is worth sending: a public (srflx) address is in (plus a short grace), gathering
 * finished, or a short cap passed. Candidates that show up later (typically TURN relay addresses) are handed to `late`
 * in one batch when gathering ends, so a slow or dead public server never delays the handshake.
 */
function gathered(pc: RTCPeerConnection, late: (c: RTCIceCandidateInit[]) => void): Promise<void> {
  return new Promise(resolve => {
    let sent = false;
    const extra: RTCIceCandidateInit[] = [];
    const send = () => { if (!sent) { sent = true; clearTimeout(sendCap); resolve(); } };
    const finish = () => {
      clearTimeout(lateCap);
      pc.removeEventListener('icecandidate', onCand);
      pc.removeEventListener('icegatheringstatechange', onState);
      send();
      if (extra.length) late(extra);
    };
    const onCand = (e: RTCPeerConnectionIceEvent) => {
      if (!e.candidate) { finish(); return; }
      if (sent) { extra.push(e.candidate.toJSON()); return; }
      if (e.candidate.type === 'srflx') setTimeout(send, SRFLX_GRACE_MS);
    };
    const onState = () => { if (pc.iceGatheringState === 'complete') finish(); };
    const sendCap = setTimeout(send, SEND_MAX_MS);
    const lateCap = setTimeout(finish, GATHER_MAX_MS);
    pc.addEventListener('icecandidate', onCand);
    pc.addEventListener('icegatheringstatechange', onState);
    if (pc.iceGatheringState === 'complete') finish();
  });
}

const randomId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export class SignalConnection extends Emitter {
  public open = false;
  public closed = false;
  private dc: RTCDataChannel | null = null;
  private queued: RTCIceCandidateInit[] = [];
  /** Outgoing handshake messages go out one after another, so the other side sees them in order. */
  public outbox: Promise<unknown> = Promise.resolve();

  constructor(public readonly peer: string, public readonly cid: string, public readonly pc: RTCPeerConnection, private onClosed: () => void) {
    super();
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.close();
    });
  }

  public attach(dc: RTCDataChannel) {
    this.dc = dc;
    dc.onopen = () => { if (this.closed || this.open) return; this.open = true; this.emit('open'); };
    dc.onmessage = e => {
      let d: any;
      try { d = JSON.parse(String(e.data)); } catch { return; }
      this.emit('data', d);
    };
    dc.onclose = () => this.close();
    dc.onerror = () => this.emit('error', { type: 'connection' });
    if (dc.readyState === 'open') dc.onopen?.(new Event('open'));
  }

  /** Late ICE candidates from the other side (queued until its description is set). */
  public addRemote(list: RTCIceCandidateInit[]) {
    if (!this.pc.remoteDescription) { this.queued.push(...list); return; }
    for (const c of list) this.pc.addIceCandidate(c).catch(() => {});
  }

  /** Set the other side's description, then apply any candidates that arrived first. */
  public async setRemote(desc: RTCSessionDescriptionInit) {
    await this.pc.setRemoteDescription(desc);
    const q = this.queued;
    this.queued = [];
    this.addRemote(q);
  }

  public send(d: unknown) {
    if (!this.dc || this.dc.readyState !== 'open') throw new Error('Connection is not open');
    this.dc.send(JSON.stringify(d));
  }

  public close() {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    try { this.dc?.close(); } catch {}
    try { this.pc.close(); } catch {}
    this.onClosed();
    this.emit('close');
  }

  /** Let the owning peer report failures on this connection. */
  public fail(err: unknown) { this.emit('error', err); this.close(); }
}

export class SignalPeer extends Emitter {
  public id = '';
  public destroyed = false;
  private token = '';
  private conns = new Map<string, SignalConnection>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;
  private claiming = false;

  constructor(private readonly wantId: string | undefined, private readonly opts: { config?: RTCConfiguration } = {}) {
    super();
    setTimeout(() => void this.claim(), 0); // after the caller attached its listeners, like PeerJS
  }

  private async claim() {
    if (this.destroyed || this.claiming) return;
    this.claiming = true;
    const r = await signalCall({ op: 'claim', id: this.wantId ?? (this.id || undefined) });
    this.claiming = false;
    if (this.destroyed) {
      if (r.status === 200) void signalCall({ op: 'release', id: r.data.id, token: r.data.token }, true);
      return;
    }
    if (r.status === 409) { this.emit('error', { type: 'unavailable-id', message: `ID "${this.wantId}" is taken` }); return; }
    if (r.status !== 200 || !r.data?.token) {
      signalApi.markDown(); // the next peer uses PeerJS instead
      this.emit('error', { type: r.status === 0 ? 'network' : 'server-error', message: 'Handshake server unavailable' });
      return;
    }
    const first = !this.id;
    this.id = r.data.id;
    this.token = r.data.token;
    if (first) this.emit('open', this.id);
    this.kick();
  }

  /** Re-take our id after it expired (PeerJS calls this after 'disconnected'). */
  public reconnect() {
    if (!this.token) void this.claim();
  }

  private delay(): number {
    let busy = false;
    for (const c of this.conns.values()) {
      if (!c.open) return POLL_PENDING_MS;
      busy = true;
    }
    return busy ? POLL_BUSY_MS : POLL_IDLE_MS;
  }

  /** (Re)schedule the next poll; a poll in flight schedules its own successor. */
  private kick() {
    if (this.destroyed || this.polling || !this.token) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.poll(), this.delay());
  }

  private async poll() {
    this.timer = null;
    if (this.destroyed || !this.token) return;
    this.polling = true;
    const r = await signalCall({ op: 'poll', id: this.id, token: this.token });
    this.polling = false;
    if (this.destroyed) return;
    if (r.status === 410) { this.token = ''; this.emit('disconnected'); return; }
    if (r.status === 200 && Array.isArray(r.data?.msgs)) for (const m of r.data.msgs) this.handle(m);
    this.kick();
  }

  private handle(m: any) {
    if (!m || typeof m.cid !== 'string' || typeof m.from !== 'string') return;
    if (m.t === 'offer' && typeof m.sdp === 'string') { void this.answer(m.from, m.cid, m.sdp); return; }
    const c = this.conns.get(m.cid);
    if (!c || c.closed) return;
    if (m.t === 'answer' && typeof m.sdp === 'string' && c.pc.signalingState === 'have-local-offer') c.setRemote({ type: 'answer', sdp: m.sdp }).catch(() => c.close());
    if (m.t === 'cand' && Array.isArray(m.c)) c.addRemote(m.c.filter((x: any) => x && typeof x.candidate === 'string'));
  }

  private track(peer: string, cid: string): SignalConnection {
    const pc = new RTCPeerConnection(this.opts.config);
    const c = new SignalConnection(peer, cid, pc, () => { this.conns.delete(cid); this.kick(); });
    this.conns.set(cid, c);
    return c;
  }

  /** Send a handshake message for connection `c`, after any earlier one for it. */
  private send(c: SignalConnection, msg: Record<string, unknown>): Promise<'ok' | 'unavailable' | 'error'> {
    const p = c.outbox.then(async () => {
      const r = await signalCall({ op: 'send', id: this.id, token: this.token, to: c.peer, msg: { ...msg, cid: c.cid } });
      return r.status === 200 ? 'ok' as const : r.status === 404 ? 'unavailable' as const : 'error' as const;
    });
    c.outbox = p.catch(() => {});
    return p;
  }

  /** Host side: someone sent us an offer. */
  private async answer(from: string, cid: string, sdp: string) {
    if (this.conns.has(cid)) return;
    const c = this.track(from, cid);
    c.pc.ondatachannel = e => c.attach(e.channel);
    this.emit('connection', c);
    try {
      await c.setRemote({ type: 'offer', sdp });
      await c.pc.setLocalDescription(await c.pc.createAnswer());
      await gathered(c.pc, list => { if (!c.closed) void this.send(c, { t: 'cand', c: list }); });
      if (c.closed || this.destroyed) return;
      if ((await this.send(c, { t: 'answer', sdp: c.pc.localDescription!.sdp })) !== 'ok') c.close();
    } catch {
      c.close();
    }
  }

  /** Guest side: open a data connection to `to` (PeerJS options are accepted and ignored: always reliable JSON). */
  public connect(to: string, _opts?: unknown): SignalConnection {
    const cid = randomId();
    const c = this.track(to, cid);
    c.attach(c.pc.createDataChannel('data', { ordered: true }));
    void (async () => {
      try {
        await c.pc.setLocalDescription(await c.pc.createOffer());
        await gathered(c.pc, list => { if (!c.closed) void this.send(c, { t: 'cand', c: list }); });
        if (c.closed || this.destroyed) return;
        const res = await this.send(c, { t: 'offer', sdp: c.pc.localDescription!.sdp });
        if (res === 'unavailable') {
          this.emit('error', { type: 'peer-unavailable', message: `Could not connect to peer ${to}` });
          c.close();
        } else if (res === 'error') {
          c.fail({ type: 'network' });
        } else {
          this.kick(); // poll fast for the answer
        }
      } catch {
        c.close();
      }
    })();
    return c;
  }

  public destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    for (const c of [...this.conns.values()]) c.close();
    if (this.token) void signalCall({ op: 'release', id: this.id, token: this.token }, true);
    this.token = '';
    this.emit('close');
  }
}
