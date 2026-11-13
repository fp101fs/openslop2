/**
 * Client for the public game list (`/api/rooms`, a Vercel Function backed by Upstash Redis - see api/rooms.ts).
 * Everything here is optional infrastructure: when the API is missing or down, `available()` turns false for a while and the
 * callers fall back to the serverless slot scan, so multiplayer never depends on it.
 */

export type RoomStatus = 'open' | 'full' | 'live';

export interface ListedRoom {
  code: string;
  name: string;
  host: string;
  mode: 'multiplayer_pvp' | 'multiplayer_coop';
  hostFaction: string;
  enemyFaction: string;
  mapId: string;
  status: RoomStatus;
  quick: boolean;
  /** Host's game version (missing on rooms from builds before version checks). */
  version?: string;
  country?: string;
  createdAt: number;
  ageSec: number;
}

export interface RoomFields {
  code: string;
  name: string;
  host: string;
  mode?: string;
  hostFaction?: string;
  enemyFaction?: string;
  mapId?: string;
  status?: RoomStatus;
  quick?: boolean;
  version?: string;
}

const ENDPOINT = '/api/rooms';
const REQUEST_TIMEOUT_MS = 4500;
const RETRY_AFTER_DOWN_MS = 30_000;

type State = 'unknown' | 'up' | 'down';

class LobbyApi {
  private state: State = 'unknown';
  private downAt = 0;
  private probing: Promise<boolean> | null = null;

  private async request(init: RequestInit & { timeout?: number } = {}, query = ''): Promise<Response> {
    const ctl = new AbortController();
    const timer = window.setTimeout(() => ctl.abort(), init.timeout ?? REQUEST_TIMEOUT_MS);
    try {
      return await fetch(ENDPOINT + query, { cache: 'no-store', ...init, signal: ctl.signal });
    } finally {
      window.clearTimeout(timer);
    }
  }

  /** Whether the list service can be used right now. Cheap: the answer is cached and a failed service is retried after 30s. */
  public available(): Promise<boolean> {
    if (this.state === 'up') return Promise.resolve(true);
    if (this.state === 'down' && Date.now() - this.downAt < RETRY_AFTER_DOWN_MS) return Promise.resolve(false);
    if (!this.probing) {
      this.probing = this.list().then(() => true, () => false).finally(() => { this.probing = null; });
    }
    return this.probing;
  }

  public isDown(): boolean { return this.state === 'down'; }

  /** Fetch the public rooms. Throws if the service is unavailable (and remembers that). */
  public async list(): Promise<ListedRoom[]> {
    try {
      const res = await this.request();
      if (!res.ok) throw new Error(`list ${res.status}`);
      const data = await res.json();
      if (!data || data.v !== 2 || !Array.isArray(data.rooms)) throw new Error('not the list service'); // e.g. the relay's own /api/rooms
      this.state = 'up';
      return data.rooms as ListedRoom[];
    } catch (err) {
      this.state = 'down';
      this.downAt = Date.now();
      throw err;
    }
  }

  /** Create or refresh a room. Resolves with the host's secret token (reuse it for every later call). */
  public async put(room: RoomFields, token?: string): Promise<string> {
    const res = await this.request({
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { 'x-room-token': token } : {}) },
      body: JSON.stringify({ ...room, token })
    });
    if (res.status === 409) throw new Error('code_taken');
    if (!res.ok) throw new Error(`put ${res.status}`);
    const data = await res.json();
    return String(data.token || token || '');
  }

  /** Remove a room. Uses keepalive so it still goes out while the page is closing. */
  public remove(code: string, token: string) {
    try {
      void fetch(ENDPOINT, {
        method: 'POST', keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'delete', code, token })
      }).catch(() => {});
    } catch {}
  }
}

export const lobbyApi = new LobbyApi();
