/**
 * Sector Vanguard multiplayer relay.
 *
 * A tiny Bun WebSocket server that pairs a host with a guest using a short room code,
 * lists open games for "Find Game", and forwards game messages between the two peers.
 * The host's browser runs the authoritative simulation; this server only relays.
 *
 *   bun server/relay.ts            (default port 8787, override with PORT=...)
 */

interface Room {
  code: string;
  hostName: string;
  config: any;
  host: Peer;
  guest: Peer | null;
  started: boolean;
  createdAt: number;
  /** Host's game version: guests on another version are turned away (different builds desync). */
  version: unknown;
}

interface Peer {
  ws: any;
  name: string;
  room: Room | null;
  role: 'host' | 'guest' | null;
  ip: string;
  winStart: number;
  winCount: number;
}

import { TOOL_VERSIONS } from '../src/version';
import { versionMismatchError } from '../src/net/versionCheck';

const PORT = Number(process.env.PORT || 8787);
const rooms = new Map<string, Room>();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

// Limits (abuse protection: the relay has no auth)
const MAX_MSG_BYTES = 64 * 1024;       // per WebSocket message
const MAX_MSGS_PER_SEC = 120;          // per connection (game traffic is ~20-30/s)
const MAX_ROOMS = 500;
const MAX_ROOMS_PER_IP = 3;
const MAX_CONNS_PER_IP = 8;
const IDLE_ROOM_MS = 3 * 60 * 60 * 1000; // safety net for started rooms whose host vanished

const rnd = (n: number) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]! % n; };  // unbiased enough for 24 letters

function makeCode(): string {
  // 5 letters from a CSPRNG (24^5 = 8M codes) so room codes can't be guessed
  for (let attempt = 0; attempt < 50; attempt++) {
    let c = '';
    for (let i = 0; i < 5; i++) c += ALPHABET[rnd(ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
}

// Presence: every open game page heartbeats {id, mode} every ~20 s; a player counts while their last beat is under PRESENCE_TTL_MS old.
const PRESENCE_TTL_MS = 50_000;
const MAX_PRESENCE = 50_000;
const presence = new Map<string, { mode: 'single' | 'multi'; at: number }>();
function playerCounts() {
  const cut = Date.now() - PRESENCE_TTL_MS;
  let single = 0, multi = 0;
  for (const [id, p] of presence) {
    if (p.at < cut) { presence.delete(id); continue; }
    if (p.mode === 'multi') multi++; else single++;
  }
  return { total: single + multi, single, multi, at: Date.now() };
}

const connsByIp = new Map<string, number>();
const roomsOfIp = (ip: string) => [...rooms.values()].filter(r => r.host.ip === ip).length;

function send(peer: Peer | null, msg: any) {
  if (!peer) return;
  try {
    peer.ws.send(JSON.stringify(msg));
  } catch {}
}

function closeRoom(room: Room, notifyLeaver: Peer | null) {
  rooms.delete(room.code);
  for (const p of [room.host, room.guest]) {
    if (!p) continue;
    p.room = null;
    p.role = null;
    if (p !== notifyLeaver) send(p, { t: 'peer_left' });
  }
}

function leave(peer: Peer) {
  const room = peer.room;
  if (!room) return;
  if (peer.role === 'host') {
    closeRoom(room, peer);
  } else {
    room.guest = null;
    room.started = false;
    peer.room = null;
    peer.role = null;
    send(room.host, { t: 'guest_left' });
  }
}

function listRooms() {
  return [...rooms.values()]
    .filter(r => !r.guest && !r.started)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 30)
    .map(r => ({
      code: r.code,
      host: r.hostName,
      mode: r.config?.mode,
      hostFaction: r.config?.playerFaction,
      enemyFaction: r.config?.enemyFaction,
      mapId: r.config?.mapId,
      version: typeof r.version === 'string' ? r.version : undefined,
      ageSec: Math.round((Date.now() - r.createdAt) / 1000)
    }));
}

function joinRoom(peer: Peer, room: Room, name: string) {
  room.guest = peer;
  peer.room = room;
  peer.role = 'guest';
  peer.name = name;
  send(peer, { t: 'joined', code: room.code, hostName: room.hostName, config: room.config });
  send(room.host, { t: 'guest_joined', name });
}

const server = Bun.serve({
  port: PORT,
  hostname: '0.0.0.0',
  fetch(req, srv) {
    const url = new URL(req.url);
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (url.pathname === '/ws') {
      const ip = srv.requestIP(req)?.address || 'unknown';
      if ((connsByIp.get(ip) || 0) >= MAX_CONNS_PER_IP) return new Response('Too many connections', { status: 429 });
      if (srv.upgrade(req, { data: { peer: null, ip } })) return;
      return new Response('Upgrade failed', { status: 400 });
    }
    if (url.pathname === '/api/rooms') {
      return new Response(JSON.stringify(listRooms()), {
        headers: { 'content-type': 'application/json', ...cors }
      });
    }
    if (url.pathname === '/api/players') {
      return new Response(JSON.stringify(playerCounts()), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors } });
    }
    if (url.pathname === '/api/presence') {
      if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'content-type' } });
      if (req.method !== 'POST') return new Response('POST only', { status: 405, headers: cors });
      return req.text().then(raw => {
        if (raw.length > 256) return new Response('too big', { status: 413, headers: cors });
        let m: any; try { m = JSON.parse(raw); } catch { return new Response('bad json', { status: 400, headers: cors }); }
        const id = String(m?.id ?? '').replace(/[^\w-]/g, '').slice(0, 40);
        if (id.length < 8) return new Response('bad id', { status: 400, headers: cors });
        if (m.mode === 'single' || m.mode === 'multi') {
          if (!presence.has(id) && presence.size >= MAX_PRESENCE) return new Response('full', { status: 503, headers: cors });
          presence.set(id, { mode: m.mode, at: Date.now() });
        } else presence.delete(id);
        return new Response('ok', { headers: cors });
      });
    }
    if (url.pathname === '/api/health') {
      return new Response('ok', { headers: { ...cors, 'X-OpenSlop-Server-Version': TOOL_VERSIONS.server } });
    }
    return new Response(`OpenSlop II Server v${TOOL_VERSIONS.server}`, { headers: cors });
  },
  websocket: {
    maxPayloadLength: MAX_MSG_BYTES,
    idleTimeout: 120,
    open(ws: any) {
      const ip: string = ws.data.ip;
      connsByIp.set(ip, (connsByIp.get(ip) || 0) + 1);
      ws.data.peer = { ws, name: 'Commander', room: null, role: null, ip, winStart: Date.now(), winCount: 0 } as Peer;
    },
    message(ws: any, raw: string | Buffer) {
      const peer: Peer = ws.data.peer;
      const nowMs = Date.now();
      if (nowMs - peer.winStart >= 1000) { peer.winStart = nowMs; peer.winCount = 0; }
      if (++peer.winCount > MAX_MSGS_PER_SEC) { if (peer.winCount > MAX_MSGS_PER_SEC * 3) ws.close(1008, 'rate limit'); return; }
      let msg: any;
      try {
        msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      const name = String(msg.name || peer.name || 'Commander').replace(/[^\p{L}\p{N} _.\-]/gu, '').slice(0, 20) || 'Commander';

      switch (msg.t) {
        case 'host': {
          leave(peer);
          if (rooms.size >= MAX_ROOMS || roomsOfIp(peer.ip) >= MAX_ROOMS_PER_IP) return send(peer, { t: 'error', error: 'Too many open games, try again later' });
          if (JSON.stringify(msg.config ?? {}).length > 4096) return;
          const room: Room = {
            code: makeCode(),
            hostName: name,
            config: msg.config || {},
            host: peer,
            guest: null,
            started: false,
            createdAt: Date.now(),
            version: msg.v
          };
          peer.name = name;
          peer.room = room;
          peer.role = 'host';
          rooms.set(room.code, room);
          send(peer, { t: 'hosted', code: room.code });
          break;
        }
        case 'config': {
          const room = peer.room;
          if (room && peer.role === 'host') {
            if (JSON.stringify(msg.config ?? {}).length > 4096) break;
            room.config = msg.config || room.config;
            send(room.guest, { t: 'config', config: room.config });
          }
          break;
        }
        case 'join': {
          const code = String(msg.code || '').toUpperCase().trim().slice(0, 12);
          const room = rooms.get(code);
          if (!room) return send(peer, { t: 'error', error: `No game found with code ${code}` });
          if (room.guest || room.started) return send(peer, { t: 'error', error: 'That game is already full' });
          const bad = versionMismatchError(room.version, 'host', msg.v);
          if (bad) return send(peer, { t: 'error', error: bad });
          leave(peer);
          joinRoom(peer, room, name);
          break;
        }
        case 'quick': {
          const open = [...rooms.values()].filter(r => !r.guest && !r.started && r.host !== peer && r.version === msg.v);
          const room = open.sort((a, b) => a.createdAt - b.createdAt)[0];
          if (!room) return send(peer, { t: 'no_rooms' });
          leave(peer);
          joinRoom(peer, room, name);
          break;
        }
        case 'start': {
          const room = peer.room;
          if (room && peer.role === 'host' && room.guest) {
            room.started = true;
            send(room.host, { t: 'start' });
            send(room.guest, { t: 'start' });
          }
          break;
        }
        case 'leave':
          leave(peer);
          break;
        case 'relay': {
          const room = peer.room;
          if (!room) return;
          const target = peer.role === 'host' ? room.guest : room.host;
          send(target, msg.d);
          break;
        }
        case 'ping':
          send(peer, { t: 'pong', ts: msg.ts });
          break;
      }
    },
    close(ws: any) {
      const ip: string = ws.data.ip;
      const n = (connsByIp.get(ip) || 1) - 1;
      if (n <= 0) connsByIp.delete(ip); else connsByIp.set(ip, n);
      const peer: Peer = ws.data.peer;
      if (peer) leave(peer);
    }
  }
});

// Drop abandoned, never-started rooms after 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) {
    if (!r.started && now - r.createdAt > 30 * 60 * 1000) closeRoom(r, null);
    else if (now - r.createdAt > IDLE_ROOM_MS) closeRoom(r, null);
  }
}, 60_000);

console.log(`[relay] OpenSlop II Server v${TOOL_VERSIONS.server} (multiplayer relay) listening on :${server.port}`);
