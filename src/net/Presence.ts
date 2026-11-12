/**
 * "Playing now" heartbeat: while a match is running this tab tells the server (relay `/api/presence`) whether it is single or multi player,
 * every 20 s and once more when it stops or the page closes. The landing page reads the totals from `/api/players`.
 * Set VITE_PRESENCE_URL to point at a relay hosted elsewhere; the default is same-origin (vite proxies /api to the relay).
 */
export type PresenceMode = 'single' | 'multi' | null;

const BASE: string = (import.meta as any).env?.VITE_PRESENCE_URL ?? '';

function tabId(): string {
  try {
    let id = sessionStorage.getItem('sc2_presence_id');
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('sc2_presence_id', id); }
    return id;
  } catch { return crypto.randomUUID(); }
}

export function startPresence(getMode: () => PresenceMode) {
  const id = tabId();
  let last: PresenceMode = null;
  const send = (mode: PresenceMode) => {
    const body = JSON.stringify({ id, mode: mode ?? 'off' });
    try {
      // text/plain keeps it a "simple" request (no CORS preflight) and works with sendBeacon
      if (navigator.sendBeacon?.(`${BASE}/api/presence`, new Blob([body], { type: 'text/plain' }))) return;
      void fetch(`${BASE}/api/presence`, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => {});
    } catch { /* offline: the server forgets us after 50 s */ }
  };
  const tick = () => {
    const m = getMode();
    if (m || last) send(m);
    last = m;
  };
  setInterval(tick, 20_000);
  setTimeout(tick, 2_000);
  addEventListener('pagehide', () => { if (last) send(null); });
}
