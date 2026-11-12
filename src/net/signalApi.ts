/**
 * Client for our own handshake broker (`/api/signal`, see api/signal.ts). Whether it is usable is checked once per page:
 * a deployment with Upstash answers, one without (or a local relay) doesn't, and the game then keeps the PeerJS broker.
 */

const ENDPOINT = '/api/signal';
const TIMEOUT_MS = 3000;

let state: 'unknown' | 'up' | 'down' = 'unknown';
let probing: Promise<boolean> | null = null;

export interface SignalReply { status: number; data: any }

/** POST one op. Network failures come back as status 0. */
export async function signalCall(body: Record<string, unknown>, keepalive = false): Promise<SignalReply> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST', cache: 'no-store', keepalive, signal: ctl.signal,
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    let data: any = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

export const signalApi = {
  /** Resolve (once) whether this deployment has its own handshake broker. `?signal=0` forces PeerJS. */
  available(): Promise<boolean> {
    if (state !== 'unknown') return Promise.resolve(state === 'up');
    const force = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('signal') : null;
    if (force === '0') { state = 'down'; return Promise.resolve(false); }
    if (!probing) {
      probing = (async () => {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
        try {
          const res = await fetch(ENDPOINT, { cache: 'no-store', signal: ctl.signal });
          const data = res.ok ? await res.json() : null;
          state = data?.v === 1 ? 'up' : 'down';
        } catch {
          state = 'down';
        } finally {
          clearTimeout(timer);
          probing = null;
        }
        return state === 'up';
      })();
    }
    return probing;
  },
  /** Known-good right now (sync; call available() first). */
  usable(): boolean { return state === 'up'; },
  /** The broker failed: new peers use PeerJS for the rest of this page. */
  markDown() { state = 'down'; }
};
