/**
 * Public game list for OpenSlop II (Vercel Function, Web-standard handlers).
 *
 *   GET    /api/rooms          -> { v: 2, rooms: [...] }   open / full / in-game public rooms, newest first
 *   POST   /api/rooms          -> create or heartbeat a room (body: room fields; header x-room-token once created)
 *   POST   /api/rooms {op:'delete'} / DELETE ?code=XXXX    -> remove it (token required)
 *
 * Only lobby metadata lives here. Game traffic stays peer-to-peer (WebRTC via PeerJS); the host's browser is still the server.
 * Without storage configured (no Upstash env on Vercel) every call answers 503 and the client falls back to its slot scan.
 */
import { getStore, ROOM_TTL_SEC, type RoomRecord, type RoomStatus } from './_lib/store.js';
import { json, ip, newToken, tokenOk } from './_lib/http.js'; // Vercel runs the functions as native ESM: relative imports need the .js extension

const cleanText = (v: unknown, max: number, fallback = '') =>
  String(v ?? '').replace(/[^\p{L}\p{N} _.\-'!]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max) || fallback;
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed as readonly string[]).includes(String(v)) ? (v as T) : fallback;

const FACTIONS = ['terran', 'zerg', 'protoss'] as const;
const MODES = ['multiplayer_pvp', 'multiplayer_coop'] as const;
const STATUSES = ['open', 'full', 'live'] as const;

const publicView = (r: RoomRecord, now: number) => ({
  code: r.code, name: r.name, host: r.host, mode: r.mode, hostFaction: r.hostFaction, enemyFaction: r.enemyFaction,
  mapId: r.mapId, status: r.status, quick: r.quick, country: r.country, createdAt: r.createdAt,
  ageSec: Math.max(0, Math.round((now - r.createdAt) / 1000))
});

export async function GET(_req: Request) {
  const store = getStore();
  if (!store) return json({ error: 'storage_not_configured' }, 503, { 'cache-control': 'no-store' });
  try {
    const now = Date.now();
    const rooms = (await store.list(now)).map(r => publicView(r, now));
    // Edge-cache for 2s: any number of viewers costs at most one storage read every couple of seconds
    return json({ v: 2, ttl: ROOM_TTL_SEC, rooms }, 200, { 'cache-control': 'public, s-maxage=2, stale-while-revalidate=5' });
  } catch {
    return json({ error: 'storage_error' }, 503, { 'cache-control': 'no-store' });
  }
}

async function remove(req: Request, code: string, token: string) {
  const store = getStore();
  if (!store) return json({ error: 'storage_not_configured' }, 503);
  const cur = await store.get(code);
  if (!cur) return json({ ok: true });
  if (!tokenOk(cur.token, token)) return json({ error: 'forbidden' }, 403);
  await store.del(code);
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const code = (url.searchParams.get('code') || '').toUpperCase();
    if (!/^[A-Z]{4,5}$/.test(code)) return json({ error: 'bad_code' }, 400);
    return await remove(req, code, req.headers.get('x-room-token') || '');
  } catch {
    return json({ error: 'storage_error' }, 503);
  }
}

export async function POST(req: Request) {
  const store = getStore();
  if (!store) return json({ error: 'storage_not_configured' }, 503);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'bad_body' }, 400);

  const code = String(body.code || '').toUpperCase();
  if (!/^[A-Z]{4,5}$/.test(code)) return json({ error: 'bad_code' }, 400);
  const token = String(body.token || req.headers.get('x-room-token') || '');

  try {
    // Light abuse guard: 40 writes / 10s / IP (a host heartbeats once per 10s)
    if ((await store.hit(`w:${ip(req)}`, 10)) > 40) return json({ error: 'rate_limited' }, 429, { 'retry-after': '10' });

    if (body.op === 'delete') return await remove(req, code, token);

    const now = Date.now();
    const cur = await store.get(code);
    if (cur && !tokenOk(cur.token, token)) return json({ error: 'code_taken' }, 409); // someone else's live room
    const mode = pick(body.mode, MODES, 'multiplayer_pvp');
    const host = cleanText(body.host, 20, 'Commander');
    const rec: RoomRecord = {
      code,
      name: cleanText(body.name, 24, `${host}'s game`),
      host,
      mode,
      hostFaction: pick(body.hostFaction, FACTIONS, 'terran'),
      enemyFaction: pick(body.enemyFaction, FACTIONS, 'zerg'),
      mapId: typeof body.mapId === 'string' && /^[a-z0-9_]{1,40}$/.test(body.mapId) ? body.mapId : 'sector_vanguard',
      status: pick<RoomStatus>(body.status, STATUSES, 'open'),
      quick: !!body.quick,
      country: /^[A-Z]{2}$/.test(req.headers.get('x-vercel-ip-country') || '') ? req.headers.get('x-vercel-ip-country')! : undefined,
      createdAt: cur?.createdAt ?? now,
      beatAt: now,
      token: cur?.token ?? newToken()
    };
    await store.put(rec);
    return json({ ok: true, token: rec.token, ttl: ROOM_TTL_SEC, createdAt: rec.createdAt });
  } catch {
    return json({ error: 'storage_error' }, 503);
  }
}
