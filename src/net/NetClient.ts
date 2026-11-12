import { MatchConfig } from '../types';

export interface RoomInfo {
  code: string;
  host: string;
  mode?: string;
  hostFaction?: string;
  enemyFaction?: string;
  mapId?: string;
  ageSec: number;
  /** P2P only: round-trip time to the host, ms. Undefined while still being measured. */
  pingMs?: number;
  /** Public game list (P2P): custom or auto game name, open / full / in-game status, host country code, creation time. */
  name?: string;
  status?: 'open' | 'full' | 'live';
  country?: string;
  createdAt?: number;
  quick?: boolean;
}

type Handler = (msg: any) => void;

/** Resolve relay endpoints. `?relay=host:port` overrides; otherwise same-origin (/ws proxied by vite). */
export function relayEndpoints(): { ws: string; http: string } {
  const params = new URLSearchParams(location.search);
  const override = params.get('relay');
  // ?relay= is honoured on local/LAN hosts only, so a crafted public link can't point players at someone else's relay
  const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/.test(location.hostname) || location.hostname.endsWith('.local');
  if (override && local) {
    const clean = override.replace(/^(wss?|https?):\/\//, '').replace(/\/+$/, '');
    const secure = /^(wss|https):/.test(override) || (location.protocol === 'https:' && !/^(ws|http):/.test(override));
    return { ws: `${secure ? 'wss' : 'ws'}://${clean}/ws`, http: `${secure ? 'https' : 'http'}://${clean}` };
  }
  const secure = location.protocol === 'https:';
  return { ws: `${secure ? 'wss' : 'ws'}://${location.host}/ws`, http: '' };
}

export async function fetchRooms(): Promise<RoomInfo[]> {
  try {
    const { http } = relayEndpoints();
    const res = await fetch(`${http}/api/rooms`, { cache: 'no-store' });
    if (!res.ok) return [];
    return (await res.json()) as RoomInfo[];
  } catch {
    return [];
  }
}

/** Common surface of the relay-based NetClient and the serverless P2PClient. */
export interface NetTransport {
  connected: boolean;
  name: string;
  on(fn: Handler): () => void;
  connect(): Promise<void>;
  send(msg: any): void;
  relay(d: any): void;
  host(config: Partial<MatchConfig>): void;
  join(code: string): void;
  quick(config?: Partial<MatchConfig>): void;
  start(): void;
  leave(): void;
  close(): void;
}

export class NetClient implements NetTransport {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  public connected = false;
  public name = 'Commander';

  public on(fn: Handler): () => void {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  public connect(): Promise<void> {
    if (this.ws && this.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(relayEndpoints().ws);
      this.ws = ws;
      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          try { ws.close(); } catch {}
          reject(new Error('Multiplayer server not reachable. Start it with: bun run relay'));
        }
      }, 4000);
      ws.onopen = () => {
        this.connected = true;
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          resolve();
        }
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          reject(new Error('Multiplayer server not reachable. Start it with: bun run relay'));
        }
      };
      ws.onclose = () => {
        this.connected = false;
        this.handlers.forEach(h => h({ t: 'disconnected' }));
      };
      ws.onmessage = ev => {
        let msg: any;
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        this.handlers.forEach(h => h(msg));
      };
    });
  }

  public send(msg: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ name: this.name, ...msg }));
    }
  }

  /** Send a game message to the other peer through the relay. */
  public relay(d: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: 'relay', d }));
    }
  }

  public host(config: Partial<MatchConfig>) {
    this.send({ t: 'host', config });
  }
  public join(code: string) {
    this.send({ t: 'join', code });
  }
  public quick(_config?: Partial<MatchConfig>) {
    this.send({ t: 'quick' });
  }
  public start() {
    this.send({ t: 'start' });
  }
  public leave() {
    this.send({ t: 'leave' });
  }

  public close() {
    this.handlers.clear();
    try { this.ws?.close(); } catch {}
    this.ws = null;
    this.connected = false;
  }
}
