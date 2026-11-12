/**
 * Storage for the WebRTC handshake (api/signal.ts): who owns which peer id, and a short-lived inbox per peer.
 * Same two backends as the game list (store.ts): Upstash Redis on Vercel, an in-memory Map for local dev.
 * Every Redis operation is one Lua script, so each request costs a single Upstash command and is atomic.
 */
import { Redis } from '@upstash/redis';
import { redisEnv, isLocalDev } from './store.js';

/** A peer id is held this long without a poll (clients poll every 0.4-5 s). */
export const PEER_TTL_SEC = 30;
/** Unread handshake messages expire after this. */
export const INBOX_TTL_SEC = 60;
/** Inbox length cap (a handshake needs 1-2 messages). */
export const INBOX_MAX = 32;

export interface SignalStore {
  /** Take `id` for `token`. False when someone else holds it. */
  claim(id: string, token: string): Promise<boolean>;
  /** Refresh the claim and drain the inbox. Null when `token` no longer owns `id`. */
  poll(id: string, token: string): Promise<string[] | null>;
  /** Deliver `msg` from `from` (proven by `token`) to `to`. 'forbidden' = bad sender, 'unavailable' = no such peer. */
  send(from: string, token: string, to: string, msg: string): Promise<'ok' | 'forbidden' | 'unavailable'>;
  /** Give the id back (only its owner can). */
  release(id: string, token: string): Promise<void>;
  /** Fixed-window counter: returns the count after this hit. */
  hit(key: string, windowSec: number): Promise<number>;
}

const pkey = (id: string) => `sc:sig:p:${id}`;
const ikey = (id: string) => `sc:sig:i:${id}`;

const CLAIM = `return redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2]) and 1 or 0`;
const POLL = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return false end
redis.call('EXPIRE', KEYS[1], ARGV[2])
local m = redis.call('LRANGE', KEYS[2], 0, -1)
redis.call('DEL', KEYS[2])
return m`;
const SEND = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return -1 end
if redis.call('EXISTS', KEYS[2]) == 0 then return 0 end
redis.call('RPUSH', KEYS[3], ARGV[2])
redis.call('LTRIM', KEYS[3], 0 - tonumber(ARGV[3]), -1)
redis.call('EXPIRE', KEYS[3], ARGV[4])
return 1`;
const RELEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('DEL', KEYS[1], KEYS[2]) end
return 1`;
const HIT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n`;

class RedisSignalStore implements SignalStore {
  private s;
  constructor(r: Redis) {
    this.s = { claim: r.createScript<number>(CLAIM), poll: r.createScript<string[] | null>(POLL), send: r.createScript<number>(SEND), release: r.createScript<number>(RELEASE), hit: r.createScript<number>(HIT) };
  }
  async claim(id: string, token: string) {
    return Number(await this.s.claim.exec([pkey(id)], [token, String(PEER_TTL_SEC)])) === 1;
  }
  async poll(id: string, token: string) {
    const m = await this.s.poll.exec([pkey(id), ikey(id)], [token, String(PEER_TTL_SEC)]);
    return Array.isArray(m) ? m.map(String) : null;
  }
  async send(from: string, token: string, to: string, msg: string) {
    const n = Number(await this.s.send.exec([pkey(from), pkey(to), ikey(to)], [token, msg, String(INBOX_MAX), String(INBOX_TTL_SEC)]));
    return n === 1 ? 'ok' : n === 0 ? 'unavailable' : 'forbidden';
  }
  async release(id: string, token: string) {
    await this.s.release.exec([pkey(id), ikey(id)], [token]);
  }
  async hit(key: string, windowSec: number) {
    return Number(await this.s.hit.exec([`sc:sig:rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`], [String(windowSec * 2)])) || 0;
  }
}

/** Local dev / tests. */
export class MemorySignalStore implements SignalStore {
  private peers = new Map<string, { token: string; exp: number }>();
  private inbox = new Map<string, { msgs: string[]; exp: number }>();
  private hits = new Map<string, number>();
  private owner(id: string) {
    const p = this.peers.get(id);
    if (p && p.exp < Date.now()) { this.peers.delete(id); this.inbox.delete(id); return null; }
    return p ?? null;
  }
  async claim(id: string, token: string) {
    if (this.owner(id)) return false;
    this.peers.set(id, { token, exp: Date.now() + PEER_TTL_SEC * 1000 });
    return true;
  }
  async poll(id: string, token: string) {
    const p = this.owner(id);
    if (!p || p.token !== token) return null;
    p.exp = Date.now() + PEER_TTL_SEC * 1000;
    const box = this.inbox.get(id);
    this.inbox.delete(id);
    return box && box.exp >= Date.now() ? box.msgs : [];
  }
  async send(from: string, token: string, to: string, msg: string) {
    if (this.owner(from)?.token !== token) return 'forbidden' as const;
    if (!this.owner(to)) return 'unavailable' as const;
    const box = this.inbox.get(to) ?? { msgs: [], exp: 0 };
    box.msgs.push(msg);
    box.msgs = box.msgs.slice(-INBOX_MAX);
    box.exp = Date.now() + INBOX_TTL_SEC * 1000;
    this.inbox.set(to, box);
    return 'ok' as const;
  }
  async release(id: string, token: string) {
    if (this.owner(id)?.token === token) { this.peers.delete(id); this.inbox.delete(id); }
  }
  async hit(key: string, windowSec: number) {
    const k = `${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
    const n = (this.hits.get(k) ?? 0) + 1;
    this.hits.set(k, n);
    if (this.hits.size > 5000) this.hits.clear();
    return n;
  }
}

let cached: SignalStore | null | undefined;

/** The configured store, or null when this deployment has no Upstash (clients then use the PeerJS broker). */
export function getSignalStore(): SignalStore | null {
  if (cached !== undefined) return cached;
  const env = redisEnv();
  // raw strings back: handshake messages are JSON text and must not be auto-parsed
  if (env) cached = new RedisSignalStore(new Redis({ ...env, automaticDeserialization: false }));
  else if (isLocalDev()) cached = new MemorySignalStore();
  else cached = null;
  return cached;
}

/** Tests: swap the store. */
export function setSignalStore(s: SignalStore | null) { cached = s; }
