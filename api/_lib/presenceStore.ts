/**
 * "Playing now" counts for the title screen (api/presence.ts, api/players.ts), same rules as the relay (server/relay.ts):
 * every tab in a match heartbeats {id, mode} every ~20 s and counts while its last beat is under PRESENCE_TTL_MS old.
 * Upstash Redis on Vercel (two sorted sets, member = tab id, score = last beat in ms; one Lua script per request), an in-memory
 * Map for local dev. Without either the endpoints answer 503 and the title screen hides the row: counts are never made up.
 */
import { Redis } from '@upstash/redis';
import { redisEnv, isLocalDev } from './store.js';

export const PRESENCE_TTL_MS = 50_000;
export const MAX_PRESENCE = 50_000;

export type PresenceMode = 'single' | 'multi';
export interface Counts { single: number; multi: number }

export interface PresenceStore {
  /** Record a heartbeat (mode) or the tab leaving its match (null). False when the store is full. */
  beat(id: string, mode: PresenceMode | null): Promise<boolean>;
  counts(): Promise<Counts>;
}

const KS = 'sc:pres:single', KM = 'sc:pres:multi';

// KEYS: single, multi, the set to add to (or ''); ARGV: id, now, cut-off, cap
const BEAT = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[3])
redis.call('ZREM', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
if KEYS[3] == '' then return 1 end
if redis.call('ZCARD', KEYS[1]) + redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[4]) then return 0 end
redis.call('ZADD', KEYS[3], ARGV[2], ARGV[1])
redis.call('PEXPIRE', KEYS[3], ARGV[5])
return 1`;
const COUNT = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[1])
return { redis.call('ZCARD', KEYS[1]), redis.call('ZCARD', KEYS[2]) }`;

class RedisPresenceStore implements PresenceStore {
  private s;
  constructor(r: Redis) { this.s = { beat: r.createScript<number>(BEAT), count: r.createScript<number[]>(COUNT) }; }
  async beat(id: string, mode: PresenceMode | null) {
    const now = Date.now();
    const key = mode === 'single' ? KS : mode === 'multi' ? KM : '';
    return Number(await this.s.beat.exec([KS, KM, key], [id, String(now), String(now - PRESENCE_TTL_MS), String(MAX_PRESENCE), String(PRESENCE_TTL_MS * 2)])) === 1;
  }
  async counts() {
    const r = await this.s.count.exec([KS, KM], [String(Date.now() - PRESENCE_TTL_MS)]);
    return { single: Number(r?.[0]) || 0, multi: Number(r?.[1]) || 0 };
  }
}

/** Local dev / tests. */
export class MemoryPresenceStore implements PresenceStore {
  private m = new Map<string, { mode: PresenceMode; at: number }>();
  private prune() { const cut = Date.now() - PRESENCE_TTL_MS; for (const [id, p] of this.m) if (p.at < cut) this.m.delete(id); }
  async beat(id: string, mode: PresenceMode | null) {
    this.prune();
    if (!mode) { this.m.delete(id); return true; }
    if (!this.m.has(id) && this.m.size >= MAX_PRESENCE) return false;
    this.m.set(id, { mode, at: Date.now() });
    return true;
  }
  async counts() {
    this.prune();
    let single = 0, multi = 0;
    for (const p of this.m.values()) if (p.mode === 'multi') multi++; else single++;
    return { single, multi };
  }
}

let cached: PresenceStore | null | undefined;
export function getPresenceStore(): PresenceStore | null {
  if (cached !== undefined) return cached;
  const env = redisEnv();
  if (env) cached = new RedisPresenceStore(new Redis(env));
  else if (isLocalDev()) cached = new MemoryPresenceStore();
  else cached = null;
  return cached;
}
