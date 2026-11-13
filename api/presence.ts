/**
 * "Playing now" heartbeat (Vercel Function), same contract as the relay's /api/presence. The client is src/net/Presence.ts.
 *   POST text/plain { id, mode: 'single' | 'multi' | 'off' } -> 'ok'   (503 without Upstash)
 */
import { getPresenceStore } from './_lib/presenceStore.js';
import { ip } from './_lib/http.js';
import { getSignalStore } from './_lib/signalStore.js';

const CORS = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
const text = (body: string, status = 200) => new Response(body, { status, headers: CORS });

export async function OPTIONS() {
  return new Response(null, { headers: { ...CORS, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' } });
}

export async function POST(req: Request) {
  const store = getPresenceStore();
  if (!store) return text('storage_not_configured', 503);
  const raw = await req.text();
  if (raw.length > 256) return text('too big', 413);
  let m: any;
  try { m = JSON.parse(raw); } catch { return text('bad json', 400); }
  const id = String(m?.id ?? '').replace(/[^\w-]/g, '').slice(0, 40);
  if (id.length < 8) return text('bad id', 400);
  try {
    // light abuse guard: a tab beats every 20 s, so 60 beats / minute / IP is plenty for a household or LAN party
    const rl = getSignalStore();
    if (rl && (await rl.hit(`pres:${ip(req)}`, 60)) > 60) return text('rate_limited', 429);
    const ok = await store.beat(id, m.mode === 'single' || m.mode === 'multi' ? m.mode : null);
    return ok ? text('ok') : text('full', 503);
  } catch (e) {
    console.error('[presence]', e);
    return text('storage_error', 503);
  }
}
