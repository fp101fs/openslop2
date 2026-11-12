/**
 * TURN credentials for WebRTC (Vercel Function, Web-standard handler).
 *
 *   GET /api/turn  ->  { iceServers: RTCIceServer[], ttl }   or 503 { error: 'turn_not_configured' }
 *
 * A Vercel function can't BE a TURN server (TURN needs long-lived UDP/TCP sockets), but it can hand out short-lived logins
 * for one, so no secret ships in the game's JavaScript. Players only use TURN when a direct browser-to-browser connection
 * fails (strict NAT, some mobile carriers); game traffic is still peer to peer otherwise.
 *
 * Configure ONE of these in the Vercel project's environment variables:
 *
 *  1. Cloudflare Realtime TURN (free tier, nothing to run):
 *       CLOUDFLARE_TURN_KEY_ID, CLOUDFLARE_TURN_API_TOKEN
 *  2. Your own coturn server with `use-auth-secret` (see server/turn/README.md):
 *       TURN_URLS="turn:turn.example.com:3478,turns:turn.example.com:5349"  TURN_SECRET=...
 *  3. Fixed credentials from any provider (e.g. Metered):
 *       TURN_URLS=...  TURN_USERNAME=...  TURN_CREDENTIAL=...
 *
 * Without any, the client keeps its built-in public fallback servers (src/net/iceServers.ts).
 */

const TTL_SEC = 24 * 3600;
/** Edge-cache the answer for an hour: at most one credential mint per hour per region, and every login stays valid for 23+ more. */
const CACHE = 'public, s-maxage=3600, stale-while-revalidate=600';

type IceServer = { urls: string | string[]; username?: string; credential?: string };

function json(body: unknown, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache } });
}

const list = (v: string | undefined) => (v ?? '').split(',').map(s => s.trim()).filter(Boolean);

async function cloudflare(keyId: string, token: string): Promise<IceServer[]> {
  const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl: TTL_SEC })
  });
  if (!res.ok) throw new Error(`cloudflare ${res.status}`);
  const body = (await res.json()) as { iceServers?: IceServer | IceServer[] };
  const servers = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
  if (!servers.length) throw new Error('cloudflare: no ice servers');
  return servers;
}

/** coturn REST-API credentials: username "<expiry>:openslop2", password = base64(HMAC-SHA1(secret, username)). */
async function coturn(urls: string[], secret: string): Promise<IceServer[]> {
  const username = `${Math.floor(Date.now() / 1000) + TTL_SEC}:openslop2`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(username)));
  return [{ urls, username, credential: btoa(String.fromCharCode(...sig)) }];
}

export async function GET(_req: Request) {
  const env = process.env;
  try {
    let servers: IceServer[] | null = null;
    if (env.CLOUDFLARE_TURN_KEY_ID && env.CLOUDFLARE_TURN_API_TOKEN) servers = await cloudflare(env.CLOUDFLARE_TURN_KEY_ID, env.CLOUDFLARE_TURN_API_TOKEN);
    else if (list(env.TURN_URLS).length && env.TURN_SECRET) servers = await coturn(list(env.TURN_URLS), env.TURN_SECRET);
    else if (list(env.TURN_URLS).length && env.TURN_USERNAME && env.TURN_CREDENTIAL) servers = [{ urls: list(env.TURN_URLS), username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }];
    if (!servers) return json({ error: 'turn_not_configured' }, 503);
    return json({ iceServers: servers, ttl: TTL_SEC }, 200, CACHE);
  } catch {
    return json({ error: 'turn_unavailable' }, 503);
  }
}
