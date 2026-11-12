import { RoomInfo, fetchRooms } from './NetClient';
import { lobbyApi, ListedRoom } from './lobbyApi';
import { roomProber } from './RoomProber';
import { P2PClient, useP2P } from './P2PClient';

export type BrowserPhase = 'loading' | 'ready' | 'error';
export interface BrowserState {
  phase: BrowserPhase;
  rooms: RoomInfo[];
  /** api = public game list service, slots = serverless slot scan fallback, relay = local relay server */
  source: 'api' | 'slots' | 'relay';
  updatedAt: number;
}

const POLL_MS = 3000;
const POLL_HIDDEN_MS = 15000;
const MAX_BACKOFF_MS = 30000;
const PROBE_LIMIT = 8;

const toInfo = (r: ListedRoom): RoomInfo => ({
  code: r.code, host: r.host, name: r.name, mode: r.mode, hostFaction: r.hostFaction, enemyFaction: r.enemyFaction,
  mapId: r.mapId, status: r.status, country: r.country, createdAt: r.createdAt, quick: r.quick, ageSec: r.ageSec
});

/**
 * Keeps the Open Games list fresh: smart polling (3s while the tab is visible, slow when hidden, exponential backoff on errors),
 * ping/liveness enrichment of the open rooms, and graceful fallback (list service -> slot scan). Subscribers are told only
 * when something visible changed; `onRefreshing` is a separate, cheap signal for a "refreshing" spinner.
 */
export class RoomBrowser {
  public state: BrowserState = { phase: 'loading', rooms: [], source: 'api', updatedAt: 0 };
  private subs = new Set<(s: BrowserState) => void>();
  private refreshSubs = new Set<(busy: boolean) => void>();
  private timer: number | null = null;
  private running = false;
  private busy = false;
  private failures = 0;
  private lastSig = '';
  private emitTimer: number | null = null;
  private raw: RoomInfo[] = [];
  private dead = new Set<string>(); // rooms whose host did not answer a probe (stale entries)
  private readonly onVisible = () => { if (this.running && !document.hidden) void this.refresh(); };

  public subscribe(fn: (s: BrowserState) => void): () => void { this.subs.add(fn); return () => this.subs.delete(fn); }
  public onRefreshing(fn: (busy: boolean) => void): () => void { this.refreshSubs.add(fn); return () => this.refreshSubs.delete(fn); }

  public start() {
    if (this.running) return;
    this.running = true;
    this.state = { ...this.state, phase: this.state.rooms.length ? this.state.phase : 'loading' };
    document.addEventListener('visibilitychange', this.onVisible);
    void this.tick();
  }

  public stop() {
    this.running = false;
    document.removeEventListener('visibilitychange', this.onVisible);
    if (this.timer !== null) { window.clearTimeout(this.timer); this.timer = null; }
    if (this.emitTimer !== null) { window.clearTimeout(this.emitTimer); this.emitTimer = null; }
    roomProber.release();
  }

  /** Poll now (manual retry button, tab became visible, filters changed...). */
  public async refresh() {
    if (this.timer !== null) { window.clearTimeout(this.timer); this.timer = null; }
    await this.tick();
  }

  private schedule(ms: number) {
    if (!this.running) return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.tick(), ms);
  }

  private setBusy(b: boolean) {
    if (this.busy === b) return;
    this.busy = b;
    this.refreshSubs.forEach(f => f(b));
  }

  private async tick() {
    if (!this.running || this.busy) return;
    if (document.hidden) { this.schedule(POLL_HIDDEN_MS); return; }
    this.setBusy(true);
    try {
      if (!useP2P()) {
        this.raw = (await fetchRooms()).map(r => ({ ...r, status: 'open' as const }));
        this.state = { ...this.state, source: 'relay' };
      } else if (await lobbyApi.available()) {
        this.raw = (await lobbyApi.list()).map(toInfo);
        this.state = { ...this.state, source: 'api' };
      } else {
        const slots = await P2PClient.listOpen();
        this.raw = slots.map((r: RoomInfo) => ({ ...r, name: `${r.host}'s game`, status: 'open' as const }));
        this.state = { ...this.state, source: 'slots' };
      }
      this.failures = 0;
      this.state = { ...this.state, phase: 'ready', updatedAt: Date.now() };
      this.compose();
      if (this.state.source === 'api') this.probeOpenRooms();
      this.schedule(POLL_MS);
    } catch {
      this.failures++;
      // keep showing the last good list; only show the error state when there is nothing to show
      if (!this.state.rooms.length || this.failures >= 3) this.state = { ...this.state, phase: 'error' };
      this.emitNow();
      this.schedule(Math.min(POLL_MS * 2 ** this.failures, MAX_BACKOFF_MS));
    } finally {
      this.setBusy(false);
    }
  }

  /** Measure ping (and confirm liveness) for the newest open rooms; results stream into the list as they arrive. */
  private probeOpenRooms() {
    const candidates = this.raw.filter(r => r.status === 'open').slice(0, PROBE_LIMIT);
    for (const r of candidates) {
      if (roomProber.cached(r.code)) continue;
      void roomProber.probe(r.code).then(() => { if (this.running) this.compose(); });
    }
  }

  /** Merge probe results into the raw list: attach pings, hide rooms whose host is unreachable. */
  private compose() {
    const live = new Set(this.raw.map(r => r.code));
    for (const c of this.dead) if (!live.has(c)) this.dead.delete(c);
    const rooms: RoomInfo[] = [];
    for (const r of this.raw) {
      let ping = r.pingMs;
      if (this.state.source === 'api' && r.status === 'open') {
        const p = roomProber.cached(r.code);
        if (p) {
          if (p.ping === null) { this.dead.add(r.code); continue; } // listed but not answering: stale entry
          this.dead.delete(r.code);
          ping = p.ping;
          if (!p.open) { rooms.push({ ...r, status: 'full', pingMs: ping }); continue; }
        }
      }
      rooms.push({ ...r, pingMs: ping });
    }
    this.state = { ...this.state, rooms };
    this.emitSoon();
  }

  private emitSoon() {
    if (this.emitTimer !== null) return;
    this.emitTimer = window.setTimeout(() => { this.emitTimer = null; this.emitNow(); }, 120); // coalesce a burst of probe results
  }

  private emitNow() {
    const sig = this.state.phase + this.state.source + this.state.rooms.map(r => `${r.code}|${r.status}|${r.pingMs ?? ''}|${r.name}`).join(',');
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    this.subs.forEach(f => f(this.state));
  }
}

export const roomBrowser = new RoomBrowser();
