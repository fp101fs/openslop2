/**
 * Storage for the public game list. Two interchangeable backends behind one tiny interface:
 *  - Upstash Redis (Vercel Marketplace; env KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN). Every entry carries a TTL,
 *    so a host that crashes or closes the tab drops off the list by itself.
 *  - an in-memory Map, for local development only (it is not shared between serverless instances, so it is never used on Vercel).
 */
import { Redis } from '@upstash/redis';

export const ROOM_TTL_SEC = 35; // hosts heartbeat every ~10s
export const MAX_ROOMS = 100;

export type RoomStatus = 'open' | 'full' | 'live';
export interface RoomRecord {
  code: string;
  name: string;
  host: string;
  mode: 'multiplayer_pvp' | 'multiplayer_coop';
  hostFaction: string;
  enemyFaction: string;
  mapId: string;
  status: RoomStatus;
  quick: boolean;
  country?: string;
  createdAt: number;
  beatAt: number;
  /** Secret handed to the host on creation; required to update or delete the entry. Never returned by the list. */
  token: string;
}

export interface Store {
  list(now: number): Promise<RoomRecord[]>;
  get(code: string): Promise<RoomRecord | null>;
  put(rec: RoomRecord): Promise<void>;
  del(code: string): Promise<void>;
  /** Fixed-window counter: returns the count after this hit. */
  hit(key: string, windowSec: number): Promise<number>;
}

const ZKEY = 'sc:rooms';
const rkey = (code: string) => `sc:room:${code}`;

class RedisStore implements Store {
  constructor(private r: Redis) {}

  async list(now: number): Promise<RoomRecord[]> {
    await this.r.zremrangebyscore(ZKEY, 0, now - ROOM_TTL_SEC * 1000);
    const codes = (await this.r.zrange(ZKEY, 0, MAX_ROOMS - 1, { rev: true })) as string[];
    if (!codes.length) return [];
    const vals = await this.r.mget<(RoomRecord | null)[]>(...codes.map(rkey));
    const out: RoomRecord[] = [];
    const dead: string[] = [];
    vals.forEach((v, i) => { if (v && typeof v === 'object') out.push(v); else dead.push(codes[i]!); });
    if (dead.length) void this.r.zrem(ZKEY, ...dead).catch(() => {});
    return out;
  }
  async get(code: string) {
    const v = await this.r.get<RoomRecord>(rkey(code));
    return v && typeof v === 'object' ? v : null;
  }
  async put(rec: RoomRecord) {
    const p = this.r.pipeline();
    p.set(rkey(rec.code), rec, { ex: ROOM_TTL_SEC });
    p.zadd(ZKEY, { score: rec.beatAt, member: rec.code });
    await p.exec();
  }
  async del(code: string) {
    const p = this.r.pipeline();
    p.del(rkey(code));
    p.zrem(ZKEY, code);
    await p.exec();
  }
  async hit(key: string, windowSec: number) {
    const k = `sc:rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
    const p = this.r.pipeline();
    p.incr(k);
    p.expire(k, windowSec * 2);
    const res = await p.exec<[number, number]>();
    return Number(res[0]) || 0;
  }
}

class MemoryStore implements Store {
  private rooms = new Map<string, RoomRecord>();
  private hits = new Map<string, number>();
  async list(now: number) {
    for (const [c, r] of this.rooms) if (now - r.beatAt > ROOM_TTL_SEC * 1000) this.rooms.delete(c);
    return [...this.rooms.values()].sort((a, b) => b.beatAt - a.beatAt).slice(0, MAX_ROOMS);
  }
  async get(code: string) { return this.rooms.get(code) ?? null; }
  async put(rec: RoomRecord) { this.rooms.set(rec.code, rec); }
  async del(code: string) { this.rooms.delete(code); }
  async hit(key: string, windowSec: number) {
    const k = `${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
    const n = (this.hits.get(k) ?? 0) + 1;
    this.hits.set(k, n);
    if (this.hits.size > 5000) this.hits.clear();
    return n;
  }
}

/** Upstash REST credentials from the environment (the Vercel Marketplace sets KV_*, a manual setup UPSTASH_*), or null. */
export function redisEnv(): { url: string; token: string } | null {
  const env = process.env;
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

/** True outside Vercel (local dev), where an in-memory store stands in for Redis. */
export const isLocalDev = () => !process.env.VERCEL && !process.env.VERCEL_ENV;

let cached: Store | null | undefined;

/** The configured store, or null when this deployment has no storage (the game then falls back to its slot scan). */
export function getStore(): Store | null {
  if (cached !== undefined) return cached;
  const env = redisEnv();
  if (env) cached = new RedisStore(new Redis(env));
  else if (isLocalDev()) cached = new MemoryStore(); // local dev only
  else cached = null;
  return cached;
}
