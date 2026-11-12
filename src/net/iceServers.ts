import { ICE_SERVERS, STUN_SERVERS, PUBLIC_TURN_SERVERS } from './p2pConfig';

/**
 * WebRTC ICE servers for P2P matches. Our own TURN relay comes from `/api/turn` (a Vercel function that mints short-lived
 * credentials, see api/turn.ts) and is tried before the free public relay. The list is fetched in the background when the
 * multiplayer client starts; until it arrives, or if the API isn't configured, the built-in list is used.
 */
const TIMEOUT_MS = 3000;
/** Refetch before the server's 24 h credentials run out. */
const MAX_AGE_MS = 6 * 3600 * 1000;

let own: RTCIceServer[] | null = null;
let fetchedAt = 0;
let inflight: Promise<void> | null = null;

/** Start (or refresh) the background fetch. Safe to call often. */
export function prefetchIceServers(): Promise<void> {
  if (inflight) return inflight;
  if (own && Date.now() - fetchedAt < MAX_AGE_MS) return Promise.resolve();
  inflight = (async () => {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      const res = await fetch('/api/turn', { cache: 'no-store', signal: ctl.signal });
      clearTimeout(timer);
      if (!res.ok) return;
      const body = (await res.json()) as { iceServers?: unknown };
      const list = Array.isArray(body.iceServers) ? body.iceServers.filter(isIceServer) : [];
      if (list.length) { own = list; fetchedAt = Date.now(); }
    } catch {
      // no API (local dev, static host) or offline: the built-in list stays
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function isIceServer(s: any): s is RTCIceServer {
  const okUrl = (u: unknown) => typeof u === 'string' && /^(stun|turns?):/.test(u);
  return !!s && (okUrl(s.urls) || (Array.isArray(s.urls) && s.urls.length > 0 && s.urls.every(okUrl)));
}

/** Current list: STUN, then our TURN (when available), then the public TURN fallback. */
export function iceServers(): RTCIceServer[] {
  return own ? [...STUN_SERVERS, ...own, ...PUBLIC_TURN_SERVERS] : ICE_SERVERS;
}

/** True once our own TURN relay is configured and loaded (for the lobby's connection hint). */
export function hasOwnTurn(): boolean {
  return !!own;
}
