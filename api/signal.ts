/**
 * Our own WebRTC handshake broker (Vercel Function, Web-standard handlers), used instead of the free PeerJS broker
 * whenever Upstash Redis is configured. Browsers only swap a few small connection messages here; game data never does.
 *
 *   GET  /api/signal                                   -> { v: 1 } when usable, 503 without Upstash
 *   POST { op: 'claim', id? }                          -> { id, token }   (409 unavailable-id: someone holds that id)
 *   POST { op: 'poll', id, token }                     -> { msgs: [...] } (410: the claim expired; claim again)
 *   POST { op: 'send', id, token, to, msg }            -> { ok }          (404 peer-unavailable)
 *   POST { op: 'release', id, token }                  -> { ok }
 *
 * Ids look like PeerJS ids ("svg-ABCD" for a room, random for everyone else). The client is src/net/SignalPeer.ts.
 */
import { getSignalStore, PEER_TTL_SEC } from './_lib/signalStore.js'; // Vercel runs the functions as native ESM: relative imports need the .js extension
import { json, ip, newToken } from './_lib/http.js';

const ID_RE = /^[A-Za-z0-9_-]{3,40}$/;
const MAX_MSG = 16_000;
const NO_STORE = { 'cache-control': 'no-store' };

export async function GET(_req: Request) {
  return getSignalStore() ? json({ v: 1, ttl: PEER_TTL_SEC }, 200, NO_STORE) : json({ error: 'storage_not_configured' }, 503, NO_STORE);
}

export async function POST(req: Request) {
  const store = getSignalStore();
  if (!store) return json({ error: 'storage_not_configured' }, 503, NO_STORE);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400, NO_STORE); }
  if (!body || typeof body !== 'object') return json({ error: 'bad_body' }, 400, NO_STORE);
  const op = String(body.op || '');
  const token = String(body.token || '');

  try {
    if (op === 'claim') {
      // Light abuse guard on the only call that creates anything: 30 claims / 10 s / IP
      if ((await store.hit(`c:${ip(req)}`, 10)) > 30) return json({ error: 'rate_limited' }, 429, { ...NO_STORE, 'retry-after': '10' });
      const id = body.id == null ? `p${newToken().slice(0, 14)}` : String(body.id);
      if (!ID_RE.test(id)) return json({ error: 'bad_id' }, 400, NO_STORE);
      const t = newToken();
      if (!(await store.claim(id, t))) return json({ error: 'unavailable-id' }, 409, NO_STORE);
      return json({ id, token: t, ttl: PEER_TTL_SEC }, 200, NO_STORE);
    }

    const id = String(body.id || '');
    if (!ID_RE.test(id) || !token) return json({ error: 'bad_id' }, 400, NO_STORE);

    if (op === 'poll') {
      const msgs = await store.poll(id, token);
      if (!msgs) return json({ error: 'lost' }, 410, NO_STORE);
      return json({ msgs: msgs.map(m => { try { return JSON.parse(m); } catch { return null; } }).filter(Boolean) }, 200, NO_STORE);
    }
    if (op === 'send') {
      const to = String(body.to || '');
      if (!ID_RE.test(to)) return json({ error: 'bad_to' }, 400, NO_STORE);
      if (!body.msg || typeof body.msg !== 'object') return json({ error: 'bad_msg' }, 400, NO_STORE);
      const msg = JSON.stringify({ ...body.msg, from: id });
      if (msg.length > MAX_MSG) return json({ error: 'too_big' }, 413, NO_STORE);
      const r = await store.send(id, token, to, msg);
      if (r === 'forbidden') return json({ error: 'lost' }, 410, NO_STORE);
      if (r === 'unavailable') return json({ error: 'peer-unavailable' }, 404, NO_STORE);
      return json({ ok: true }, 200, NO_STORE);
    }
    if (op === 'release') {
      await store.release(id, token);
      return json({ ok: true }, 200, NO_STORE);
    }
    return json({ error: 'bad_op' }, 400, NO_STORE);
  } catch {
    return json({ error: 'storage_error' }, 503, NO_STORE);
  }
}
