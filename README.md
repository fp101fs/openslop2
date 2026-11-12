# OpenSlop II

An open-source, browser-based 3D RTS inspired by **StarCraft II**, built from the ground up.
Engineered to take **full advantage of Apple Silicon M1 (Metal GPU & ARM64 CPU)** on macOS while being **100% portable to Windows** (DirectX 12 / Vulkan) without code changes.

> OpenSlop II is an unofficial fan project. StarCraft is a trademark of Blizzard Entertainment; OpenSlop II is not affiliated with or endorsed by Blizzard.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffp101fs%2Fopenslop2&project-name=openslop2&repository-name=openslop2) &nbsp;**Your own OpenSlop II server, free, in one click** (*or* deploy [WITH game list](#-deploy-your-own-server-one-click-vercel))

### Message from the Meat Proxy

OpenSlop2 is..
- **a work in progress** (unfinished), so cut me (and my robot overlord) some slack please (especially for unfinished parts / game inaccuracies). if something's broken/missing or if you wanna contribute, just [tell me](https://github.com/fp101fs/openslop2/issues). I'm hoping someone(s) willing to fork this and run with it (yes, the fork.. yes, in their hand) / fill in the gaps. until then I'll maintain it as long as folks are interested in playing OpenSlop2
- **vibe-coded by me because I wanted to play sc2 in my browser** (also my macbook never has enough free disk space to install actual sc2, so I wanted a way to play sc2 without the disk bloat lol [for reals] (also I can't afford the 50 clams to buy actual sc2).. anyway, when i realized OpenSlop2 was feasible for my own personal play, I realized you Terrans might wanna play too. so here I am in my Bunker writing this now
- **not built for commercial use.** I made this for funsies
- **free and open source** (*) (*BUT you must be fully aware that most of the unit/structure 3D models in the game were built by actual human 3D artists we found with our own eyeballs on sites like Sketchfab [ex: Catholomew]). so tl;dr - don't make money off of the 3D models in OpenSlop2 or distribute them without proper attribution - that would go against the human 3D artists' licenses. check each 3D model's individual license before use in your own project. we have an Attributions page just for that!
- **yours.** the full OpenSlop2 source code is on github. i'm even including instructions on how to add game features with just 1 Claude prompt, how to fill in missing stuff, build new Missions, new maps, etc. use it as a starting point to do what you please with, like a boilerplate for an entirely new game or your own Campaign / storyline
- **modular, customizable and full of cool stuff** (like the OpenSlop2 Mission Builder) for you to build your own missions, maps, etc (maps are .slopmap, missions are .openslop2mission). easy to add on-to, mod, bla bla - just tell Claude / other agent what you wanna do with OpenSlop2
- **playable for free, offline and online!** single / multi player (campaign, skirmish, 1v1 online matches)
- **fully playable on any device** (single/multi player, campaign/skirmish, all units, structures & upgrades) - Desktop, Tablet, and Mobile (play-tested on M1 Macbook Air 16GB, Pixel 8, and M1 iPad Air). also available as standalone desktop app (actual Mac .app or Windows app)

### Names

| Name | What it is |
|------|------------|
| **OpenSlop II** | The project as a whole |
| **OpenSlop II Web** | The game in a browser (hosted or run locally); the main build |
| **OpenSlop II Desktop** | Standalone app for macOS (and later Windows) |
| **OpenSlop II Server** | Self-hosted node for lobbies and the TURN relay (`/api/rooms`, `/api/turn`) |
| **OpenSlop II Mission Builder** | Editor for `.openslop2mission` files (`bun run mission-builder`) |
| **OpenSlop II Voice Studio** | Text-to-speech tool for unit voice lines (`tools/voice-studio`) |

### Public repo

[openslop2](https://github.com/fp101fs/openslop2) is the public repo. Development happens in a private repo, and `tools/publish-public.sh` copies the current files there as one new commit (private history never goes public).

### Versioning

Every app has its own [semver](https://semver.org) version, kept in [`src/version.ts`](./src/version.ts). They stay below 1.0 until features and file formats settle: the minor number goes up for new features or breaking changes, the patch number for fixes.

| Part | Version | Where it shows |
|------|---------|----------------|
| **OpenSlop II Web** (the game) | 0.6.0 | Credits screen, browser console, `package.json` |
| **OpenSlop II Mission Builder** | 0.1.0 | Builder header |
| **OpenSlop II Server** (relay) | 0.1.0 | Startup log, `GET /` and the `X-OpenSlop-Server-Version` header on `/api/health` |
| **OpenSlop II Voice Studio** (TTS) | 0.1.0 | Studio header, `tools/voice-studio/package.json` |

File formats use a plain integer that goes up only when older files can no longer load as they are: `.openslop2mission` v1, save games v1, `.slopmap` v1. `src/version.test.ts` fails if any of these numbers drift out of sync with `package.json` or the file readers. There is no map editor yet, so it has no version.

---

## 🚀 Quick Start

### Get the code
You need [Bun](https://bun.sh) (or Node.js with npm) and git.
```bash
git clone https://github.com/fp101fs/openslop2.git
cd openslop2
```
The download is about 460 MB, mostly 3D models. The launchers below run `bun install` on first start; with `bun run dev`, run `bun install` yourself first.

### On macOS (Apple Silicon M1 MacBook Air / Pro / Mac mini / Studio):
Simply run the included launcher:
```bash
./play.sh
```
*This starts the high-performance local server and launches Google Chrome or Brave in standalone dedicated app mode with hardware-accelerated Apple Silicon Metal GPU flags (`--use-angle=metal`, `--enable-zero-copy`).*

Alternatively, run with Bun or NPM:
```bash
bun install   # first time only
bun run dev
# or
npm run dev
```
Then open `http://localhost:5173` in your browser.

---

### On Windows:
Double-click or run:
```cmd
play.bat
```
*This launches the game in standalone app mode using Microsoft Edge or Google Chrome powered by the Windows DirectX 12 ANGLE backend.*

### 🌐 Deploying to Any Web Server (Zero Backend Required):
Because 100% of models, textures, shaders, sound effects, music, and AI run client-side in the browser, you can host the game on any static web server (Vercel, Cloudflare Pages, Netlify, GitHub Pages, S3, or Nginx):
```bash
npm run build
```
Upload the generated `dist/` folder to your web host and anyone on the web can play immediately in their browser.

### 🚀 Deploy your own server (one click, Vercel)

**Simple (default):** nothing to set up.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffp101fs%2Fopenslop2&project-name=openslop2&repository-name=openslop2)

Sign in to Vercel (it copies this repo into your GitHub account) and click **Deploy**. About a minute later you get a URL like `openslop2-xyz.vercel.app`; share it and play online. Online play uses the free PeerJS handshake server, and public games are found by the slot scan (up to 4 at a time).

**With game list (Upstash):** adds the full public game list and our own handshake server.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffp101fs%2Fopenslop2&project-name=openslop2&repository-name=openslop2&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22upstash%22%2C%22productSlug%22%3A%22upstash-kv%22%7D%5D&skippable-integrations=1)

Same steps, but when Vercel offers **Upstash for Redis**, accept the free plan. Vercel fills in its env vars (`KV_REST_API_URL` / `KV_REST_API_TOKEN`) for you. You can also add Upstash later to a simple deploy: Vercel dashboard -> project -> Storage -> Upstash Redis -> connect, then redeploy.

TURN is optional for both (see [`server/turn/README.md`](server/turn/README.md)).

---

## 🧩 Main 3D model sources

Most of the models in the game are other people's work. In the order we found them:

1. **Catholomew on Sketchfab** - the bulk of the units and structures (CC BY-NC 4.0): the animated Zerg and Protoss units, the Hatchery, Spawning Pool, Infestation Pit, Hive and more.
2. **Oyvindtk on Thingiverse** (https://www.thingiverse.com/oyvindtk) - 3D-print STLs of Zerg structures (CC BY 4.0), converted to GLB with `tools/model/build-zerg-stl.ts`. Their Hydralisk Den and Sunken Colony were used first, then replaced by the Hive Workshop versions below.
3. **Renn01 on Hive Workshop (Protoss pack too)** (https://www.hiveworkshop.com/members/renn01.300853/) - the textured "Zerg Building Pack (Starcraft 2)" (fan port of Blizzard artwork), converted with `tools/model/build-zerg-mdx.ts`. It supplies the Roach Warren, Hydralisk Den, Spine Crawler and Extractor, plus Baneling Nest, Evolution Chamber, Lurker Den, Nydus Network, Queen's Nest, Spire, Greater Spire and Ultralisk Cavern, stored as ready-to-use GLBs in `public/models/` (the game has no such structures yet).

Renn01's "Protoss Building Pack (Starcraft 2)" is also converted (`PACK=protoss bun tools/model/build-zerg-mdx.ts ...`): `pylon`, `photon_cannon`, `shield_battery`, `assimilator`, `forge`, `cybernetics_core`, `twilight_council`, `stargate`, `robotics_facility`, `robotics_bay`, `templar_archives`, `dark_shrine` and `fleet_beacon` as standalone GLBs in `public/models/` (the Nexus and Gateway keep their Sketchfab models). Effect-only layers (warp planes, lightning, glows) are dropped.

Every model is listed with its author and licence in the in-game credits (`src/credits/modelCredits.json`, regenerated by `python3 tools/model/credits.py`).

---

## ⚡ Starting a game

There is no loading screen: the title menu paints instantly from plain HTML while the game loads behind it. Pressing Play opens a small **Starting game** modal with a 10-second countdown (a comms beep each second); Play lights up as soon as the match is ready, Cancel backs out, and past 10 s it shows "Loading… 87%". Shaders warm up in small chunks (while you sit on the menu on desktop, during the countdown on iPads and phones), so units never hitch the first time they appear. The title screen shows live counts of players in single player and multiplayer games.

---

## 📖 Full guide

Everything else (features, campaign, Mission Builder, multiplayer, AI, models, tools) is in [docs/GUIDE.md](docs/GUIDE.md).
