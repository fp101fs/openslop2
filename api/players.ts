/**
 * Live "playing now" totals for the title screen (Vercel Function), same answer as the relay's /api/players.
 *   GET -> { total, single, multi, at }   (503 without Upstash: the title screen then hides the row instead of showing a guess)
 */
import { getPresenceStore } from './_lib/presenceStore.js';
import { json } from './_lib/http.js';

const HEADERS = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };

export async function GET(_req: Request) {
  const store = getPresenceStore();
  if (!store) return json({ error: 'storage_not_configured' }, 503, HEADERS);
  try {
    const { single, multi } = await store.counts();
    return json({ total: single + multi, single, multi, at: Date.now() }, 200, HEADERS);
  } catch (e) {
    console.error('[players]', e);
    return json({ error: 'storage_error' }, 503, HEADERS);
  }
}
