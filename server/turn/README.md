# TURN relay for online matches

Most players connect browser-to-browser directly. Some can't (strict NAT, some mobile carriers, corporate firewalls). For
them WebRTC relays the game through a **TURN** server.

Vercel can't run a TURN server: TURN needs long-lived UDP/TCP sockets, and Vercel functions only answer short HTTP
requests. What the Vercel deployment does instead is **`/api/turn`** (`api/turn.ts`). It hands each player short-lived
credentials for a TURN service, so no secret ships in the game's JavaScript. The client fetches them in the background
(`src/net/iceServers.ts`) and tries them before the free public relay. If nothing is configured, nothing changes: the game
keeps its built-in servers.

Pick **one** option and set its environment variables in the Vercel project (Settings → Environment Variables), then redeploy.

## Option 1: Cloudflare Realtime TURN (recommended, nothing to run)

1. In the Cloudflare dashboard, open **Realtime → TURN Server** and create a TURN key.
2. Set these in Vercel:
   - `CLOUDFLARE_TURN_KEY_ID`: the key's ID
   - `CLOUDFLARE_TURN_API_TOKEN`: the key's API token

Cloudflare's free tier covers far more relay traffic than a 1v1 RTS needs. Lockstep sends only orders, a few hundred bytes a second.

## Option 2: your own coturn server

Any small VPS works (1 vCPU is plenty). Open UDP/TCP 3478, TCP 5349 (TLS) and UDP 49152–65535.

```sh
sudo apt install coturn
```

`/etc/turnserver.conf`:

```
listening-port=3478
tls-listening-port=5349
fingerprint
use-auth-secret
static-auth-secret=CHANGE_ME_LONG_RANDOM_STRING
realm=openslop2
# TLS (Let's Encrypt): needed for turns: URLs
cert=/etc/letsencrypt/live/turn.example.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.example.com/privkey.pem
# don't relay into private networks
no-multicast-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
total-quota=200
```

Start it with `sudo systemctl enable --now coturn`, then set these in Vercel:

- `TURN_URLS`: `turn:turn.example.com:3478,turns:turn.example.com:5349`
- `TURN_SECRET`: the same value as `static-auth-secret`

`/api/turn` then issues coturn's standard time-limited REST credentials (valid 24 h).

## Option 3: fixed credentials from a provider

For services that give you a plain username and password (for example Metered):
`TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`.

## Checking it

- `https://<your-project>.vercel.app/api/turn` returns `{ "iceServers": [...] }` when configured, or 503 when not.
- Locally: put the variables in `.env` and run `bun server/dev-api.ts` (it serves `/api/turn` and `/api/rooms`).
- In a match, `chrome://webrtc-internals` shows a `relay` candidate pair when the TURN path is in use.
