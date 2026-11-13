/**
 * Local stand-in for the Vercel /api/rooms, /api/signal and /api/turn functions (in-memory store), so the public game list can be tried with
 * `?p2p=1` on localhost without `vercel dev`. Listens where the relay normally does (8787), so run it INSTEAD of the relay:
 *   bun server/dev-api.ts        (then open http://localhost:5173/?p2p=1 in two browsers)
 */
import { GET, POST, DELETE } from '../api/rooms';
import { GET as turnGET } from '../api/turn';
import { GET as signalGET, POST as signalPOST } from '../api/signal';
import { GET as playersGET } from '../api/players';
import { POST as presencePOST, OPTIONS as presenceOPTIONS } from '../api/presence';

const port = Number(process.env.PORT || 8787);
Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/api/turn' && req.method === 'GET') return turnGET(req); // reads TURN_* / CLOUDFLARE_TURN_* from .env
    if (url.pathname === '/api/signal') return req.method === 'POST' ? signalPOST(req) : signalGET(req); // our own WebRTC handshake broker
    if (url.pathname === '/api/players') return playersGET(req); // title screen "playing now" counts
    if (url.pathname === '/api/presence') return req.method === 'POST' ? presencePOST(req) : presenceOPTIONS();
    if (url.pathname !== '/api/rooms') return new Response('not found', { status: 404 });
    if (req.method === 'GET') return GET(req);
    if (req.method === 'POST') return POST(req);
    if (req.method === 'DELETE') return DELETE(req);
    return new Response('method not allowed', { status: 405 });
  }
});
console.log(`dev /api/rooms + /api/signal on http://localhost:${port}`);
