# OpenSlop II

An open-source, browser-based 3D RTS inspired by **StarCraft II**, built from the ground up.
Engineered to take **full advantage of Apple Silicon M1 (Metal GPU & ARM64 CPU)** on macOS while being **100% portable to Windows** (DirectX 12 / Vulkan) without code changes.

> OpenSlop II is an unofficial fan project. StarCraft is a trademark of Blizzard Entertainment; OpenSlop II is not affiliated with or endorsed by Blizzard.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffp101fs%2Fopenslop2&project-name=openslop2&repository-name=openslop2&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22upstash%22%2C%22productSlug%22%3A%22upstash-kv%22%7D%5D&skippable-integrations=1)

One click gives you your own online server with a public URL (see [Deploy your own server](#-deploy-your-own-server-one-click-vercel)).

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
| **OpenSlop II Web** (the game) | 0.5.0 | Credits screen, browser console, `package.json` |
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

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffp101fs%2Fopenslop2&project-name=openslop2&repository-name=openslop2&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22upstash%22%2C%22productSlug%22%3A%22upstash-kv%22%7D%5D&skippable-integrations=1)

1. Click the button and sign in to Vercel (it copies this repo into your GitHub account).
2. When it offers **Upstash for Redis**, accept the free plan. That gives you the public game list and our own handshake server. You can also skip it: online play still works, using the slot scan and the free PeerJS server.
3. Click **Deploy**. About a minute later you get a URL like `openslop2-xyz.vercel.app`; share it and play online.

No env vars to type: Vercel fills in the Upstash ones (`KV_REST_API_URL` / `KV_REST_API_TOKEN`). TURN is optional (see [`server/turn/README.md`](server/turn/README.md)). The button copies the public [openslop2](https://github.com/fp101fs/openslop2) repo into your GitHub account.

---

## 🧩 Main 3D model sources

Most of the models in the game are other people's work. In the order we found them:

1. **Catholomew on Sketchfab** - the bulk of the units and structures (CC BY-NC 4.0): the animated Zerg and Protoss units, the Hatchery, Spawning Pool, Infestation Pit, Hive and more.
2. **Oyvindtk on Thingiverse** (https://www.thingiverse.com/oyvindtk) - 3D-print STLs of Zerg structures (CC BY 4.0), converted to GLB with `tools/model/build-zerg-stl.ts`. Their Hydralisk Den and Sunken Colony were used first, then replaced by the Hive Workshop versions below.
3. **Renn01 on Hive Workshop (Protoss pack too)** (https://www.hiveworkshop.com/members/renn01.300853/) - the textured "Zerg Building Pack (Starcraft 2)" (fan port of Blizzard artwork), converted with `tools/model/build-zerg-mdx.ts`. It supplies the Roach Warren, Hydralisk Den, Spine Crawler and Extractor, plus Baneling Nest, Evolution Chamber, Lurker Den, Nydus Network, Queen's Nest, Spire, Greater Spire and Ultralisk Cavern, stored as ready-to-use GLBs in `public/models/` (the game has no such structures yet).

Renn01's "Protoss Building Pack (Starcraft 2)" is also converted (`PACK=protoss bun tools/model/build-zerg-mdx.ts ...`): `pylon`, `photon_cannon`, `shield_battery`, `assimilator`, `forge`, `cybernetics_core`, `twilight_council`, `stargate`, `robotics_facility`, `robotics_bay`, `templar_archives`, `dark_shrine` and `fleet_beacon` as standalone GLBs in `public/models/` (the Nexus and Gateway keep their Sketchfab models). Effect-only layers (warp planes, lightning, glows) are dropped.

Every model is listed with its author and licence in the in-game credits (`src/credits/modelCredits.json`, regenerated by `python3 tools/model/credits.py`).

## 🎬 Opening Semi-Cinematic Recon Scene (StarFox Comms + Aliens Tribute)

When the mission begins, an in-engine **semi-cinematic intro** ([`IntroCutscene.ts`](./src/ui/IntroCutscene.ts)) plays automatically using the game's native 3rd-person view mechanics:
1. **Banshee Swoop Flight**: `Banshee-1` (the only free starting unit in the game: it exists just in the original "Outlands Frontier" mission; no other match gives either side a starting flyer) flies in from mid-map towards the Command Center along a long S-curve with simultaneous left/right and up/down swoops. The camera starts in the **cockpit (first-person)**, glides smoothly out to the **chase (third-person) view** ~5 s in (`Renderer.tpsBlend`), keeps swooping, then switches to the RTS view on arrival.
2. **Top-Left Vertical StarFox Pilot Comms Card (Below Minerals/Gas/Supply)**: Styled as a vertical-oriented comms card positioned at `top: 52px; left: 16px` directly below the Minerals / Gas / Supply counters in the far top-left corner (`#starfox-comms-overlay`) so the center of the screen and Wraith fighter remain 100% unobstructed. Features CRT scanlines, an 8-bar audio waveform equalizer, and a live 60 FPS animated 2D canvas portrait of **Lt. Vance (`LT. VANCE "HAWK"`)** whose jaw/mouth articulates in real time as he speaks:
   - *"Command, Banshee-1 inbound! Bringing her in low and fast. Hold on to your lunch!"*
3. **Approach to Command Center & *Aliens* Tribute**: The Banshee banks smoothly toward the Command Center and decelerates into a controlled approach while delivering iconic *Aliens*-inspired radio lines (*"We're in the pipe, five by five... Movement all over the grid—it's a bug hunt, Commander. Stay frosty!"*).
4. **Perimeter Station & Seamless Transition to RTS View + Mission Objective Bubble**: The Banshee settles several squares away from the Command Center at `(30.5, 30.5)`, pivots to face the far southeast corner of the map (`(95, 95)`), and seamlessly glides from 3rd-person view into normal overhead RTS view via `exitFpsMode()` (or press `Space` / `Escape` anytime to skip straight to RTS view). Once in RTS view, the **mission objectives** list (`#mission-objective-widget`) fades in at the top left, just below the timer and system buttons, showing `"Destroy the Enemy Zerg Base in the Far Southeast"` with the number of enemy structures remaining.

---

## 🎛️ Minimal vs. Standard UI Mode (1-Click Toggle)

Both the bottom **Current Unit Info Panel** (`#selection-panel`) and the top bar **Music Controls** (`#top-music-badge` in [`UIManager.ts`](./src/ui/UIManager.ts)) support **Minimal View (default)** and **Standard View** via the 1-click switch button (`▲ Standard` / `▼ Minimal`):
- **Minimal View (Default)**:
  - **Bottom Unit Info Bar**: Compact `46px` pill bar that keeps the center of the screen open and unobstructed in both **3rd-Person View** and **RTS View**. Displays unit icon, name, live HP bar, compact subsystem health summary badge (`⚙️ Sys: 100%` or lowest damaged component), missile/production pill, and the `▲ Standard` 1-click toggle button.
  - **Top Bar Music Note Icon Button (`🎵`)**: Displays a compact `🎵` music note icon button in the top bar (with hover tooltip showing the active track & volume %) that opens the Music & Game Options screen on click instead of taking up top-bar width with the full track title.
- **Standard View**:
  - **Bottom Unit Info Panel**: Full `180px` panel showing the large unit portrait, HP/energy bars, damage/speed stats, production queue slots, and the complete **IL-2 Subsystem Component Status** grid (`Engine`, `Wings`, `Tracks`, etc.), plus the `▼ Minimal` 1-click toggle button.
  - **Top Bar Music Badge**: Displays the full `🎵 Track Title (Volume %)` badge in the top bar.

---

## 🟩 SC2-style selection bar

The bottom-middle panel (`sc2Bar` in `UIManager.ts`, art in `src/ui/SelectionBar.ts`) replaces the old minimal / standard unit panels (the music badge toggle is unchanged):
- **Single unit**: green outline of the real 3D model (health tinted green / yellow / red) with `HP / max`, name, Kills, Rank, weapon and armor upgrade boxes, attributes, and a colour portrait on the right. **Kills** are tracked: the unit that lands the killing blow is credited (basic attacks, splash such as Siege Tank shock cannons, Mutalisk bounces, structure fire, and ability damage like Psionic Storm, Feedback, Steady Targeting and Nukes, which credit the caster, including delayed hits). Rank is still a placeholder.
- **Structures**: training unit, progress bar and a five-slot queue (click a slot to cancel); construction and upgrades show their own progress. A structure researching an upgrade (Forge, Engineering Bay, Evolution Chamber, Twilight Council...) shows "Researching <name>", its icon (click to cancel, full refund), a progress bar and the seconds left; the command card button switches to its countdown as soon as the research starts.
- **Many units**: 8-per-row icon grid (12 when over 24); click selects one, shift-click removes, ctrl-click selects all of that type. Control-group tabs and row tags are shown.
- Race colours: Terran black / green, Protoss navy / blue, Zerg dark purple. Phones hide the portrait and shrink the icons.

## 🧩 Full LotV roster
- **Now buildable:** Reaper (Q) and Ghost (G) at the Barracks, Hellbat (E) at the Factory, and Liberator (N), Raven (V) and Battlecruiser (C) at the Starport. Observer, Warp Prism and Disruptor come from the Robotics Facility, Phoenix and Oracle from the Stargate, the Mothership from the Nexus, and the Infestor from larva.
- **Tech rules:** the Ghost needs a Ghost Academy and a Tech Lab, the Battlecruiser a Fusion Core and a Tech Lab, the Raven a Tech Lab, the Hellbat an Armory, the Disruptor a Robotics Bay, the Mothership a Fleet Beacon (one at a time), and the Infestor an Infestation Pit.
- **New Terran structures:** Fusion Core, Ghost Academy and Sensor Tower.
- **Names:** Protoss units and structures use their plain SC2 names (Nexus, Forge, Stargate, Zealot); the old "Solaris" prefix is gone.
- **Mechanics:** the Observer (like the Dark Templar) is permanently cloaked (no energy, never drops its cloak) and detects within 11. The Infestor's Fungal Growth deals 30 damage over 2.85s and roots enemies in place.
- **Simplified:** the Warp Prism has no transport or power field, and the Disruptor's nova is a long-cooldown splash shot. The Oracle's beam is always on, the Phoenix has no Graviton Beam, the Mothership has no Cloaking Field or Recall, and the Sensor Tower has no radar. The computer opponents don't build these units yet.
- **Models:** all ten have their own textured models from Renn01's Hive Workshop packs (Protoss Unit Pack, Zerg Unit Pack Remastered, Terran Building Pack; fan ports of Blizzard artwork), converted with `tools/model/build-zerg-mdx.ts` (static, no animation). The converter takes `PACK=protoss_units|zerg_units|terran_buildings` for the credit link and `SKIP=<regex>` to drop materials by texture name; the Terran buildings drop the `terranbuild` construction scaffold, the Mothership its flare and the Infestor its burrow decal (`SKIP='terranbuild|fx-flare|burrow'`). The pack's units face +X, so their rigs use `yaw: -Math.PI / 2`. The Engineering Bay and Refinery now use the same pack's model too (`models/engineering_bay_sc2.glb`, 2.9 tiles; the old one stays in `models/engineering_bay.glb`). The Sentry (`models/sentry.glb`), Zerg Egg (`models/egg.glb`) and Supply Depot (`models/supply_depot_sc2.glb`) also use the packs' models now, replacing code-built / hand-built ones. The depot model is static, so lowering sinks it into the ground (`DEPOT_SINK` in `RiggedAnimator.ts`); it is converted with `GROUND=keep` so its lower body stays underground, and the rig sets `keepGround: true`. The old animated depot is still in `models/supply_depot_animated.glb`. The Armory keeps its textured PBR model.

## 🖼️ SC2 button icons
- Units, buildings, abilities and research use SVG button icons in the command card, info panel, queues and selection bar. The basic commands (Move, Stop, Hold, Patrol, Attack, Gather, Build, Repair) and mode buttons do too.
- Most entries are covered. The rest keep their emoji: Egg, Orbital Command (building and upgrade), Rocks, Overlord pod, Inject Larva, Guardian Shield and five Nova abilities.
- Weapon and armor levels 2 and 3 reuse the level 1 icon.
- The icons are SVGs (`public/icons/btn-<name>.svg`). The top bar (settings, sound / mute, minerals, vespene, supply) and the touch Home and Groups buttons use bare SVG icons from `public/ui/hud/` with no button frame. The mapping lives in `src/ui/IconImages.ts`. To check that every mapped icon has an SVG, run `bun tools/fetch-icons.ts`.

## 🎬 Campaign hub and in-game menu

- Pedestal figures are live 3D renders playing their idle animation with a gentle sway (one shared offscreen WebGL renderer copies each frame into a canvas per figure, `liveFigure` in `UnitHero.ts`); a static render shows until the live one is ready, and the loop stops when you leave the hub.
- Pedestal figures face the camera; per-figure size (`z`) and drop onto the pedestal (`dy`) live in `HUB_FIG` in `MainMenu.ts`. The Marine, Archon and Nova are sized to the same on-screen height. Each figure is framed on its idle clip's first frame (not a random frame), so its size is the same on every load. Hover is pixel-accurate (alpha test on the rendered figure), so only the model itself lights up.
- Nova has her own model (`models/nova.glb`, "female specops"). Its one clip is a T-pose frame plus a walk, so `subclips` in `RiggedModels.ts` cuts a `walk` (one 1.4 s step cycle) and a `stand`. The stand holds the legs straight and planted (the first frame) and takes the upper body from a short slice of the walk at a third of its motion, slowed and played forward then back. Tune it with `gain` and `slow`.
- The Ghost model ships without a weapon mesh, so a sniper rifle GLB is attached to its hand bone (`gunOn` / `gunUrl` in `RiggedModels.ts`); `gunYaw`, `gunPitch`, `gunShift` and `gunFlip` aim it and seat it in the hands.
- The in-game MENU is a centred card on phones and tablets, two columns on short landscape screens.

## 📜 Campaign research: WoL Mission 1 "Liberation Day"

Detailed research for each real campaign mission lives in `docs/campaign/<campaign>/<NN>-<mission-name>/README.md`, with its reference maps in an `img/` folder beside it. The first one is **[docs/campaign/wol/01-liberation-day/README.md](docs/campaign/wol/01-liberation-day/README.md)**. It draws on Liquipedia, the StarCraft Wiki, two GameFAQs walkthroughs, GamePressure and a timed playthrough on Hard. The dialogue in it is paraphrased.

- **Mission:** Raynor and 5 Marines attack the Dominion Logistics HQ in Backwater Station on Mar Sara. Raynor must survive. The bonus objective is to destroy 6 Dominion Holoboards. There is no base, income or reward.
- **Route** (every point has an x/y position on the Liquipedia map): drop-off on the south road → first enemies at the south-east corner → north up the east road (Holoboard 1) → into the town square, where 3 drop pods bring 9 Marines → cross the square to its south-west corner → north up the west side to the civilian camp (cutscene, transport, 61 freed civilians who throw molotovs) → north-east road → HQ compound with a Mengsk statue; Vikings land to guard the HQ.
- **Enemies by difficulty:** on Normal, 2 / 1 / 9 / 2 Marines, then 4 Marines and a transport at the camp, then 5 Marines and 2 Vikings at the HQ. Brutal adds a Firebat, a third Viking and +1 infantry upgrades. On Casual enemies have half HP.
- **Timeline:** every dialogue line and event is timed from a 3:28 Hard run (first contact 0:28, bonus objective about 0:43, drop pods about 1:22, camp cutscene 2:05, HQ compound 2:45).
- **Not known:** trigger distances, map size in tiles, exact hero stats. The doc ends with a list of gaps between the real mission and our version.

### Liberation Day, rebuilt from the research
The mission is now one data file, `src/campaign/campaigns/wol/missions/liberation_day.openslop2mission`, edited in the Mission Builder (below).
- **Map:** the snake route on a 144-tile map traced over the Liquipedia image. The town basin, the camp area and the west corridor sit on tier 1; the south and east roads run in a paved trench; the HQ compound is raised. It also has the west chasm and pond (blue-violet `marsara` theme), a scorched crater, the causeway and the north-west road. Props: Browder's gas station, 3 graffiti signs, the battlecruiser billboard, the "drill deep" sign, the RESTRICTED camp gate and the Mengsk statue (procedural stand-ins in `src/levels/CampaignProps.ts`).
- **Roads:** cracked asphalt with a worn dashed centre line, flat red-brown dirt verges on both sides, then the cliffs. The look is the theme's `roadStyle: 'asphalt'` (only `marsara` uses it, so other maps keep their stone roads): `src/graphics/RoadSurface.ts` bakes the road lines into a texture (distance from the centre line, road height, dash phase) that the terrain shader reads. A road's new `shoulder` setting (also in the Mission Builder) flattens a verge that wide on each side of the paving; verges stop square at the road ends so they don't cut into a ramp that continues the road. A roadside civilian now stands ahead of the start for the "I wouldn't go up that road" line.
- **Enemies** at their research positions with counts per difficulty, plus per-difficulty enemy upgrades (Casual half HP, Hard armour +1, Brutal armour and weapons +1).
- **6 holoboards** (new `holoboard` structure). Each plays a Mengsk line when you come near and counts toward the bonus objective.
- **Story beats:** 3 drop pods with 9 Marines at the square (with an autosave there). The camp cutscene has letterbox bars and Esc to skip; the runner is shot. The camp has a Dominion transport: the new `dominion_transport` unit, an armoured hover-truck with a roof turret ("Armored Cyberpunk Hovertruck Tank" by Jungle Jim, CC-BY-4.0). **61 civilians** (new `civilian` unit) follow Raynor, can't be selected and throw molotovs. A point of no return closes the west corridor once you are on the causeway. Real Vikings fly in and land in Assault Mode at the HQ.
- **Dialogue:** about 36 paraphrased lines, each tied to its trigger, plus 3 tutorial popups. A speaker card (portrait in a metal frame, red for Dominion speakers) slides in under the objectives; `confirm-beep.mp3` plays, then the line. The Adjutant uses `public/ui/portraits/adjutant.png`; other speakers use their unit portrait. Lines queue, and lines left waiting more than 8 s are dropped.
- **Victory screen:** shows "Civilians lost: n / 61".
- **Unknowns** are listed under `unverified` in the file: hit points, trigger radii, where the point of no return is.

## 🛠️ Missions as data + Mission Builder

- **Format:** a mission can be a `.openslop2mission` file (JSON; types in `src/campaign/data/MissionData.ts`). It holds the map (tiers, ramps, rocks, pits, roads, placed props, a tracing image), regions, paths, unit groups with per-difficulty counts, resource pallets, objectives, speakers, dialogue and triggers. Conditions: start, time, every, enter region, near point, unit dies, group wiped, N killed, objective state, after another trigger, counter, pallet, code hook. Actions: spawn, drop pods, say / say in order, objective, camera, cutscene, attack-move, move, attack, follow, change owner, land, tutorial, block region, autosave, resources, counter, remove, win, lose, code hook.
- **How it runs:** `dataMission(json, hooks)` in `src/campaign/data/compile.ts` turns the file into a normal `MissionDef`, so the menus, saves and progress work unchanged. The other missions stay hand-coded until they are rebuilt.
- **Save / load:** trigger actions run as replayable `MissionRuntime` events, so loading a save rebuilds everything they spawned. The interpreter's own state is saved with the mission.
- **Validation:** `src/campaign/data/validate.ts` (dangling ids, unknown units, points in walls or out of reach) is shared by `bun tools/campaign/mapcheck.ts` and the editor.
- **Mission Builder:** `bun run mission-builder` then open http://localhost:5210. It's a standalone Bun.serve + React app in `tools/mission-builder/` that imports the game's own rasteriser, map painter, unit list, icons and prop kits, and serves `public/` directly (nothing copied). It has:
  - a top-down map with the reference image overlay;
  - drag and drop from a palette of units, buildings, props, start points and pallets;
  - tools for regions, paths, ground, plaza, rock, chasm, water, roads and ramps;
  - an inspector with per-difficulty counts;
  - a trigger editor built from forms;
  - a dialogue timeline with play buttons;
  - a live objectives preview and a Problems list;
  - undo / redo, Save (canonical file format), import / export;
  - **Playtest**, which opens the game at `?mission=wol/liberation_day&diff=normal`;
  - a **3D** tab: the real game in preview mode (`&preview=1`: paused, no fog, lowest graphics, muted).
- **Kept out of normal games:** the mission UI (dialogue cards, tutorials, cutscene bars, drop pods, pallets) is loaded with a dynamic import only when a data mission starts. The editor and React never reach the game bundle.
- **Tests:**
  - `bun test` covers the compiler, validator, save / load and editor store, forms and API.
  - `src/campaign/campaigns/wol/liberationDay.test.ts` plays Liberation Day headless to victory on Casual and Normal, including a mid-mission save / load check.
  - `bun tools/campaign/autoplay.ts wol liberation_day hard` plays it from the command line (`--saveAt 125` adds the save / load check).
- **Mission 2:** `docs/campaign/wol/02-the-outlaws/README.md` maps The Outlaws onto the format. A tested skeleton is in `src/campaign/data/fixtures/outlaws_skeleton.openslop2mission`.

## 💾 Save / Load Game (single player)

- In-game MENU → **Save Game** / **Load Game** (campaign and skirmish; hidden in online games, greyed out after the match ends or during a cutscene). **LOAD GAME** on the home screen opens the same Load screen.
- SC2-style screens: Recent / Campaign / Skirmish tabs, a NAME / DATE list (click a header to sort), details of the selected save, Delete (asks first), and on Save a name box that warns before overwriting. Double-click a save to load it; arrows, Enter, Delete and Esc work too.
- Default name: game type, race and local time, e.g. `Campaign_Terran_2026-11-11_15-42-07`. Names keep only letters, digits, `_` and `-` (spaces become `_`).
- Each save is one standalone `<name>.openslop2save` file (header line + summary line + gzip JSON). With the local server (`bun run dev` / `play.sh`) they are written to `saves/` in the project folder (git-ignored); on the hosted site they live in the browser's private file storage. **Export** downloads a save as a file and **Import** adds one.
- A save holds every unit and structure (all their plain-data fields), resources, upgrades, the AI's state, creep, explored fog, camera and control groups. Loading rebuilds the same match and writes the saved state onto it; campaign scripts are fast-forwarded by re-running the timers that had fired, so objectives, waves and scripted units carry on (`src/save/SaveState.ts`, `MissionRuntime.replayFired`).
- Not saved: short ability effects in flight (a nuke or Yamato on its way) and timers a mission starts from inside a per-frame watcher.
- Tests: `bun test src/save` (skirmish round trip, every campaign mission saved at 6 minutes and reloaded).

---

## 🎮 Complete Controls & Hotkeys

### Mouse & Trackpad Controls
| Action | Input |
|---|---|
| **Select Unit / Building** | Left Click / Tap |
| **Marquee Box Select** | Left Click + Drag |
| **Select All of a Type (on screen)** | Double-click a unit or building |
| **Add / Remove from Selection** | Shift + Left Click |
| **Hot-Swap Possession (3rd person)** | Put the crosshair over a friendly unit (reticle turns into a green swap icon) and Left Click, or press `Tab` / `Shift+Tab` to cycle |
| **Smart Action (Move / Attack / Mine / Repair / Rally)** | Right Click / Two-finger Tap |
| **Camera Pan** | Trackpad Two-finger Scroll OR Middle Mouse Drag OR Screen Edge OR Arrow Keys (WASD are command hotkeys in RTS view) |
| **Camera Zoom** | Trackpad Pinch-to-zoom OR Mouse Scroll Wheel OR PageUp/PageDown (+/-) |
| **Minimap Camera Pan** | Left Click or Drag on Minimap |
| **Minimap Move Order** | Right Click on Minimap |

### Tactical Hotkeys
| Hotkey | Action | Description |
|---|---|---|
| `Y` | **Set Rally Point** | With production structures selected: the next click / tap on the ground or a mineral field sets their rally point (also the flag button on the command card; right-click still works) |
| `F1` | **Idle Worker** | Selects the next idle worker and centres the camera on it (also the button above the minimap) |
| `F2` | **Select Army** | Selects every combat unit (also the button above the minimap) |
| `V` | **Third-Person View (TPS)** | Default possessed view: Crimson Skies + Ace Combat flight / GTA 5 + UT/Q3 ground action |
| `F` | **First-Person View (FPS)** | Ace Combat + IL-2 cockpit / Tank gunner optics / Quake 3 + UT + GTA 5 visor |
| `Space` / `Shift` | **Afterburner / Tactical Dash** | In possessed view: engages aircraft afterburner boost or infantry arena dash (in RTS view: `Space` jumps to base) |
| `Q` / `E` | **Evasive Barrel Roll** | Performs rapid evasive aileron barrel roll when piloting aircraft |
| `Right Click` / `G` | **Secondary Weapon / Missiles** | Fires homing missile salvo (aircraft) or APCR armor-piercing round (ground) in possessed view |
| `X` / `Tab` | **Cycle Sub-Component Target** | Cycles precision IL-2 target subsystem (`Engine`, `Left wing`, `Tracks`, `Turret`, etc.) |
| `A` + Left Click | **Attack-Move** | Units advance and engage any enemy encountered along the path |
| `S` | **Stop** | Halts current movement and orders immediately |
| `H` | **Hold Position** | Holds ground and attacks targets in range without breaking formation |
| `P` | **Patrol** | Press `P` (cursor turns into the patrol reticle), then left-click a point: units attack-move back and forth between where they stood and that point until given another order. `Shift` queues; right-click / `Esc` cancels |
| `R` | **Repair** (SCV) | Press `R`, then click a damaged Terran structure or mechanical unit (or just right-click it) |
| `C` / `D` / `V` | **Bunker: Load / Unload All / Salvage** | With a Bunker selected |
| `T` | **Stimpack** | Marines & Marauders sacrifice 10 HP for +50% speed and attack rate |
| `E` | **Siege Mode / High Impact Payload / Fighter Mode** | Siege Tank deploys; Thor switches to 250mm Punisher Cannons; a landed Viking lifts off |
| `D` | **Tank Mode / Explosive Payload / Assault Mode** | Siege Tank unsieges; Thor switches back to Javelin missiles; a Viking lands as a ground walker |
| `R` | **Lower / Raise Depot** | Submerges Supply Depot to let ground units walk over it |
| `Escape` | **Game Menu & Music Options** | Opens mission pause menu & soundtrack settings (press Escape again to resume) |
| `F3` | **Resource Profiler** | Toggles live subsystem CPU/GPU/memory profiler overlay |
| `Ctrl + 1..9` | **Create Control Group** | Assigns currently selected units to group 1..9 |
| `1..9` | **Select Control Group** | Selects group (double tap to jump camera to group) |

---

## 🎯 Hybrid RTS / Action Possession & IL-2 Component Damage

Possessing a unit provides a true **tactical advantage**—allowing you to perform evasive maneuvers, lock onto multiple targets, and snipe specific enemy subsystems:

1. **Fighter Aircraft (`Wraith`) & Attack Helicopters (`Banshee`, `Medivac`)**:
   - **Third-Person View (`V` — Default Possessed Experience: Crimson Skies + Ace Combat)**:
     - Smooth arcade flight movement with responsive banking, **Afterburner speed boost** (`Space` / `Shift`), and **evasive barrel rolls** (`Q` / `E`).
     - **Ace Combat Target Lock-On**: Automatically acquires targets in your forward cone with a 3D diamond lock reticle (`#ace-lock-reticle`), assisted primary laser/rocket convergence (`Left Click`), and multi-target **Homing Missile Salvos** (`Right Click` / `G`).
   - **First-Person View (`F`: Ace Combat + IL-2 Sturmovik)**:
     - Cockpit HUD with pitch horizon roll, airspeed (`KTS`), altitude (`FT`), directional threat warnings, physical flight inertia, and **precision manual targeting** (+25% hull damage and **2.8× component damage**).
2. **Tanks & Armored Vehicles (`Siege Tank`, `SCV`)**:
   - **Third-Person View (`V`: Crimson Skies / GTA 5 Vehicle Driving)**:
     - Gas/brake pedals (`W`/`S` or `Up`/`Down`), steering wheel carving (`A`/`D` or `Left`/`Right`), dynamic chassis roll, and smooth chase camera follow.
   - **First-Person View (`F`: IL-2 Gunner Optics)**:
     - Ballistic rangefinder, turret traverse, high-velocity APCR secondary shells, and precision subsystem sniping (`X` / `Tab`).
3. **Powered Infantry (`Marine`, `Marauder`)**:
   - **Third-Person View (`V`: Unreal Tournament / Quake 3 / GTA 5)**:
     - Responsive GTA-style 3rd-person character steering combined with fast arena movement and tactical dash (`Space` / `Shift`).
   - **First-Person View (`F`: Quake 3 / Unreal Tournament / GTA 5)**:
     - High-speed arena strafing (`WASD`), tactical dash, and precision weak-point fire.
4. **IL-2 Sturmovik Component-Based Damage System**:
   - Every unit and building tracks independent subsystem health (`0–100%`) with real-time ASCII (`===-------`) telemetry in both the RTS Selection Panel and Possessed HUD:
     - **Aircraft (`Wraith`, `Mutalisk`)**: `Engine`, `Left wing`, `Right wing`, `Tail`, `Weapons`, `Fuel/Cockpit` — wing damage induces roll bias and degrades turn rate; engine damage reduces speed and disables afterburners; fuel/engine damage trails 3D smoke and fire.
     - **Attack Helicopters (`Banshee`, `Medivac`)**: `Rotor`, `Engine`, `Weapons`, `Tail` — rotor/tail damage causes altitude wobble and yaw drift.
     - **Tanks (`Siege Tank`, `SCV`)**: `Tracks`, `Turret`, `Engine`, `Optics`, `Ammunition` — track damage slows/immobilizes; ammo hit below 15% triggers catastrophic detonation.
     - **Infantry**: `Armor`, `Weapon`, `Mobility`.
     - **Buildings**: `Power`, `Production`, `Defenses` — production damage slows training queues; SCV repair restores both hull HP and damaged components.

---

## 🌐 Serverless Peer-to-Peer Multiplayer (WebRTC) — works on Vercel

Static hosts like Vercel can't run the WebSocket relay, so online deployments automatically use **WebRTC peer-to-peer** instead (`src/net/P2PClient.ts`, built on PeerJS). The menu is identical:

- **Host Game** → 4-letter code + invite link (`?join=CODE`); **Join** by code/link; **Quick Match** pairs you with another waiting player (players scan a few fixed rooms (`QUIK`, `QUIL`, `QUIM`, `QUIN`): the first one claims a free room, the next one connects to it).
- Only the *handshake* goes through a broker (and STUN/TURN servers for NAT traversal); all game data then flows directly between the two browsers (see **Lockstep sync** below for what is sent).
- **Handshake broker**: with Upstash connected, the deployment runs its own: `api/signal.ts` (a Vercel Function) passes the few connection messages between browsers through Upstash, and `src/net/SignalPeer.ts` is a small plain-WebRTC peer that behaves like a PeerJS one. Without Upstash (or if that broker fails), the free public PeerJS broker is used, as before. The choice is made once per page (`src/net/peerFactory.ts`) and both players load the same deployment, so they always meet at the same broker. Each browser polls its inbox (0.4 s during a handshake, 2 s while a host waits, 5 s once a guest is in); each request is one Upstash command, and a join takes about 1-2 s. `?signal=0` forces PeerJS.
- **Public game list (Open Games)**: a tiny Vercel Function (`api/rooms.ts`, storage in Upstash Redis via the Vercel Marketplace) holds only lobby metadata - game name, host, map, race, status, host country code (from Vercel's request header; no IP or city is stored). Public hosts register and heartbeat every 10 s; entries expire after 35 s, so crashed hosts vanish by themselves. Game traffic stays peer-to-peer. The Open Games tab polls smartly (3 s while visible, slower when hidden, backoff on errors), measures ping to the newest open games over a WebRTC `peek` handshake (which also hides stale entries), and shows Create Game / Quick Match / Join Code, sort + map filters, full / in-game statuses, skeleton + spinner loading states and error retry. Quick Match joins the lowest-ping open game or creates one (two simultaneous creators converge on the older room). Games are public by default; hosts can rename the game and flip Public / Private with the switch under the invite link (the code changes). Each listed game is a 2-line card (name + ping, then host / race / map / players) that never needs horizontal scrolling, and the list refreshes in place without re-rendering the page. **Setup**: Vercel dashboard -> project -> Storage -> Upstash Redis -> connect (injects `KV_REST_API_URL` / `KV_REST_API_TOKEN`). Until then, or if the service is down, everything falls back to the original serverless slot scan (`QUIK`/`QUIL`/`QUIM`/`QUIN`, max 4 public games). Locally run `bun server/dev-api.ts` (instead of the relay) with `?p2p=1` to try the list and our own handshake broker on localhost.
- **Transport selection**: `localhost` / LAN addresses use the relay (`bun run relay`); every other host uses P2P. Override with `?p2p=1` (force P2P, handy for local testing) or `?relay=host:port` (force a relay).
- **Deploying to Vercel**: use the **Deploy with Vercel** button (see [Deploy your own server](#-deploy-your-own-server-one-click-vercel)), or import the repo as a Vite project (build `bun run build` / `vite build`, output `dist`) - no server or env vars needed. Verified end-to-end on a live Vercel deployment (host, join by code, Quick Match, in-match orders both ways).
- **Third-party services**: the handshake uses our own broker when Upstash is connected, else the free public PeerJS broker. For players who can't connect directly, `/api/turn` (`api/turn.ts`, a Vercel Function) hands out short-lived credentials for **our own TURN relay** (Cloudflare Realtime TURN, your own coturn, or any provider; set via Vercel env vars, setup in [`server/turn/README.md`](server/turn/README.md)). The client fetches them in the background (`src/net/iceServers.ts`) and tries them before the free OpenRelay fallback. With nothing configured, the built-in public servers are used as before.
- Quick Match can take up to ~15 s when a matchmaking slot is stale (each stale slot costs ~8 s before it is skipped).
- Limitation: very strict/symmetric NATs need a TURN relay; configure `/api/turn` for a reliable one (the free public fallback is best effort).

## 🔁 Lockstep sync and host migration

Online matches run in **deterministic lockstep** by default (`src/net/NetSync.ts`):

- **Both computers run the full game.** Only player orders cross the network, not unit state: about 15 small packets a second each way, a few hundred bytes, instead of 15 full snapshots a second.
- **Fixed clock:** the simulation ticks at 60 Hz in turns of 4 ticks. An order runs 3 turns (200 ms) after it is given, on the same tick on both computers. That delay covers the network trip, so play only waits when a packet is later than that ("Waiting for the other player…").
- **Same random numbers:** simulation randomness comes from a seeded generator (`src/simulation/Rng.ts`, `simRandom()`), and shots fire from a unit's simulated position rather than its animated gun bone, so hits land on the same tick everywhere. Rules that depended on one computer's view (fog-of-war auto-targeting, the AI's larva bonus, the campaign Wraith's free cloak, Archon partner from the selection) are the same for both sides online.
- **Start:** the host sends one **keyframe** (the whole match, built on the save system: `src/net/keyframe.ts`). The guest copies it, so both begin identical. A PvP guest's copy is mirrored: its own side is always `player`, as before.
- **Desync safety net:** every packet carries a checksum of the game state (`stateHash.ts`). If they ever differ, the host sends a fresh keyframe and the guest jumps to it, replaying the orders since then. More than 4 in a minute and the match switches to the original **snapshot** mode (host simulates, guest shows 15 Hz snapshots) for the rest of the game. `?sync=snapshot` on the host forces snapshot mode from the start.
- **Hidden tabs:** browsers pause animation frames in background tabs, so a hidden player's game steps whenever the other player's packet arrives. Switching tabs doesn't freeze your opponent.
- **Host migration (co-op):** if the host leaves, the guest keeps playing against the AI with the full match. In snapshot mode the host sends a keyframe every 8 s and the guest continues from the latest one. In PvP the remaining player wins, as before.
- **Code map:** `commands.ts` (the order protocol and the single, validating place orders run), `Lockstep.ts` (turn scheduler, no game code), `snapshot.ts` (snapshot mode), `keyframe.ts`, `stateHash.ts`, `syncMode.ts`. Local actions go through `world.shouldRoute()` (only the local player's own actions taken outside the simulation are routed; AI and simulation calls always run directly).
- **Tests:** `bun test src/net` runs two real game worlds through an in-memory link: PvP and co-op stay bit-for-bit equal (Terran, Zerg creep, Protoss), a forced desync heals with one keyframe, repeated desyncs fall back to snapshots, and both host-migration paths. Also verified in two browser tabs (orders both ways, zero desyncs, co-op guest takes over).

**Chat:** in the lobby and in a match press `Enter` to open a small text box, `Enter` to send, `Esc` to cancel. Messages are `{t:'chat'}` packets over the existing `relay()` channel (works on both the P2P and relay-server transports); the last few lines show bottom-left and fade after ~9 s (`src/net/Chat.ts`).

## 🔭 Wider View

The RTS camera starts further back (46 vs 32) and zooms out much further (max 85 vs 55) with a wider 55° field of view, so far more of the battlefield is visible. The minimap viewport box scales with zoom, and the shadow frustum follows the camera so shadows stay sharp wherever you look. Zoom with the scroll wheel, pinch, or `PageUp`/`PageDown`.

## 🖥️ Render Resolution

Pause menu (⚙️ / `Esc`) → **Graphics / Render Resolution**: **Low** (1x plus no shadows, post-processing, reflections, ground cover/doodads and 70% fewer grass tufts), Performance (1x), Balanced (1.5x), High (2x), Ultra (2.5x supersampled) or Native display resolution. **Balanced (1.5x) is the default**. It applies instantly, is remembered between sessions, and High+ also doubles shadow-map detail. Native on a 2x Retina display renders 4x the pixels of 1x and can drop to ~30 FPS, which is why Balanced is the default. **Low tier** is for weak GPUs: it renders straight to the canvas (skipping the half-float MSAA target, bloom and colour grade), turns off the dynamic shadow map and image-based reflections, hides bushes/flowers/doodads and thins the grass; units, terrain, fog and forests stay. Scenery instances (trees, rocks, bushes, flowers, doodads) are split into 24-tile map chunks so off-screen chunks are frustum-culled instead of drawn every frame (measured: no gain when fill-rate bound, helps vertex-bound machines). Other frame-rate savers: half-resolution bloom, 2x MSAA, scenery (rocks/bushes/flowers) casting no shadows, and the shadow map re-rendering every other frame.

## 🎞️ Terran Animation, Muzzle Fire & Terrain Polish

- **Articulated Terran units**: SCV (spinning wheels/drill, torch flicker), Marauder (walk cycle, recoiling gun arms, spinning rotary barrels), Medivac (spinning rotors, tilting pods, hover) and Banshee (hover/bank, aiming camera, recoiling rocket pods). The Marine and Wraith keep their dedicated animators (`TerranAnimator.ts`).
- **Living Terran structures** (`TerranBuildingAnimator.ts`): pulsing status lights (faster while producing), bay doors that open when a unit pops out, Factory weld crane + venting stacks, Starport chasing runway lights + radar, Refinery pumpjack + flare, Depot vent hatches, Bunker/Missile Turret recoil. Concrete slabs now match the building body exactly (none on round buildings or the Command Center).
- **Shots leave the gun**: projectiles and muzzle flashes originate at the weapon's muzzle (`Muzzles.ts`: marine rifle tip, arm cannons, tank barrels, rocket pods, wing pods, bunker/turret barrels), on host and guest. Terran only for now.
- **Banshee Backlash rockets**: fired in a straight line from the two launchers either side of the nose (alternating), shown as a small white-yellow thruster flare with a thin, slightly wind-drifting soft smoke trail, and a small white-orange impact burst on the target's surface.
- **Terran missile weapons (Liquipedia-accurate)**: the same straight-flight rocket look is used by the Thor's Javelin missiles (4, air only; ground uses Thor's Hammer shell), Viking Lanzer torpedoes (pair, air only), Cyclone Typhoon missile, Goliath Hellfire missiles (pair, air only) and Missile Turret twin missiles. The Marauder keeps its arcing Punisher Grenade.
- **Ramps**: flared mouths that melt into the surrounding terrain, smooth organic edges, and baked shading (dark side walls, shaded lower end) so elevation reads clearly.

## 🛰️ Space-Station Deck (default map)

The default 1v1 map (`standard`) now has a space-station floor made from photo textures (`public/textures/floor/`), all inside the existing terrain shader: no extra draw calls, and 60 FPS holds.

- **Base deck plates** (`deck_plates.webp`, the dark gray tiles, also used on other unthemed maps): every 2.2-unit plate shows a random cell of the 4x4 photo, rotated or mirrored (128 variants), so the photo never visibly repeats. Layered on top: per-plate tone, broad grime and foot-worn patches, dirt and shadow in the seams, scuffed bare-metal edges, occasional glossy oil spots, fine grain up close only, and semi-metal roughness / metalness / relief that follow the same masks.
- **Oddball plates** (`deck_oddballs.webp`, ~8% of base plates): a hex-frame panel, a dark vent grate, a circuit-etched plate (random section each), and rarely a lit panel whose orange and cyan lights glow and go dark under fog of war.
- **Outer deck** (`station_panels.jpg`, replaces grass): large calm hull panels pulled toward neutral gunmetal, sitting slightly darker than the bases, on the same 45° grid. One repeat spans exactly 4 base plates, offset so the photo's long seams continue the base plate lines.
- **Crisp edges**: each plate is either base deck or outer panel (decided at its centre), so bases end in a clean stair-step along the plate seams, with the seam line carried onto the outer side. Grass blades are off on this map.
- **Station props** (`StationScenery.ts`, replaces trees / bushes / flowers / logs / rocks at 30% of the old count): cargo containers and stacks, crate stacks, barrels, pipe runs, vents, consoles, cable bundles, debris, floor beacons, sensor masts and lit pylons, spread evenly and kept off bases, lanes, ramps and every expansion. One shared instanced material (vertex colours, world-projected grime from `hull_plating.webp`, small emissive accents kept under the bloom threshold so they don't shimmer), chunked for culling, no per-frame work.
- **Map edge**: dark hull plating outside the walls, container stacks / tanks / pipe racks instead of the forest belt, a dark void sky, and bulkhead perimeter walls with ribs, a lit trim strip and a railing.
- **3D metal ramps** (`Renderer.buildStationRamps`): each ramp is a wedge with a steel-grate deck (anti-aliased hazard trim, guide-light studs) and truss-plated side skirts. The deck samples `getTerrainHeight`, so units stand on it within a few mm; on this map the ramp height is flat across its walkable width (`ProceduralGrass.FLAT_RAMPS`). The visual terrain is tucked under the deck, and the cliff steps back beside the lower part so the sides show.
- **Bulkhead cliffs**: the terrain shader's station branch draws dark steel panels wrapped round each plateau / mesa, with seams, rivets, grime streaks, a hazard kick plate and a thin lit trim line. The minimap uses station colours (gunmetal floor, lighter bases, dark walls, steel ramps).
- **Performance**: each floor pixel decides once whether it is base deck or outer panel and builds only that look (it used to build both); close-up grain, scuff and oil-spot noise is skipped where it can't show, and the unused grass / sand detail layer is skipped on this map. Terrain GPU time dropped from ~17-23 ms to ~5-7 ms per frame in the test browser.

## 🔥 Fire & Smoke

- **GPU fire and smoke** (`FireSmoke.ts`): one instanced quad mesh each for fire and smoke (two draw calls). The CPU writes a particle's start values once; the shaders move, grow and shape it from a shared tileable noise texture. Fire: flame tongues, fireballs that cool into soot, embers, flashes. Smoke: black oily, grey, wisps, white steam, and explosion billows lit warm from inside.
- **Flame shapes**: the original licking *tongue* plus *lick* (thin, tall, whipping tip), *sheet* (wide low wall of fire with several peaks), *flicker* (small pulsing scrap-fire) and *lean* (bent over by a draught), mixed together on burning structures, wrecks and rubble.
- **Flamethrowers**: Firebat and Hellbat (both arms) and Hellion (turret nozzle) fire real flame jets: a white-hot fuel stream that billows into rolling orange flame and soot, with flames licking up off the ground where it lands. The Hellion's stream carries past the target.
- **Burning Terran structures** (`BuildingFire.ts`): each structure gets fixed hot spots found by dropping rays onto its model's roof (more spots and bigger flames on bigger buildings; they move with a lifted-off building). Spots catch one by one from 3/4 health down to about 1/5, each going from grey smoke to small licks to a full blaze with a black column and sparks.
- **Destruction**: Terran structures cave in with fire bursting out, then a dust cloud, a last column of fire, and burning rubble for ~14s. Terran vehicles explode near the ground, keep cooking off for a second, and heavy vehicles (tanks, Thor, Odin, Goliath, Cyclone) vent a column of fire before the wreck smolders.
- **Explosive weapons**: Siege Tank, Thor's Hammer and Planetary Fortress fire a tight muzzle blast (fireball along the barrel, muzzle-brake side jets, sparks, a hanging smoke ring, dust kicked off the ground); shells land as ground blasts with a ring of dust. Marauder and Vulture grenades and all rockets puff smoke on launch and explode in fire; the Widow Mine has a real blast. Siege Tank shots now leave the barrel tips (the model has no weapon nodes; the muzzles are placed on the two barrel bones).
- Hellbat, Vulture, Odin, Liberator and Battlecruiser now show their weapons (they fired invisibly before).

## 🎙️ Unit Voices (Kokoro TTS)

Terran units speak with pre-generated, per-unit voice clips (70 short MP3s, ~0.7 MB, in `public/audio/voices/terran/`) instead of the browser's generic text-to-speech. Select, order and "unit ready" lines play for every Terran unit; Zerg and Protoss still use the browser voice until their clips are generated.

| Voice | Units |
|---|---|
| Male | Marine (`am_adam`), Marauder (`am_onyx`), Siege Tank + Sieged (`am_michael`), Goliath (`am_eric`), Thor (`bm_lewis`) |
| Female | SCV (`af_sarah`), Medivac (`af_heart`), Wraith (`bf_emma`), Banshee (`af_nova`) |

Each voice has its own speed, pitch (e.g. a lowered Marine) and a light radio-comms filter, and every clip is loudness-normalised. Clips load lazily, play one at a time (a new line cuts off the previous one) and fall back to the browser voice if a clip is missing.

**Regenerating or editing lines** (offline, not needed to play):
```bash
python3 -m venv .tts && .tts/bin/pip install kokoro-onnx soundfile numpy      # also needs ffmpeg on PATH
# download kokoro-v1.0.onnx and voices-v1.0.bin from https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
.tts/bin/python tools/tts/generate.py --models /path/to/models [--only marine,scv]
```
Edit `tools/tts/terran_lines.json` (voice, speed, effect and the lines per event) and re-run; only changed lines are regenerated. Kokoro-82M and kokoro-onnx are Apache-2.0 licensed.

## 🎚️ Voice Studio (standalone voice generator)

A standalone browser tool for making SC2-style voice lines: Kokoro text-to-speech plus Terran / Protoss / Zerg voice effects. It lives in `tools/voice-studio/` and is separate from the game (the game doesn't use it).

```bash
cd tools/voice-studio && bun install && bun server.ts    # → http://localhost:5177
```

Click a preset phrase (it loads that unit's voice, speed and race effects), press **Generate & Play**, then download the WAV. Effects can be toggled and tuned one by one. Full guide: [`tools/voice-studio/README.md`](tools/voice-studio/README.md).

## ⚖️ SC2 Balance Parity

Unit stats in `src/config.ts` follow the current Legacy of the Void multiplayer values from Liquipedia (Faster speed): HP, shields, armor, attributes (Light/Armored/Biological/Mechanical/Massive/Psionic), speed, sight, range, cost, build time, and per-weapon damage, bonus damage, cooldown and volley size. `attackSpeed` is `1 / cooldown`, so computed DPS matches Liquipedia (Marine 9.8, Marauder 9.3, Siege Tank 20.3 / sieged 18.7, Thor 65.9 ground, Banshee 27).

- **Weapons**: `damage` is per hit and `attackCount` is hits per volley (Banshee x2, Zealot x2, Thor x2); armor applies to each hit. `bonusDamage` reads from config (Marauder +10 armored, Siege Tank +10 / sieged +30 armored, Stalker +5 armored, Hellion +6 light, Void Ray +4 armored, Solaris Immortal +30 armored). Units with a separate air weapon (`airWeapon`: Thor, Queen, Wraith) switch weapon and range by target.
- **Upgrades**: flat damage per level (`upgradeDamage` / `upgradeBonus`) instead of a percentage. There is no high-ground damage bonus and no precision-shot multiplier.
- **Splash**: sieged Siege Tank splash is 100% / 50% / 25% inside 0.47 / 0.78 / 1.25; Hellion flame hits everything near the target; Thor air javelins splash.
- **Specifics**: Banshee is ground-only; Medivac is unarmed (heals 12.6 HP/s for 4.2 energy/s, range 4, afterburner x1.7 only on Medivacs); Marauder slow lasts 1.07s; siege transform takes 2.7s; Queen moves at 1.31 off creep and about 3.5 on it; creep gives other ground Zerg units +30%.
- **Wraith** uses the SC2 campaign Wraith: 150/150, 125 HP, speed 3.75, Burst Lasers 8 damage vs ground (range 5), Gemini Missiles 5 x2 (+5 armored) vs air. Possessed (first/third-person) shots deal the same volley damage as the RTS weapon.
- **Solaris Immortal** (internal type `archon`) uses Immortal stats: 200 HP + 100 shields, 20 (+30 armored) per hit, range 6, ground only.
- **Defensive structures**: Bunker (a garrison: see *Bunker* below), Missile Turret (air only, 12 x2), Spine Crawler (25 +5 armored) and Photon Cannon (20) follow SC2.
- **Not modelled**: Mutalisk bounces, Immortal Barrier, Concussive Shells research gating, and SC2 melee contact range (melee units keep engine contact distance). The Juggernaut was removed as it has no SC2 equivalent.

## 🧬 Sculpted Zerg/SCV models, animated Probe, Banshee, Barracks and Command Center

- **Animated (skinned GLBs, slimmed by `tools/model/slim-glb.py`)**: Probe, Banshee, Barracks, Command Center. They go through `RiggedModels.ts` / `RiggedAnimator.ts`; buildings scrub the `Build` clip with construction progress and play `Stand Work` while the production queue is busy.
- **Supply Depot (`tools/model/texture-depot.py`)**: the three Desktop sculpts (`animated`, `lowered`, `normal`) were flat vertex-coloured blocks, so the tool splits them by colour into materials and writes PBR textures (brushed steel, chipped red paint, worn hazard stripes, rivets, seams, scratches, emissive lamps) into `public/models/supply_depot_*.glb`. In game, both depot types use the animated file: the `Raise_Lower` clip is driven by the depot's state, so toggling with `R` visibly lowers or raises it. The animated file now has a separate `Hatch` node: lowered, the depot shows a flush armoured hatch (emblem, vents, hazard stripes); raising drops the hatch and lifts the structure, whose top carries an emblem plate and a vent-fan decal. The two still files are shipped but unused. The geometry itself is still blocky; the detail comes from the textures only.
- **Decimated sculpts (`tools/model/build-static.ts`)**: Hydralisk (pedestal cut away), Roach, Drone, Mutalisk (flapping wing parts) and SCV. The tool welds and quadric-simplifies the million-triangle sources to 9-20k triangles, bakes palette + ambient-occlusion vertex colours and writes small untextured GLBs (`bun tools/model/build-static.ts all`). The config also holds Ultralisk and Overlord, which have no unit in the game yet.

## 🔥 More Terran models, Firebat and Medic

- New GLB models: Marauder, Medivac and Hellion (animated), Factory, Starport and Missile Turret (animated buildings, clips for work / attack), Bunker (static; replaced by the Soviet bunker GLB, floor plate stripped), Refinery (the sculpted gas-vent GLB looked identical to a geyser; the Refinery is now the Barracks GLB tinted maroon plus procedural tall gas tanks with brass clamps, a glowing green stack and a feed pipe, modelled on the SC2 refinery; no downloadable Terran refinery exists on Sketchfab). Buildings without a build clip rise out of the ground as they are constructed.
- **Firebat** (Barracks, hotkey `F`, 100/25, 2 supply, 100 HP, 1 armor, flamethrower 8 +4 vs light, 1.4s cooldown, range 2, splash, speed 2.25) and **Medic** (Barracks, hotkey `E`, 75/50, 2 supply, 60 HP, 1 armor, 200 max energy, auto-heals nearby biological units) are the campaign units from Liquipedia. The Firebat uses the Aegis sculpt; the Medic uses the static `medibat` sculpt (decimated by `build-static.ts`, with its original material colours).
- The **Marine** (`Run`/`Idle` clips) and **SCV** (walk, stand, fidgets, looks, work while building/repairing/mining, carrying variants) are animated GLBs. The turbine-marine variant was unusable (its rig explodes), so the baked marine is used.
- `slim-glb.py` now downscales textures over 1024px when Pillow is installed.

### Unit scale pass

Visual scales were rebalanced so units read correctly against each other (Wraith about 3.3 wide, Mutalisk about 3.0, Zergling about 2.1 long, Stalker about 3.1 tall; Marine 1.8, Thor 4.3). Per-unit scales live in `UNIT_VISUAL_SCALE` (procedural models) and `RiggedModels.ts` (GLB models).

## 🗺️ Data-driven levels (7 new maps)

Seven big, independent, playable levels built from the look of the supplied terrain scenes (their texture palettes, rock shapes and props), authored as plain data in `src/levels/` and picked from the Versus map list like any other map:

| Map | Size | Theme | Highlights |
|---|---|---|---|
| **Sandstone Gulch** | 163x163 (S) | banded sandstone mesas | tier-2 main, terraced natural, exposed third, centre ridge ramps |
| **Alien Planet** | 192x192 (M) | bioluminescent blue world (props come straight from `alien_planet.glb`) | tier-2 main, tier-1 natural behind one choke, rock walls, raised centre plateau |
| **Glacial Rift** | 210x210 (L) | frozen highlands | tier-3 ice-shelf mains, edge naturals with a long ramp, towering ridges, frozen ponds |
| **Olive Meadows** | 224x224 (L) | olive meadow with a pond | twin naturals per main, pond with a stone ford, tree-covered walls |
| **Crater City** | 256x256 (L) | red striated canyon | tier-3 mains, terraced naturals, walled central crater with four gates and a watch island |
| **Moss Ruins** | 288x288 (XL) | overgrown ruined city | square-plaza mains, diamond centre plaza with four ramps, pillars, ruined walls |
| **Mire River** | 320x320 (XL) | dark swamp | impassable diagonal river with three stone fords, reeds and dead trees |

All are 2-player with 180° rotational symmetry, 3-4 height tiers (0-4), ramps between tiers, impassable rock massifs and 6-10 bases each. Mineral lines and geysers sit behind each town hall against a wall and are validated to be flat, on a single tier and off the shortest attack path.

**How it is built (all modular, any piece can be reused in another level):**
- `LevelTypes.ts` / `LevelHelpers.ts`: a level is a stack of painted ops (`tier`, `ramp`, `massif`, `pit` (water/lava), `plaza` (square-tile ground)), bases (`mkBase` generates the SC2-style curved mineral line + two geysers), mirror helpers (`withMirror`, `mirrorBase`) and `scaleLevel` to blow a design up (resources keep their real size) plus extra expansions.
- `LevelRaster.ts`: rasterises ops at half-tile resolution into a height field, cliff walls, ramps, biome and a pathing grid. `ProceduralGrassSystem` delegates every terrain query (height, cliffs, ramps, biome) to it on level maps, so fog of war, minimap, units and buildings all just work.
- `Themes.ts`: pure palette data (ground / plaza / cliff gradient maps sampled from the source textures, sky, light, grass colours, foliage). The terrain shader gradient-maps the shared procedural textures through the theme, so the same cliff / ramp / plaza detail takes any look.
- Photo textures cropped from the source scenes (`public/textures/levels/`: canyon / moss / sandstone cliff rock, meadow / swamp ground) are blended over the theme gradient maps in the terrain shader (`Theme.cliffTex` / `groundTex`). Glacial Rift and Alien Planet have no usable photo texture in their source files (`terrain_level.glb` is untextured; `alien_planet.glb` is flat-coloured), so they use palette + procedural detail only.
- `PropKits.ts` + `LevelScenery.ts`: named, instanced prop kits (`boulder`, `spire`, `crystal`, `pine`, `bush`, `deadtree`, `pillar`, `reeds`, `mesa_rock`, plus GLB kits split by material, e.g. `alien_rock` / `alien_crystal` from `alien_planet.glb`). Each level lists rules (kit, zone `massif` / `border` / `cliff` / `open` / `plaza`, density, scale) and keeps props clear of bases and resources.
- Liquid pits get a water / lava sheet; the map border is a rock rim.
- **Flow-field pathing** (`Pathfinding.getPathWaypoint`): every ground unit on every map follows a cached per-destination distance field and string-pulls to the farthest visible point (cliffs, ramps, buildings, minerals and rocks are all in the blocked grid; the old plateau-ramp waypoint is no longer used). A goal inside an obstacle (an SCV returning cargo to the Command Center, a unit sent to a structure) starts the field from every walkable cell touching that obstacle, so each unit approaches from its own side. Units cannot walk into buildings / minerals / rocks (they may walk out if already inside). The building-orbit steering is only the last-metre fallback of a direct approach, and the stuck detector resets at the start of every movement leg (stale timers used to fire a random sidestep right after depositing / mining, which looked like units circling the base). Workers waiting on an occupied patch only hop to a patch no other worker is already heading to. Measured in-game: cross-map moves 30/30 arrive on Sector Vanguard (before: 2/24 circled forever), SCV leg length vs straight line p90 2.7x -> 1.05x, ~18% more mining trips.
- `bun tools/level/check.ts <level_id> [--suggest]` prints an ASCII map (tiers, ramps, cliffs, bases, shortest path between the ramp defences), flags any resource that is not flat / on one tier / at least 4.5 tiles from the attack path, and with `--suggest` lists valid spots for extra symmetric expansions.

**Unavailable modes are disabled:** in the game select menu the buttons for modes the game doesn't have yet (Collection, Replays, Teams, Tournaments, Testing) are greyed out with a not-allowed cursor, are real `disabled` buttons, and the click handler ignores them.

**Map select preview:** the Versus map list shows a minimap preview of the selected map next to its description (`src/ui/MapPreview.ts`). Levels are drawn from their raster and theme palette (heights, plaza, cliffs, ramps, liquid); the classic maps from their plateau / mesa / trail lists. Blue / red dots are the start locations and cyan dots are expansions. The map list scrolls so the preview stays visible with all 11 maps. The multiplayer / co-op / custom map cards show the same preview (online matches can only use the map the page was loaded with, so that picker lists just that map).

To add a level: write a `LevelDef` in `src/levels/defs/`, register it in `src/levels/index.ts` and add its id to `MapId` in `src/types.ts`; the menu entry, minimap, expansions for the AI and resource spawning come from the data.

## 🏗️ Scenery crane

An inert StarCraft II industrial crane (`public/models/crane.glb`, loaded as the `crane` entry in `RiggedModels.ts`) is parked twice in the lowlands as pure scenery (no collision, no animation). `Renderer.placeCrane()` places it at fractions of the map size, so it works on every layout.

## 🤖 Animated Siege Tank, Thor and Goliath

These three use skinned, animated models (from SC2 unit rips) instead of procedural parts. `tools/model/slim-glb.py` shrinks each source GLB for the web (Ramer-Douglas-Peucker keyframe reduction, unused tangents/UV sets dropped; the Thor goes from 29.6 MB to 4.9 MB, the Goliath 6.8 to 1.9, the Tank 1.9 to 1.7) into `public/models/{siege_tank,thor,goliath}.glb`. `RiggedModels.ts` loads them at boot (matches wait for the load), shares geometry/textures/materials and gives each unit its own skeleton and `AnimationMixer`; `Ref_Weapon` nodes become muzzle points so shots leave the real barrels. `RiggedAnimator.ts` drives every clip in the files:

| Unit | Clips used |
|---|---|
| **Siege Tank** (7) | The "Story" tank model ships only Stand / Stand 01 (tank idle), Stand Work (sieged loop), Stand Work 01 (sieged fidget) and Stand Work Start / End, which play as the real deploy / undeploy animation squeezed into the 2.7s transform. No walk or attack clips: moving tanks idle in place and fire without recoil. Tank Mode holds `Stand 01` (stabilizers folded in; the looping `Stand` clip lowers and raises them, which is Siege Mode only), and the model's yaw is corrected (-90° + 27.4°, measured from the skinned hull and barrel) so the tank drives nose-first |
| **Thor** (16) | Walk, Attack (ground) / Attack Superior or Attack Inferior (air, picked per burst) looped while firing, Stand 01/02 alternating idle, Fidget, Morph on spawn, Spell on Hold Position, five Stand Dance clips (rare, after a long idle), Stand Victory when you win (all 16 clips are used) |
| **Goliath** (10) | Walk, Attack Turret per shot (layered), Stand, Stand Left/Right turret looks, three Fidgets, Unload End on spawn, Spell on Hold Position, Fidget 02 as the victory flourish |

**Goliath** is new (a campaign unit, not in SC2 multiplayer): Factory, needs an Armory, hotkey `G`, 150/50, 3 supply, 125 HP, 1 armor, Armored/Mechanical, speed 2.69. Autocannon 18 (+1/level) vs ground at range 6, Hellfire missiles 8 x2 (+8 vs armored) vs air, cooldown 1.5. 28 animated units cost about 6 FPS in testing. If a model fails to load the old procedural Thor/Tank are used as a fallback.

## 🐛 Animated Zerg & Protoss (Sketchfab GLBs), five new Zerg units

Zerg and Protoss units and buildings now use skinned, animated Sketchfab GLBs through the same `RiggedModels.ts` / `RiggedAnimator.ts` pipeline as the Terran units (slimmed by `tools/model/slim-glb.py` into `public/models/`). This **supersedes the static sculpts** of Roach, Hydralisk and Mutalisk described above (Drone keeps its static sculpt).

| Model | Source / clips used |
|---|---|
| **Roach**, **Baneling** | Walk plays in place (the source clips carry root motion, which `RiggedModels.ts` pins via the `inPlace` flag), Stand; Roach fires `Spell A` per shot |
| **Hydralisk** | The "Primal" Hydralisk is now the regular one: walk loop, idle, attack, fidget (clips are unnamed "Action Stash" and were identified from bone motion) |
| **Mutalisk**, **Queen**, **Ravager**, **Brood Lord**, **Viper** | Walk, several Stand variants, attack / spell where the model has them (Queen: look-arounds, Spell on Hold Position; Mutalisk: Birth intro) |
| **Ultralisk** | Only the "Shackled" model exists with no walk clip, so an idle clip is reused as a bobbing walk; no attack animation |
| **Zealot**, **Archon**, **Stalker**, **Void Ray** | Walk / Stand (Archon: two alternating attack clips; Stalker: head fidgets and weapon-glow attacks) |
| **Hatchery** (Hive model), **Spawning Pool**, **Nexus**, **Gateway** | Idle loops; the Spawning Pool scrubs its `Build A Start` clip with construction progress; Protoss warp in and Zerg mutate (see Race Construction Effects) |

Still on the old models (no animated Sketchfab model exists): Drone, Zergling (own animator), Sentry. The Probe was already animated.

### New Zerg units (all from larva at the Hatchery)

| Unit | Hotkey | Cost | Requires | Notes |
|---|---|---|---|---|
| **Baneling** | `B` | 25/25 | Spawning Pool | 30 HP, speed 4.13. Suicide attack: 16 (+19 vs light) to every enemy ground unit within 2.2, 2.5x vs structures, never hurts friendlies |
| **Ravager** | `V` | 100/100 | Roach Warren | 120 HP, range 6, damage 16, ground only (roach acid projectile) |
| **Ultralisk** | `U` | 275/200 | Hydralisk Den | 500 HP, 2 armor, damage 35 with 1.4 cleave on ground units around the target, 6 supply |
| **Brood Lord** | `L` | 300/250 | Hydralisk Den | Flying, 225 HP, range 10, damage 20, ground targets only, 4 supply |
| **Viper** | `I` | 100/200 | Hydralisk Den | Flying caster, 150 HP, 200 energy, **no attack and no abilities yet** |

These are simplified: there is no Baneling Nest / Ultralisk Cavern / morphing, so tech requirements map onto existing buildings, and the Zerg AI builds them from Hard upward when scouting suggests they fit (Banelings vs bio from Normal, Ravagers from Hard, Ultralisks and Brood Lords from Insane). It does not build Vipers, which have no abilities yet.

### Model sources and licenses

The source GLBs are in `public/models/sketchfab/` (51 models) with a per-model license list in `public/models/sketchfab/LICENSES.txt`. **39 of them are CC Attribution-NonCommercial** (mostly by Catholomew), the rest CC Attribution. Credit the authors, and do not use the NC models commercially or ship them under the project's code license. StarCraft is a Blizzard Entertainment property; these are fan models. To rebuild a slimmed model: `python3 tools/model/slim-glb.py public/models/sketchfab/<source>.glb public/models/<name>.glb`.

## 🎙️ Adjutant, Voice Variety, Ducking & Positional SFX

- **Adjutant announcer** (`playAdjutant` in `SoundSystem.ts`, clips in `public/audio/voices/terran/adjutant/`): "Base/Forces under attack", "Not enough minerals/gas", "Supply depot required", "Not enough energy", "Construction/Research complete", "Enemy forces approaching", scanner sweep, victory/defeat. Own voice channel (unit chatter never cuts it off), per-event cooldowns, a small priority queue, and browser-TTS fallback if a clip is missing. Under-attack alerts are detected in `GameWorld.checkUnderAttack`; resource/supply/energy alerts come from error toasts.
- **Unit voice variety**: every Terran unit now has separate `move` / `attack` acknowledgements, extra `select` lines and escalating `pissed` lines (click the same unit type 5+ times quickly). Consecutive repeats of the same clip are avoided.
- **Voice ducking**: music and SFX dip while a unit line (light) or the Adjutant (heavy) speaks, then ease back (`duck()` / `sfxDuck` + `musicDuck` buses). Browser-TTS lines duck too.
- **Positional SFX**: `sound.at(x, y).playX()` pans stereo by screen offset, attenuates with distance (radius scales with camera zoom), and culls inaudible/over-crowded sounds. The camera listener is set each frame in `main.ts`.
- Regenerate clips with `tools/tts/generate.py` (new lines live in `tools/tts/terran_lines.json`).

## 🎼 Dynamic Original Soundtrack (Crossfade Engine)

Features a dual-deck equal-power cosine crossfade music engine (`SoundSystem.ts`) with **8 original AI-generated OpenSlop II tracks** in `public/audio/music/` (the old classical recordings were removed), picked by gameplay state:
1. **Frontier of the Stars** – *Base Building & Expansion*
2. **A New Beginning** – *Exploring / Calm / Menu & Pause*
3. **Interstellar Conflict** – *Skirmishes & Major Battle*
4. **Frontier Starfire (Part 1)** – *Massive Assault / Large-Scale Conflict*
5. **Frontier Starfire (Part 2)** – *Final Battle*
6. **Shadow of Conquest** (fast techno-ish, upbeat) – *Air Strike / Late-game Massive Assault*
7. **In the Distance, War** (sad brass) – *Near Defeat*
8. **Looming Shadow** – *Enemy Nearby / Zerg Swarm*

- **How tracks are chosen**: a periodic check in `SoundSystem.ts` counts units in combat and enemies near each base, then applies priority rules (near defeat > final battle > air strike > massive assault > large-scale > major battle > skirmish > enemy nearby > swarm > exploring > base building) and crossfades to the matching track.
- **BG Music Volume % Slider**: Defaults to **5%** and is adjustable anytime (`0%–100%`) alongside a manual/auto track selector and Next Track (`⏭️`) button in the **Game Menu (`Escape` or `⚙️` / `🎵` top-bar button)**.

---

### 3rd-Person Hot-Swapping (Battlefield 2: Modern Combat style)
While possessing a unit in 3rd-person view (`V`), the centre crosshair becomes a green **swap** icon with a `CLICK: SWAP TO <UNIT>` label whenever a friendly unit is under it and in line of sight (terrain, cliffs and standing buildings block targeting), and a bracket tracks that unit. Left-click and the camera glides into the new unit while the old one drops back to idle. A 0.3 s cooldown prevents accidental double swaps, `Tab` cycles through all your units, and it is disabled for multiplayer guests (possession is host-only).

### Multi-Phase Construction
Every basic Terran structure (Command Center, Supply Depot, Barracks, Refinery, Engineering Bay, Bunker, Missile Turret, Factory, Starport) is built in visible phases: a concrete foundation slab with hazard pads and scaffold posts first, then the lower structure, the upper structure, and finally the tech details (masts, turrets, beacons). Stages are generated automatically from each model, so new Terran buildings get this for free.

The Supply Depot uses a light pale-steel body with a team-colour belt, a cyan-lit sliding roof hatch and corner buttresses. The top HUD bar has no background, so only the resource chips and buttons overlay the battlefield.

### Race Construction Effects
- **Protoss warp-in** (`src/graphics/WarpIn.ts`): while building, the hull is translucent and teal with drifting white plasma contour lines and a glowing energy sphere around it. The lines fade as the hull turns solid; completion restores the real materials with a white flash.
- **Zerg mutation** (`src/graphics/ZergMorph.ts`): the drone swells into a flesh cocoon, the structure grows up out of the ground inside the translucent membrane, then the membrane splits and slumps with a yellow-green ichor burst ring. The cocoon and the growing structure are skinned in a wet red blood-web texture (`public/textures/zerg_blood_web.webp`, cut from the "blood eye" model by Pakawat on Sketchfab (CC-BY-4.0) and mirror-tiled; triplanar, on temporary material clones restored when done) that hardens away near completion. Everything pulses to a resting human heartbeat: 66 bpm, a soft lub and a weaker dub, rolling up the structure. (Creep Tumor and Nydus Worm excluded.)
- Structures placed already finished skip both effects. Both run on multiplayer guests too.

### SCV Construction Hotkey Chains
Classic SC2 sequential hotkey sequences with an SCV selected:
- **Basic & Defensive Structures (`B`)**:
  - `B` ➔ `S` - **Supply Depot** (100M — Provides 8 supply, lowerable into ground)
  - `B` ➔ `B` - **Barracks** (150M — Trains Marines, Marauders)
  - `B` ➔ `R` - **Refinery** (75M — Harvests Vespene Gas from geysers)
  - `B` ➔ `E` - **Engineering Bay** (125M — Researches Infantry Weapons / Armor upgrades)
  - `B` ➔ `U` - **Bunker** (100M — garrison of 4 Marines / Marauders; hold ramps & choke points)
  - `B` ➔ `T` - **Missile Turret** (100M — anti-air turret with twin Longbolt missiles; detects cloaked units)
  - `Escape` - Return to main command card
- **Advanced Structures (`V`)**:
  - `V` ➔ `F` - **Factory** (150M / 100G — Builds Hellions, Siege Tanks, Goliaths and Thors)
  - `V` ➔ `S` - **Starport** (150M / 100G — Builds Wraith Fighters, Banshee Gunships, and Medivac Dropships)
  - `Escape` - Return to main command card

### Engineering Bay & Tech Lab Research Hotkeys
When the **Engineering Bay (`engineering_bay`)** is selected:
- `W` - **Infantry Weapons (Lv.1–3)**
- `A` - **Infantry Armor (Lv.1–3)**

When a **Barracks Tech Lab** is selected:
- `C` - **Combat Shield**: +10 Max HP and a visible shield on every Marine's left forearm.

Factory Tech Labs research Drilling Claws and Smart Servos. Like SC2, there is no automated micro for the player: focus fire, kiting, stim and retreating are all done by hand.

**Computer opponent micro**: the old "Tactical AI" code (focus-fire target priority, stutter-step kiting, auto-stim / retreat) now lives on as a per-player *doctrine* (`GameWorld.doctrines`, `aiDoctrine()` in `GameWorld.ts`). Skirmish opponents on Insane, Elite and Cheater focus-fire wounded units and stutter-step kite; human players and campaign enemies use plain SC2 targeting.

### Structure Unit Training Hotkeys
- **Command Center**:
  - `S` - **Build SCV** (Cost: 50 minerals, 1 supply)
- **Barracks**:
  - `A` - **Train Marine** (Cost: 50 minerals, 1 supply)
  - `D` - **Train Marauder** (Cost: 100 minerals, 25 gas, 2 supply)
- **Factory**:
  - `S` - **Build Siege Tank** (Cost: 150 minerals, 125 gas, 3 supply)
  - `G` - **Build Goliath** (Cost: 150 minerals, 50 gas, 3 supply; needs an Armory)
- **Starport**:
  - `W` - **Build Wraith Fighter** (Cost: 150 minerals, 100 gas, 2 supply)
  - `B` - **Build Banshee Gunship** (Cost: 150 minerals, 100 gas, 3 supply)
  - `M` - **Build Medivac Dropship** (Cost: 100 minerals, 100 gas, 2 supply)
- **Gateway / Warp Gate** (SC2 grid, no duplicate keys):
  - `Z` Zealot, `E` Sentry, `S` Stalker, `D` Adept, `T` High Templar, `K` Dark Templar
- **Hydralisk Den**:
  - `G` - **Grooved Spines** (100/100, 50s): Hydralisks +1 range (5 to 6)

---

## ⛰️ Tactical High-Ground Plateaus, Cliffs, Ramps & Line-of-Sight Vision

1. **Fortress High-Ground Plateaus & Craggy Rock Cliffs (`ProceduralGrass.ts` & `Renderer.ts`)**:
   - Both the **Player Main Base (`25, 25`)** and **Enemy Main Base (`95, 95`)** (standard 120x120 maps) sit atop elevated **High-Ground Fortress Plateaus (`y = 2.25m`, radius `18.0`)** ringed by impassable cliff walls. All plateau, ramp, mesa, trail and clearing positions now come from a data-driven `MapLayout` ([`maps.ts`](src/maps.ts)).
   - Two **Mid-Map Tactical Choke Cliff Mesas** at `(46, 74)` and `(74, 46)` flank the central `(60, 60)` natural expansion, creating authentic SC2 tactical corridors and choke points.
   - **Cliff look**: the terrain shader paints the walls as craggy blue-grey slate - domain-warped layered rock blocks separated by dark cracks, lighter lit ridges, mossy crevices - and perturbs the shading normal with a screen-space bump from the same crag height, so the walls read as rough rock under the sun (see `cliff.jpg`-style SC2 editor reference). The wall weight is encoded in the `B` channel of `tBiomeMask`; the rock pattern itself is procedural (no extra textures).
2. **Carved Tactical Ramps & Automatic Ramp Waypoint Routing (`Pathfinding.ts` & `Unit.ts`)**:
   - Each main base plateau features a single carved diagonal **Tactical Ramp** (`(36..41, 36..41)` for Player, `(79..84, 79..84)` for Enemy on the standard maps; one per plateau on Lost Temple) that can be walled off or fortified with Supply Depots, Bunkers, and Siege Tanks. Ramps are weathered flagstone set in packed earth (cobbles with dark joints, domed relief via a bump normal, worn centre, moss at the edges) that fades organically into the surrounding ground.
   - `Pathfinding.getRampWaypoint()` (legacy, superseded by the flow field) routed ground armies transitioning between low ground and high ground smoothly through the ramp channel while preventing ground units from stepping onto cliff walls.
3. **SC2 High-Ground Line-of-Sight Vision Occlusion & Combat Advantage (`FogOfWar.ts` & `Unit.ts`)**:
   - **High-Ground Fog Occlusion**: Precomputed elevation grids in `FogOfWar.ts` prevent low-ground units from seeing up onto high-ground plateaus (`> observerHeight + 0.85m`) unless a friendly unit climbs the ramp or an air unit (`Wraith`, `Medivac`, `Banshee`) spots from above.
   - **+15% High-Ground Elevation Damage Bonus**: Ground units firing from high ground onto lower-elevation targets deal **+15% bonus tactical damage**.
   - **High-Ground Attacker Reveal**: Enemy units or Spine Crawlers firing from high ground into low ground briefly reveal a `3.8m` vision circle around their position.

---

## ⚔️ Factions, Units & Hyper-Realistic Marine Skeletal Animation

### Terran Dominion / Blue Vanguard (Player)
- **Marine (Hyper-Realistic Articulated CMC-400 Powered Infantry — `MarineAnimator.ts`)**:
  - Built with a 14-bone hierarchical skeletal rig (`pelvis`, `torso`, `head`, `leftArm`, `leftForearm`, `rightArm`, `rightForearm`, `rifle`, `muzzleFlash`, `combatShield`, `leftLeg`, `leftShin`, `rightLeg`, `rightShin`, plus dual dorsal micro-fusion turbines) using a singleton `MarineGeometryCache` (0 runtime WebGL VBO allocations) and cached `userData.bones` references (0 runtime scene-graph searches).
  - **Hyper-Realistic Walk Stride**: Inverse-kinematic knee bend during swing phase, heel-strike to toe-off ankle roll, heavy pelvis vertical bounce & lateral weight transfer, counter-rotating shoulder/torso torsion, and natural 2-handed rifle patrol sway (amped up by 45% when Stimpack is active).
  - **Hyper-Realistic Combat Shooting**: Smoothly transitions into a braced 2-handed firing stance, leans the upper torso into the shot, kicks the C-14 Impaler Gauss Rifle and right shoulder backward with high-frequency damped spring recoil on every round fired, and ignites a 3D multi-spike starburst muzzle flash cone at the barrel tip.
  - **Upgradable 3D Ballistic Combat Shield**: Researching **Combat Shields** at the Engineering Bay immediately equips a visible 3D Titanium-Composite Ballistic Shield on every Marine's left forearm (+10 Max HP).
- **SCV (T-280 Mecha Worker)**: Hyper-realistic industrial mech featuring high-performance textured surfaces (weathered industrial blast chassis, composite tech cabin, mechanical hull plating), high-visibility hazard warning striping, faceted cyan holographic visor canopy, heavy all-terrain caterpillar treads, an articulated tungsten core rotary drill, and a fusion plasma welding torch with magnetic salvage claws. Gathers minerals and gas with buttery-smooth turning and jitter-free harvesting stances, constructs structures, and repairs mechanical units and buildings.
- **Marauder**: Armored shock infantry with textured 5-300 shock armor, composite helmet, and hull-plated twin grenade launchers. Fires **Concussive Shells** that deal bonus damage to armored targets and slow enemy movement by 50%.
- **Goliath** (campaign unit, Factory + Armory, hotkey `G`): bipedal walker with twin autocannons (ground) and Hellfire missile pods (air); animated model, see *Animated Siege Tank, Thor and Goliath* below.
- **Siege Tank**:
  - *Tank Mode*: Mobile 360° rotating turret for frontline skirmishing.
  - *Siege Mode*: Stationary artillery with 13 tile range, hydraulic stabilizers, and devastating 120mm Shock Cannon explosive splash damage.
- **Thor** (two anti-air payloads, Liquipedia LotV values; switching takes 1.8s, 0.71s with Smart Servos, and locks the Thor in place):
  - *Explosive Payload* (default, `D`): Javelin Missiles 6 (+6 vs Light) x4 with splash, cooldown 2.14, range 10.
  - *High Impact Payload* (`E`, unit type `thor_ap`): 250mm Punisher Cannons 25 (+10 vs Massive) single target, cooldown 0.91, range 11. Twin glowing orange shells track the air target and burst in flak. Both modes keep Thor's Hammer (30 x2) vs ground. The switch plays the model's Spell clip and vents steam.
- **Viking** (125/75 since 5.0.15; transform 1.85s, 1.13s with Smart Servos; always uses Ship Weapons / Plating):
  - *Fighter Mode* (default, `E`): air unit, Lanzer Torpedoes 10 (+4 vs Armored) x2, cooldown 1.43, range 9, speed 3.85.
  - *Assault Mode* (`D`, unit type `viking_assault`): ground unit, Twin Gatling Cannon 12 (+8 vs Mechanical), cooldown 0.71, range 6, speed 3.15; fires short bursts of tracers.
  - The Viking counts as an air unit for the whole transform: it stays airborne while descending and is airborne at once when lifting off. It can only land on pathable ground (it touches down on the nearest open spot within 3 cells, or refuses).
  - The Viking model is a single static mesh whose bind pose is the upright Assault walker, so Fighter Mode tips it forward into a flight attitude and the transform swings it upright as it lands (`src/graphics/VikingAnimator.ts`).
- **AI mode switching** (`ZergAI.updateModes`, Normal difficulty and up; runs even for base-less campaign armies): a Thor goes High Impact when the nearby air is mostly Massive capital ships and back to Explosive against Light flyers; a Viking (Hard and up) lands to fight ground units when no enemy air is within 18 and lifts off when air comes within 12 or nothing on the ground is left to shoot. A unit keeps a new mode for 7s (4s on Insane and up) so it doesn't flip-flop. The Terran AI's Starport now builds Vikings (instead of only Banshees) once it has seen your air units.
- **Smart Servos** (Tech Lab, needs an Armory, 100/100, 79s, hotkey `S`): faster Thor and Viking transforms. (The game has no Hellion/Hellbat transform, which Smart Servos also speeds up in SC2.)
- **Wraith Fighter**: Supersonic air-superiority fighter with a lofted aerodynamic fuselage, swept-delta wings, canards, canted twin tails, gunmetal hull with red war-machine accents and team-coloured stripes, twin vectoring nozzles with a dual-core afterburner, wingtip pulse-laser pods and under-wing missiles. It has a seamless idle hover (unwrapped, incommensurate-frequency motion — no loop seam), speed-driven wing sweep and a firing recoil/muzzle-flash animation. All geometry/materials are built once and shared, so it holds 60 FPS. Every flying unit hovers at the same cruise altitude (`Unit.CRUISE_ALTITUDE`, 3.2 above terrain); the Wraith eases up to it after the opening cutscene.
- **Banshee Gunship**: Tilt-rotor attack helicopter with dual spinning rotor nacelles and air-to-ground precision rocket pods.
- **Medivac**: Flying dropship that automatically restores health to nearby biological infantry with an energy-powered restoration beam.
- **Command Center**: Hyper-realistic planetary fortress and resource processing hub. Features textured blue metal fortress armor, composite ballistic plating, weathered blast foundation, 4 massive hydraulic outrigger landing gear pylons with hazard-striped footpads, 4 recessed VTOL liftoff rocket thrusters with glowing cyan plasma cores, an armored vehicle airlock bay with staging floodlights, an automated mineral hopper sieve, a cantilevered forward holographic observation bridge, a rooftop VTOL helipad, dual heavy cooling exhaust towers, a flashing orbital uplink spire, and an actively rotating 3D phased-array radar dish.
- **Barracks**: Twin-bay infantry training facility featuring textured blue metal blast hull, weathered industrial foundation, hull-plated assembly hangar doors with luminous entry lintel, and composite tech rooftop gantry with communications beacon. Includes a **5-stage visual construction sequence** (foundation pad ➔ structural steel scaffolding ➔ armored lower walls ➔ upper blast plating & hangar doors ➔ rooftop command gantry & active status lights) while the constructing SCV crawls around the building perimeter welding with live plasma sparks.
- **Engineering Bay (`engineering_bay`)**: Octagonal R&D laboratory with holographic AI core dome, 4 cryo-conduit pylons, and rotating satellite telemetry array. Researches Weapons/Armor upgrades
- **Bunker (`bunker`)**: Soviet-style ferro-concrete bastion (user-supplied Sketchfab GLB with the metal foundation plate removed, see `tools/model/prep-bunker.py`). It has no gun of its own: the infantry inside shoot.
- **Missile Turret (`missile_turret`)**: 360° rotating Doppler radar and twin Longbolt SAM launcher pod array that intercepts enemy Mutalisks and ground forces.
- **Supply Depot**: Increases army supply cap by 8. Can be lowered flush with the ground to allow friendly army traffic.

---

## 📜 Future Humanity & Strategic Roadmap
For the full design specifications, 3-faction future humanity lore (**Red — The East**, **Blue — The West**, **Purple — The Outlands**), and the programmable AI / behavioral routine upgrade architecture, see:
- [`GAME_DESIGN_PLAN.txt`](./GAME_DESIGN_PLAN.txt)

### Computer Opponent (all three races)
- **Full roster and tech tree** ([`ZergAI.ts`](src/ai/ZergAI.ts), plans in [`plans.ts`](src/ai/plans.ts)): the AI builds every multiplayer unit and structure of its race, including Tech Labs / Reactors, Orbital Command / Planetary Fortress, Lair / Hive / Greater Spire, unit morphs (Baneling, Ravager, Lurker, Overseer, Brood Lord), Archon merges, Warp Gate warp-ins at Pylons, Creep Tumors and a Nydus Worm attack.
- **Same rules as the player**: production goes through `produceFor` and the real abilities, so tech requirements, add-ons, larva, supply and Warp Gate all apply.
- **Sensible builds, no dice rolls**: each race follows an ordered tech plan; every free production slot (queue, Reactor slot, larva, Warp Gate) takes the unit furthest below its planned share of the army, weighted by what the AI has scouted (anti-air vs air, splash vs bio, anti-armor vs mech). It holds money for its top pick instead of flooding cheap units, and fields each newly unlocked unit once.
- **Scaled by difficulty**: Recruit uses tier-1 tech only, Normal adds tier 2 (Factory / Starport, Lair, Robotics / Stargate / Templar), Hard and up use the whole tree. Harder AIs also tech sooner, run more production, gas and bases, and saturate more workers.
- **Audit**: `bun src/ai/audit.ts [minutes] [difficulty...]` runs headless matches ([`headlessWorld.ts`](src/ai/headlessWorld.ts): the real simulation without rendering) and prints when each unit / structure first appeared; [`aiRoster.test.ts`](src/ai/aiRoster.test.ts) asserts the full roster on Hard (24 min) and Elite (20 min), and the tech caps on Recruit / Normal (about 1-2 minutes to run).
- Assembles attack waves, scouts, harasses worker lines, expands, and recalls its army to defend its base.
- **Creep System**: Every Hatchery / Hive is a creep source (457 tiles at full spread, a 69-tile patch when it finishes). Every 0.25s a few random edge tiles fill in (about 45s for a full spread) and fade in smoothly; creep stops at cliffs and recedes tile by tile when its source dies. Zerg structures (except Hatchery, Extractor, Overlord Pod) can only be placed on creep, and bleed 1% max HP/s if the creep under them disappears. Zerg ground units move +30% on creep. It renders as an opaque, procedural, fibrous charcoal membrane with a ragged organic edge ([`CreepShader.ts`](src/graphics/CreepShader.ts)); the minimap draws it in SC2's solid violet.
- **Drone morph**: a Zerg drone ordered to build walks to the spot and becomes the structure (cost is charged on arrival, the drone's supply is freed).
- **Zergling**: Ultra-fast melee raptors that spawn in packs and flank unfortified positions.
- **Roach** (145 HP, 1 armor, 16 damage, range 4): spits toxic yellow-green acid saliva (vapour trail, droplet splash, heavy wet spit with an acid fizz; impacts sizzle) and has rapid passive health regeneration.
- **Hydralisk** (90 HP, 0 armor, 12 damage, range 5, 6 with Grooved Spines): fires a quick pair of slender needle spines (dark shaft, glowing yellow point, faint streak; sized to the Hydralisk) at ground and air (sharp "thwip" launch, dry tick on hit). The Mutalisk has its own launch sound.
- **Mutalisk**: Agile biological Zerg flyer with animated leathery wings firing glaive wurm projectiles against air and ground targets.

---

## 🌿 Dual-Biome Procedural Terrain & Organic Battlefield

The battlefield surface is rendered via an advanced **hybrid procedural dual-biome terrain system** that seamlessly blends vibrant multi-tone grass with natural super light beige sand dunes:

1. **Vibrant Multi-Shade Grass Texture & Normal Map**:
   - Synthesized dynamically at startup using multi-octave **Simplex noise and fractal Brownian motion (fBm)**—zero external image downloads required.
   - Rich palette of radiant **lime greens, electric chartreuse, vivid light greens, emeralds, and sunlit blade tips**, accented by wild clover florets.
   - **Toroidal Coordinate Wrapping**: All blade coordinates wrap periodically across texture boundaries, producing 100% mathematically seamless tiling (`THREE.RepeatWrapping`) with zero edge seams or boundary lines.
   - Accompanying procedural tangent-space normal map provides realistic micro-depth, sun specular sheen, and surface roughness under dynamic lighting.

2. **Seamless Very Light Beige Dune Sand Texture & Biome Splatting**:
   - **Clearing floor (current)**: the clearings are dark gunmetal deck plates on a 45-degree grid (thin lighter bevel line, near-black seams, each plate slightly lighter / bluer / warmer than its neighbours); about 1 in 5 plates is rotated a few degrees and lit as if tilted, and 1 in ~30 of those is lit as slightly proud of the floor (a shading effect only, no geometry). Shader code in `Renderer.ts` (`slabCol`). The beige-sand description below is the older look.
   - Base clearings (Player Command Center starting area, Enemy Hatchery base, and Center natural expansion) along with the winding natural valley trail render as a seamless, very light creamy beige dune sand texture (`#fcf6e8` sunlit ivory ridges, `#f0e5cf` creamy midtones, `#e1d2b6` soft ripple troughs, zero gray).
   - Features fine wind-blown diagonal sand ripples generated via multi-harmonic sinusoidal wave equations, quartz sand grain micro-noise, and scattered mineral pebble granules.
   - Custom PBR fragment shader splatting (`onBeforeCompile`) blends diffuse textures and tangent-space normal maps across the world-space biome mask (`getGrassBiomeWeight`) with `fog: false` on the terrain material so ground colors are never muted or washed out.

3. **3D Sloping Curvy Soft Hills & Topographic Valley-to-Hilltop Elevation Shading**:
   - Continuous mathematical elevation function `getTerrainHeight(x, z)`: base clearings, center expansion, and winding natural sand trails remain flat at sea level ("zero point" `y = 0.0`), while the surrounding battlefield rises into lush, vibrant, curvy 3D rolling hills up to ~2.85 units high.
   - **Smooth Topographic Valley & Hilltop Shading (`getHillShadeFactor`)**: Rolling grass valleys are shaded in a noticeably deeper, rich emerald tone (`vec3(0.38, 0.48, 0.34)`), while hilltops shine at full sunlit grass brightness (`vec3(1.04, 1.05, 1.00)`), matched seamlessly across both the terrain surface shader and the 3D instanced grass tufts so elevation differences are immediately readable.
   - **Modern Unit Slope Conformation**: Units, vehicles, and mechs dynamically calculate their ground elevation and physically tilt/pitch along hill slopes (`rotation.x` and `rotation.z`) as they traverse terrain, conforming to slopes with smooth suspension physics.
   - **Building Placement & Resources**: All structures, mineral patches, glowing green Vespene Geysers, and Zerg Creep meshes (`flipY`-aligned distance-field `DataTexture`, opaque shader) conform accurately to the 3D surface elevation.
   - **Tactical 4-Corner Selection Brackets `[  ]`**: Bold, luminous neon brackets frame selected units, buildings, and resources, dynamically tilting with hill slopes to float cleanly on top of the terrain without clipping.

4. **GPU-Instanced 3D Wind-Swaying Grass Tufts**:
   - 2,400 3D grass tufts rendered in a **single GPU draw call** using `THREE.InstancedMesh`.
   - Each tuft features intersecting curved blade planes with bright lime-green sunlit tips and root-to-tip gradients, planted flush (`-0.02` root anchor) and quaternion-aligned perpendicular to the exact 3D hill surface normal (`setFromUnitVectors`).
   - Guided by `getGrassBiomeWeight(x, z)` so 3D grass blades populate the lush grass plains and 3D curvy hills while keeping sand base clearings and natural trails clean.
   - **Custom GPU Vertex Shader**: Injected into the material pipeline via `onBeforeCompile`, animating natural wind gusts and blade swaying in real time with zero CPU overhead. Fully visible in overhead RTS, First-Person (FPS), and Third-Person (TPS) views!

5. **Semi-Transparent HUD & Top Bar (Blur-Free)**:
   - Top status bar and bottom command console are rendered in a sleek, modern semi-transparent styling without artificial blur filters, keeping the vivid 3D battlefield crystal clear.
   - All UI containers feature increased border radii for clean rounded corners.

6. **Real-Time FPS & Subsystem Resource Profiler (`F3`)**:
   - **Real-Time FPS Badge**: Positioned in the top-right system cluster, just left of the settings cog and next to the mission time counter, displaying live framerate with color-coded health indicators (green $\ge$ 55 FPS, yellow 30-54 FPS, red < 30 FPS). Click to toggle the resource profiler.
   - **Real-Time Module Profiler Overlay**: Accessible via the `F3` key, the top-bar `📊` button, or through the Game Pause Menu (Esc).
   - Monitors CPU frame-time budgets (relative to 16.67ms 60 FPS target), WebGL GPU draw calls, triangle counts, texture/geometry buffers, and JS heap memory.
   - Features color-coded visual progress bars for each subsystem:
     - 🌿 **Animated 3D Grass & Wind**: Instanced mesh updates & vertex wind shader.
     - 🗺️ **Terrain & PBR Splatting**: Procedural height sampling & texture splatting.
     - 🤖 **Unit AI & Flocking**: Kinematic movement, GTA drive steering, and combat AI.
     - 🏭 **Buildings & Multi-Stage**: Multi-stage visual building construction and production queues.
     - 🌫️ **Fog of War & Vision Grid**: Translucent tactical shroud & dynamic line-of-sight.
     - ✨ **Combat VFX & Sparks**: Ballistic projectiles, tracer rounds, and particle systems.
     - 🖥️ **WebGL GPU Draw Pipeline**: Frame render time and Three.js draw call overhead.
   - Can remain open as a persistent HUD overlay during live gameplay to identify bottlenecks and optimize performance in real time!

---

## ⚡ Apple Silicon M1 & Solid 60 FPS Resource Optimizations

This game is tailored to extract maximum efficiency from Apple Silicon M1 and modern browsers to stay well below the **`16.67ms` 60Hz VSync threshold** throughout the entire match:
1. **Zero-Readback Minimap Compositing (`Minimap.ts`)**:
   - Eliminates synchronous `ctx.getImageData` / `ctx.putImageData` GPU-to-CPU pipeline stalls by baking the static terrain biome once and compositing Fog of War via an offscreen canvas with hardware-accelerated blitting.
2. **Precomputed `241×241` Bilinear Terrain Height Cache (`ProceduralGrass.ts`)**:
   - Replaces per-unit per-frame trigonometric `Math.sin` / `Math.cos` / `Math.hypot` terrain evaluations with a `0.5`-unit resolution `Float32Array` height LUT and fast bilinear interpolation.
   - Reduces terrain geometry vertex/triangle count (`128×128` grid) with zero visual difference.
3. **Smooth SC2-Style Fog of War with CPU Pre-Smoothing & Radial LUTs (`FogOfWar.ts`)**:
   - Dual-layer C² quintic smootherstep feathering (`0.0 ➔ 0.42` explored boundary and `0.42 ➔ 1.0` active vision boundary) paired with a **CPU 5-tap spatial cross kernel** on the `240×240` fog buffer when dirty, allowing GPU terrain and creep shaders to use a **single hardware-bilinear `texture2D` lookup per pixel**.
   - Precomputes radial distance lookup tables per vision radius and uses dirty-flag tracking so `fogTexture.needsUpdate` only uploads to the GPU when texels actually change.
4. **Opaque Early-Z Grass Pass, Vertex Fog & Horizon Distance Culling (`ProceduralGrass.ts` & `CreepSystem.ts`)**:
   - Renders all 2,400 instanced 3D grass tufts in the opaque depth-tested pass (`transparent: false`, `alphaTest: 0.35`) with hardware Early-Z rejection, evaluates Fog of War tint once per vertex in the vertex shader, and culls distant sub-pixel grass tufts beyond `68` units from the camera.
   - The creep mesh is hidden entirely until a creep source exists, and fragments outside the creep edge are discarded.
5. **Pooled GPU Geometries, Materials & Fog-Culled Particles (`ParticleSystem.ts`, `Decals.ts`, `Unit.ts`, `Renderer.ts`)**:
   - Shares static geometries and materials across combat sparks, projectiles, explosions, and overhead health bars with zero runtime WebGL buffer leaks.
   - Skips spawning unseen 3D welding spark meshes for enemy workers hidden inside unexplored Fog of War.
   - Uses a power-of-two `1024×1024` directional shadow map and a `1.5×` Retina pixel ratio cap to eliminate pixel fill-rate bottlenecks.
6. **DOM Value Diffing (`UIManager.ts`)**:
   - Caches displayed resource/supply/FPS counters and throttles non-critical selection HUD rebuilds, eliminating redundant DOM layout reflows on every animation frame.
7. **Continuous Circular Building Perimeter Tangent Avoidance (`Unit.ts`)**:
   - Ground units and SCVs smoothly orbit around building hulls using forward-ray tangent projection (`proj > 0.05`) without integer-grid staircase jitter, while keeping mineral-to-Command-Center harvesting lanes completely direct and unobstructed.
8. **Metal GPU & Unified Memory Architecture (UMA)**:
   - Uses WebGL2 with direct Apple Metal translation (`--use-angle=metal`, `--enable-zero-copy`) and shared TypedArrays (`Uint8Array`, `Float32Array`).

---

## 🪟 Windows Portability

Zero external platform-dependent binaries:
- The entire engine runs in modern Chrome, Edge, or Firefox.
- On Windows, the ANGLE backend seamlessly uses **DirectX 12** or **Vulkan** with full hardware rasterization.
- `play.bat` provides instant 1-click launch on any Windows 10/11 system.

---

## 🛠️ Tech Stack
- **Engine**: Three.js (3D Graphics & Shaders) + Vite + TypeScript
- **Visuals**: Procedural 4-corner tactical HUD selection brackets `[  ]` for units, buildings, and natural mineral/gas resources
- **Audio**: Web Audio API (High-impact custom weapon audio: Marine Gauss Rifle SMG, Marauder Concussive Autorifle, quiet crystalline mineral deposit chime) + Web Speech API (Unit selection greetings, order confirmations, "Training", "Building", "Construction complete")
- **Pathfinding**: Grid-based flowfield + local flocking / Boids collision avoidance + buttery-smooth angular momentum turning
- **Simulation**: Deterministic 60 FPS tick loop with spatial partitioning
- **Units**: Sleek hyper-realistic procedural 3D models with PBR shaders, industrial hazard striping, and articulated mechanisms


---

## 🎮 Playable Factions, Campaign, Skirmish & Multiplayer

On launch a front-end menu offers:

- **Campaign** – 4 missions (Terran "Outpost 42069" → Zerg → Protoss → Terran "Outlands Frontier", moved to the end) with unlock progression saved in `localStorage`, optional difficulty override and a "Next Mission" button after victory.
- **Skirmish** – pick your faction (Terran / Zerg / Protoss), the AI's faction, map (Sector Vanguard, Obsidian Rift, Crystalline Sanctuary) and difficulty (Recruit → Grandmaster).
- **Multiplayer** – 1v1 PvP or 2-player Co-op vs AI. Run the tiny relay (`bun run relay`, started automatically by `play.sh` / `play.bat` / `bun run start`):
  - **Host Game** → get a 4-letter code + copyable invite link (`?join=CODE`); click **Start** once a friend joins.
  - **Find a Game** → live list of open games, **Quick Match**, or type a code.
  - Deterministic lockstep: both computers simulate, only orders are exchanged (snapshot mode is the automatic fallback; see **Lockstep sync and host migration**). If the game refuses an order (invalid location, missing tech, not enough resources), the player who gave it gets an on-screen message explaining why. In co-op, if the host leaves, the guest takes over the match. LAN play works via `http://<host-ip>:5173`; for internet play host the relay publicly and add `?relay=your-server:8787`.

Campaign tips: Mission 2 (Zerg vs Terran) faces early Wraith raids, so it starts you with a Spawning Pool, a Hydralisk Den and 3 Hydralisks for anti-air (Roaches and Zerglings cannot hit air); add extra Hatcheries for production. Missions can define `startingBuildings` / `startingUnits` in `CAMPAIGN_MISSIONS` (`src/config.ts`). All three missions have been played start to finish (victory unlocks the next mission; defeat offers Play Again / Main Menu).

### Mission 1 cinematic: "Outpost 42069" (`src/cinematic/`)
Terran Mission 1 opens with a full-screen cinematic (its own renderer and scene over the paused match; skip with Esc / Space / Enter or the button). Colonel Smith is the detailed Marine model with the helmet and rifle hidden and the head of `public/models/cinematic/smith_src.glb` grafted on: `SmithHead.ts` bakes only the head meshes (and the Body mesh cut at the neck) out of the Mixamo-rigged source into static meshes, and `SmithMarine.ts` parents them to the Marine's head bone so they follow every clip. `SmithCinematic.ts` is the script: briefing title card, ops radio line, Smith slapping eight Marines (procedural arm swing on top of the idle clip, victims knocked back with the Death clip), then the close-up and the screen slap. Subtitles use TTS for the ops lines. Optional audio: put `smith_message.mp3` and/or `slap.mp3` in `public/audio/cinematic/` and they play automatically; otherwise Smith's transmission is a captioned placeholder and the slaps are synthesised. A mission opts in with `cinematic: 'smith_outpost'` in `CAMPAIGN_MISSIONS`; the old Banshee fly-in is now `intro: 'banshee'` on Mission 4. The sky is a procedural shader dome (gradient, nebula, stars, ringed gas giant, two moons, faint aurora). `public/audio/cinematic/soundtrack.mp3` is a 45 s clip (trimmed from the South Park clip "Slap Happy Mr. Gueermo", supplied by the project owner) played under the whole cinematic and faded out with the picture; replace it freely. The head model's author/licence is not recorded yet (supplied as `black_guy_2.glb`); add the credit before distributing.

Reliability notes: ground units that get wedged between cliffs and buildings automatically sidestep after about a second, raising/lowering a Supply Depot swaps its 3D model on host and guest, switching 1st/3rd-person view while a Siege Tank is sieged or mid-transform is safe, rejected pointer-lock requests are ignored, and the Vite dev server ignores relay socket errors so it keeps running if the relay is stopped or restarted.

Every faction has its own worker build menus, supply building, tech prerequisites (🔒 locked buttons), hotkeys and upgrade building. The Wraith has a movement bank/afterburner animation and a firing recoil animation.

### 🖱️ Context-Aware Cursor
A StarCraft II-style cursor (`src/input/Cursors.ts`): cyan arrow by default, **green ring** over your own units/buildings, **red ring with X** over visible enemies, **gold ring** over minerals/gas, **green ring with +** over a damaged/unfinished building while a worker is selected, and a **red crosshair** in attack-move mode.


## Combat Feedback & Readability

- **Death effects** (`graphics/DeathEffects.ts`): infantry keel over and sink, except Marines, which die in a way that fits the killer (`graphics/Dismember.ts`): the rigged model is baked in its current pose and split by bone into head / upper arms / forearms / thighs / shins / chest / hips / rifle, then regrouped by death kind: **shred** (~12 pieces), **blast** (2-4 limbs + rifle), **decap** (head pops off, body topples with the neck spurting), **halve** (cut at the waist, upper half thrown, legs topple, both stumps spurt), **partial** (1-2 pieces drop off, he falls over) or a plain **fall**. The killer (`Entity.killedBy`, recorded from the damage source on the killing blow) picks the kind by size = supply + hit damage / 6 + 5 for splash weapons: small killers (Zergling, workers, Marine) only drop him or knock a piece off; medium (Zealot, Hydralisk, Roach, Stalker) take pieces / heads; large (Immortal, Battlecruiser, Siege Tank in tank mode) decapitate, halve or blow apart; huge (sieged Tank, Ultralisk, Thor, Baneling, Colossus, Widow Mine) shred. Flamethrowers just drop him, Dark Templar cut, Ghost/Nova snipe the head; an unknown killer gives a random mix (`DeathEffects.marineDeath` forces one kind for testing). Flying pieces leave on random headings away from the death spot with random launch angle, power and spin (none / a little / a lot, random axis); every part is a small rigid body (gravity, ground contact and friction) that bleeds and lands in a blood pool. Bodies topple like a hinged pole from the feet and stop dead on the ground; thrown bodies land without bouncing. **Hydralisks** get the same treatment with green ichor (drops, trails, spurting stumps, pools): their single skinned mesh is split per triangle by dominant bone into head / hood / hood plates / upper arms / scythes / chest / belly / tail base / tail / tail tip; decap takes the head and hood, halve cuts at the waist (upper body thrown end over end, the tail half flops), partial drops a scythe arm or hood plate, and the body always falls to its left or right, never forward or back (pieces that come to rest upright tip onto their side). `DeathEffects.hydraliskDeath` forces one kind for testing. Each unit's split is a `RigProfile` in `Dismember.ts` (`MARINE_RIG`, `HYDRALISK_RIG`: bone names → parts, which parts go where, fluid, stump bones, sideways falls), so other rigged units can be added with a new profile. A sign error in the ground-contact torque that pumped energy into big tumbling bodies was fixed. Everything sinks away after ~9 s; vehicles blow apart into debris and leave a smoldering wreck; aircraft spin down trailing fire and crash; Zerg splatter ichor and squash; Protoss implode in an energy burst. Buildings collapse over ~2 s with staggered secondary explosions, then leave a rubble pile, scorch/ichor mark and smoke that fade over time.
- **Zergling / Hydralisk / Roach / Drone / Larva / Egg colouring**: both are dark purple / maroon with bone-bronze talons, fangs and spikes, and their carapace (the Zergling's back and head, the Hydralisk's hood, head and shoulders) is painted in the owner's colour by a `mask` mode in `graphics/TeamColor.ts`. The Zergling's palette and per-vertex carapace mask are baked by `tools/model/build-zergling.ts` (`bun tools/model/build-zergling.ts ~/Desktop/zergling__starcraft_2.glb`). The Hydralisk's green painted texture is repainted at load (`graphics/ZergSkin.ts`: hide to purple, bone kept, armour plates turned into a mask limited to the upper body by rest-pose height), and it is now lit instead of unlit, with glossier chitin on the carapace. The **Roach** uses the same repaint with its own profile (`ZergSkin.ts` `roach`): the olive shell becomes bronze-tan bone, spines / fans / teeth ivory, and the purple flesh and side blades take the owner's colour. The **Drone** is baked by `tools/model/build-static.ts drone` with a per-vertex `_TEAMMASK` attribute: spine segments, ribs (found by how far each vertex stands out of a smoothed copy of the mesh), claws and underside are bronze, the wing membranes between the ribs are the team colour. The **Larva**'s texture is one pale veined grub with no shell / flesh split, so its profile (`ZergSkin.ts` `larva`) adds a geometry pass: each rest-pose triangle's UV footprint is painted with how much it faces up, giving an upward-facing bronze-tan shell with a team-coloured strip along the spine, maroon-purple flanks and belly, ivory tusks and a dark eye. The **Egg** (`ZergSkin.ts` `egg`) keeps its bronze shell and spikes, its root membrane turns maroon-purple, and the glowing green sacs take the owner's colour with a faint team-coloured glow (`userData.teamGlow`, TeamColor mask mode); its old green emissive map is dropped. Dev preview for both teams: `/dev/zerg-preview.html` (`?only=larva,egg` for a closer look, `?tex=1` / `?tex=roach|larva|egg` shows a repainted texture and its mask).
- **Liquid melts** (`graphics/LiquidMelt.ts`): deaths spill 1-5 blobs of liquid that slump and spread into puddles, linger, then soak into the ground: dark red blood (Terran infantry), royal-blue blood (Protoss), green ichor (Zerg units and structures) and molten metal (Terran vehicles). Sizes step down sharply within one death (one blob = a big pool; more blobs = smaller ones), and about half the extra blobs overlap a bigger one so they merge. The flipbook is `public/models/fx/liquid_melt.glb`: 24 frames of 900 triangles baked by `tools/bakeLiquidMelt.ts` from "T1000 Liquid Metal" by designidentity on Sketchfab (CC-BY-4.0; 34 MB, 101 frames of ~14k triangles, played in reverse and cut before the puddle splits into droplets). Units without an explicit death style now get blood by race (Ghost, Nova, Reaper, Queen, Baneling, Ravager, Ultralisk, Lurker, Infestor, Sentry, Templar, Disruptor) instead of the vehicle explosion.
- **Selection** draws a subdued yellow 3D ring of 8 short, equal dashes on the ground under each selected unit / building (`Decals.updateSelectionRings`); the white selection silhouette was removed (hover outline kept).
- **Attack range ring**: selected armed units and structures get a faint outline of small, widely spaced outward-pointing white triangles on the terrain at their weapon range (`src/graphics/RangeRings.ts`). Each entity shows one ring at its widest weapon range: radius = that range + the unit's radius (structures use their own radius; a garrisoned Bunker uses its marines' range with the +1 bunker bonus). The range follows the unit's current mode and range upgrades (Siege Tank 7 / sieged 13, Thor 10 / 11, Viking 9 / 6, Lurker + Seismic Spines) and switches to the new mode's range as soon as a mode change starts. With several units selected only the outer envelope of their combined reach is drawn (arcs inside another selected unit's circle are hidden; identical circles are merged). The ring follows the terrain height, melee and unarmed units show none, and nothing is drawn above 40 armed selections.
- **Worker capacity badge**: a selected town hall shows an SC2-style "Workers: 6/16" plate above it (`src/ui/WorkerBadges.ts`): workers assigned to the mineral patches in its base vs. 2 per patch; selected Refineries/Extractors/Assimilators show n/3. The text turns red when over-saturated. Styled in Exo SemiBold 16px (loaded from Google Fonts in `index.html`), bright white on a near-opaque dark plate with a light-blue border so it reads clearly over the terrain.
- **Click picking** raycasts against the visible model, not the ground footprint (selection, hover cursor, right-click targets). Ground decals that are part of a model (a Pylon's power-field disc, the contact shadow under structures) are ignored, so tapping or clicking the ground inside a power field moves your units instead of selecting the Pylon.
- **Health bars** are always shown on every visible unit and building; the plate is blue for yours and red for the enemy, and the fill goes green to red with health.
- **Readability**: small units are enlarged, ground units get a team-coloured ground ring, (the old floating letter badges above units were removed). Every unit type also gets distinctive silhouette parts (`graphics/SilhouetteFeatures.ts`: marine flag antenna + shoulder pads, marauder pauldrons, zergling spikes and scythes, hydralisk crest, archon halo, wingtip bars...). Unit models also grow up to 1.7x as you zoom out, so they never shrink to specks. Silhouettes are also differentiated by proportion (tall marines/zealots/hydras, squat zerglings/roaches) and by race-shaped ground markers (Terran circle, Zerg triangle, Protoss hexagon).
- **Set Rally button**: every structure that trains units has a flag **Set Rally** button on its command card (hotkey `Y`) on desktop, iPad and phones; press it, then click / tap the ground, a mineral field or a Bunker. Right-click does the same on desktop. With several structures selected (e.g. a box of Gateways) all of them get the same rally point.
- **Idle worker / Army buttons** (`src/ui/QuickSelect.ts`): two SC2-style buttons just above the minimap on every device. The worker button shows how many workers are idle (greyed when none) and each press selects the next idle worker and centres the camera on it; the army button selects every combat unit. Hotkeys **F1** / **F2**.
- **Edge scrolling**: move the mouse into the outer 80px of the window to scroll the camera (faster toward the very edge), as in SC2. Disabled on touch devices.

- **Surface detail** (`graphics/SurfaceDetail.ts`): faceted round parts are re-tessellated smoother, and every unit and building material gets a procedural panel-seam / rivet / scratch / grime bump map so models read less flat.

## Environment & Material Polish
- **Lush terrain**: grass is the default ground; base/trail clearings are smaller and use mossy stone-slab tiles blending into packed dirt, with moss and bare-dirt blotches across the meadow.
- **Scenery** (`Scenery.ts`): instanced pine/oak forest belt around the map edge, rock outcrops, bushes and drifts of flowers, plus a surrounding meadow plane. All of it respects fog of war.
- **Materials** (`SurfaceDetail.ts`): every hard-edged box mesh is replaced at load by a bevelled RoundedBoxGeometry with triplanar world-scale UVs; every model gets a grime/panel-line/worn-edge albedo map on top of the bump map; Terran buildings get yellow/black hazard-stripe trim around their footprint.
- **Lighting**: warm sun, cool sky/warm-grass hemisphere light, softer shadows, soft contact-shadow blobs under every ground unit and building, and an HDR bloom pass (EffectComposer + UnrealBloom + OutputPass) for glow lights.
- **Building silhouettes** (`BuildingDetail.ts`): every building gets race-specific sculpted add-on meshes — Terran corner buttress columns (not on the Command Center), glowing roof vents, pipe run and antenna mast; Zerg chitin spire ring and glowing sacs; Protoss gold corner spires with a floating crystal and halo.


## 💎 Resources, Flyers & Cliffs (latest)

- **Minerals** (`ModelFactory.createMineralPatch`): faceted translucent-looking blue crystal clusters - 5-8 hex-prism shards in four blue shades with randomized height, lean, tip shape and layout, so no two patches match.
- **Vespene Geysers** (`createVespeneGeyser`): three rust-orange volcanic vents on scorched ground, each with a glowing green mouth and a rising green gas plume.
- **Flying units** cruise at `Unit.CRUISE_ALTITUDE = 7.5` (was 3.2), clearing buildings such as the Command Center.
- **Cliff walls** (terrain shader in `Renderer.ts`): craggy blue-grey slate with layered blocks, dark cracks, lit ridges, mossy crevices and a screen-space bump normal, instead of flat gray.


## 🧠 SC2 Mechanics Pass (abilities, economy, combat, vision, AI, terrain)

Implemented in [`Mechanics.ts`](src/simulation/Mechanics.ts) plus the unit / building / AI code.

- **Tech & units:** new Terran **Hellion** (Factory, line splash vs light), **Thor** (Factory + new **Armory**), Zerg **Queen** (Spawning Pool), Protoss **Sentry** (Gateway). New **Armory** building (vehicle/ship weapons & plating) and Forge **shield** upgrades.
- **Abilities (energy / cooldown, command card + hotkeys, click-to-target):** Wraith **Cloak**, Command Center **Scanner Sweep** and **MULE**, Roach/Zergling/Hydralisk **Burrow**, Queen **Inject Larva** and **Transfuse**, Stalker **Blink**, Nexus **Chrono Boost**, Sentry **Guardian Shield** (plus the existing Stim and Siege). Energy regenerates at 0.7875/s. Abilities are host/single-player only in online matches.
- **Economy:** one worker mines a node at a time (2 per patch is optimal; extras hop to a free patch or queue), gas trips are 4, **MULEs** drop 25/trip for 64s, **Chrono Boost** speeds production 50%, and Zerg units now cost **Larva** (3 max, +1 per 11s, **Inject** gives +3 every 29s). Larva are real, selectable units (`models/larva.glb`, logic in `src/simulation/Larva.ts`): click one (or Hatchery -> **Select Larva**, `S`; double-click / Ctrl-click selects all on screen), pick a unit on the larva's command card (or its hotkey) and the larva becomes an **Egg** (200 HP, 10 armor) that hatches in place after the build time; one press = one unit, a Zergling egg hatches a **pair** (50 minerals, 1 supply), cancelling an egg (Esc) refunds everything and returns the larva, **waypoints**: right-click with larva and/or eggs selected (one or a group) to set where their units go once hatched (ground = move, mineral/gas = drones start gathering, friendly building = its position); larva pass the waypoint on to the egg they become, a dashed line shows it while selected, and without one the Hatchery rally applies (guests relay it to the host as `lrally`), larva die with their Hatchery, eggs still hatch, and units only attack larva / eggs when nothing else is in range. Multiplayer snapshots carry each larva's Hatchery, slot and egg progress.
- **Combat:** attributes (light / armored / biological / mechanical / massive / structure) now drive **bonus damage** (it never applied before), armor reduces damage with a 0.5 floor, **Protoss shields** absorb first and regenerate after 7s (shield bar on the health bar, shield armor upgrades), and attack/armor upgrades are split by class (infantry / vehicle / ship).
- **Workers don't fight on their own:** SCVs, Probes, Drones and MULEs never auto-attack or chase enemies (an explicit Attack or Hold Position order still works). An idle worker that gets hit runs about 6 tiles straight away from the attacker; workers that are mining or building keep working.
- **Vision:** cloaked / burrowed units are hidden from enemies unless a **detector** (Missile Turret, Photon Cannon, Scanner Sweep) covers them; high ground still blocks low-ground sight; Scans reveal their area.
- **Pathing & control:** group move orders fan out into a formation, idle units are pushed aside by moving ones, hold-position and burrowed units are immovable, **Shift-queue** works for move / attack / attack-move / gather, **Tab** cycles the active subgroup, **Ctrl+click** selects all on-screen units of a type.
- **AI tiers:** new **Elite** and **Cheater** difficulties. From Veteran up the AI **scouts** your base and counter-builds (anti-air vs air, roach/zealot vs bio, etc.), uses MULE / Chrono / Inject / Scan; Commander adds stim, upgrades, expansions and **worker-line harassment squads**; Grandmaster+ uses cloak / burrow / blink; Cheater has perfect knowledge and 2.4x income.
- **Terrain:** **destructible rock walls** (right-click with combat units; they block pathing until destroyed), three elevation tiers on Lost Temple (low ground / mains / raised mains), and the existing expansion layouts.

## 🆕 Latest Round of Changes

- **Game speed**: unit stats in `config.ts` are already StarCraft II "Faster" values (Liquipedia), so the simulation runs at 1.0x for real ladder pace. The game used to multiply that by 1.4 again, which made everything 40% faster than SC2. **Options > Gameplay > Game Speed** has a slider (0.50x–2.00x on SC2's scale, where Normal is 1.0x and Faster is 1.4x) plus a preset dropdown that moves the slider: Slower / Slow / Normal / Fast / Faster (default) / Turbo (1.96x, the old pace). See `src/settings.ts`. Multiplayer always runs at Faster.
- **Brightness**: **Options > Graphics > Brightness** (50–150%) scales the renderer's tone-mapping exposure and lifts the ambient fill, so dim or washed-out screens can be tuned without crushing blacks.
- **Unit sets**: `UNIT_SETS` in `config.ts` decides which units the production menus offer. `multiplayer` (default for skirmish and online) is the current SC2 ladder roster and hides Firebat, Medic, Goliath, Wraith and Odin; `campaign` (default for campaign missions) and `everything` show them all. Legacy units stay fully registered, so a set or mission can switch them back on.
- **SCV construction**: like SC2, a Terran structure only progresses while one SCV welds it, taking exactly its listed build time. It pauses when the SCV leaves or dies, and any SCV can resume it by right-clicking it. A second SCV can't speed it up. Shift-placing keeps the ghost up and queues more structures for the same SCV.
- **Hover outline**: hovering a unit, building or resource draws a silhouette outline in a different colour from the selection ring - green for your own, red for enemies, cyan for minerals/geysers (`Outline.setHover`). The selection outline was also made calmer: it stays below the bloom threshold (no glow flicker) and is slightly thicker so edges don't crawl.
- **3rd-person firing**: shots now leave from the model's real muzzles (wing cannons, rifle tip, barrels) in 3rd person, exactly like the RTS view.
- **Ground cover**: bushes and rocks use precomputed per-face normals instead of shader flat shading, which rendered about half of them black on some GPUs.
- **Resource placement**: expansion mineral arcs and geysers sit on the side of the town-hall spot away from the main attack lane (never on cliffs, ramps or the walkway).
- **Top bar**: FPS and game time moved next to the settings cog (top right).
- **Mission objectives** (top left, under the system buttons, SC2 style): green **Main Objectives** / **Bonus Objectives** headers with a small triangle, one checkbox per objective (green tick when done, red cross when failed, the current one in white, bonus ones dimmer), counts like `(1/3)` in green, mission lines in blue italics, all on a dark backing that fades out to the right. Click / tap a header to fold the list away. Built by `MissionRuntime.hudHtml()`; skirmish shows the match goal with the enemy structures remaining. It replaced the old top-right bubble and 🎯 icon.

### 📱 iPad / Touch Controls

**HUD size**: phones (shorter screen side under 600px) get the compact HUD (`touch-compact` class: small minimap, contextual dock, pop-up command card). Tablets / iPad get the full desktop bottom bar (minimap, selection panel, always-visible 5x3 command card, with each button's name printed under its icon since touch has no hover tooltips) with the same touch gestures, plus a Groups button above the minimap.

No keyboard needed. Gestures (in `InputHandler.ts`): **tap** = select / (with units selected) move, attack or harvest; tapping one of your own structures with units selected gives the order instead of selecting it when a selected unit can act on it (worker + Refinery / Assimilator / Extractor = gather gas, Marine / Marauder + Bunker or ground unit + Nydus = enter, worker + damaged / unfinished building = repair / build, loaded worker + town hall = return cargo; otherwise it selects; with **Add** on it always just adds to the selection); **one-finger drag** = pan the map (the ground follows your finger); **two fingers** = the selection rectangle (the two touch points are opposite corners; lift to select); **long-press** = add to / toggle in selection (on empty ground: deselect); taps and long-presses are forgiving: one that misses every model snaps to the nearest unit within 32px on screen (18px if it landed on a structure; your own units win close calls; a tap on a mineral field or geyser never snaps, so workers can still be sent to harvest); **drag on the minimap** = move the camera. The on-screen controls (`TouchControls.ts`, shown on `pointer: coarse` devices or with `?touch=1`) are one contextual **dock** at the bottom right plus one small **Groups** icon above the minimap. The dock shows only what matters for the selection: nothing selected = **Home** (jump to base); a worker = **Build / Advanced / More** (Build pops up the structure list); army units = **Attack / Stop / More**; a structure = its own command-card buttons right in the dock (Nexus: **Probe / Mothership / Chrono Boost / Rally**, Forge: its three upgrades), so the common actions are one tap; costs, locks, cooldowns and research countdowns match the card, and when a structure has more buttons than fit (as many as the screen width allows) the first few are shown plus **More** for the full card; plus **Cancel** whenever something is selected or being placed. Dock buttons use the SVG button icons from `public/icons` (Cancel, Attack, Stop, and the race's Build / Build Advanced structure icons; Zerg uses Hatchery / Hive) on green command-card-style buttons (Cancel is red). **More** opens the full command card as a pop-up (it closes after an action, on a new selection or a tap outside; names are shown under the icons in 11px text that is never cut off (the icon shrinks to leave room, long words hyphenate) and the cost sits in the top-right corner; the pop-up is 370x236). Directly above the minimap are the **Idle worker** (with the idle count) and **Army** buttons, always visible, with the **Groups** icon one row above them. The **Groups** icon holds control groups **1-5** (tap to recall, `Set` then a number to assign) and **Add** (add-to-selection mode). The minimap is always bottom-left with its reset / **-** / **+** zoom buttons always visible in its top-right corner, and the top bar is two rows (resources and buttons, then FPS and the timer left-aligned). While possessing a unit (1st/3rd person) it shows a virtual stick, **Fire** (hold to repeat), **Alt**, **Boost**, climb/dive, view toggle and exit; dragging the screen aims. On tablets (where the dock is hidden) a red **Deselect / Cancel** button sits above the command card whenever something is selected, placed or targeted. Command-card buttons fire the moment a finger (or mouse button) presses them, so one tap queues exactly one Probe even if the card redraws or the finger drifts during the tap. A finger that lands on a HUD button clears any half-finished map gesture, and the Menu button also answers `touchend`, so it keeps responding on iPad. Edge scrolling is disabled on touch, page pinch/double-tap zoom is blocked, and the page declares the iOS standalone (Add to Home Screen) meta tags.

### 🗺️ Lost Temple (2x map)

A 240x240 four-player-style map inspired by StarCraft's *Lost Temple*: four corner high-ground mains with carved ramps toward the centre, X-shaped sand trails, a ring of naturals and a central temple of four mesas leaving open diagonal lanes. Pick it in **Skirmish -> Map**. Terrain, fog, creep and minimap are built once per page load at the map's size, so choosing a map with a different layout reloads the page into it and starts the match automatically (it is therefore skirmish-only; online matches use the standard-size maps). Layouts live in [`maps.ts`](src/maps.ts).

### Round 3 tweaks

- **Geyser capping**: a Refinery / Extractor / Assimilator hides the geyser's rock vents underneath it.
- **Geyser alignment**: geysers are snapped to a cell centre when spawned and block an exact 3x3 of pathing cells, so the Refinery / Extractor / Assimilator footprint sits exactly on the geyser (previously generated expansions had off-grid geyser centres and the gas building was misaligned with the pathing grid).
- **Scale pass (Terran)**: after a side-by-side check, the Supply Depot is 2.1, Barracks 3.1, Thor 2.4 tall, and SCV / Marine 1.05 tall (`size` in `RiggedModels.ts`), so units and structures keep SC2-like ratios.
- **Scale pass (buildings)**: Nexus enlarged (GLB length 4.4); the oversized procedural Roach Warren, Extractor, Overlord Pod, Spine Crawler, Stargate, Forge and Assimilator are scaled down via `PROCEDURAL_SCALE` in `ModelFactory.ts` so every structure is proportional to its footprint.
- **Scale pass**: unit models are sized against SC2 proportions (an SCV is roughly a third of a Factory's width; Zerglings and Marines are about a tile long) via the `size` fields in `RiggedModels.ts` and `UNIT_VISUAL_SCALE` in `GameWorld.ts`.
- **Real Zerg structure models**: the Roach Warren, Hydralisk Den, Spine Crawler and Extractor (`models/*.glb`) are the textured StarCraft II ports from Renn01's "Zerg Building Pack (Starcraft 2)" on Hive Workshop (fan port of Blizzard artwork, credited in-game). `tools/model/build-zerg-mdx.ts` converts the pack's Warcraft 3 `.mdx` + `.blp` files (via the `war3-model` dev dependency): static bind pose, Z-up to Y-up, scaled to the footprint, diffuse and emissive textures embedded as PNG. Usage: `bun tools/model/build-zerg-mdx.ts <pack-folder> <Model.mdx> <out.glb> <length> "<title>"`. The pack's other buildings are converted too (`baneling_nest`, `evolution_chamber`, `lurker_den`, `nydus_network`, `queens_nest`, `spire`, `greater_spire`, `ultralisk_cavern`, `spore_crawler`, `creep_tumor`, `nydus_worm`), awaiting game structures. There is no Lair model in the pack. `tools/model/build-zerg-stl.ts` converts Oyvindtk's Thingiverse STLs (CC BY 4.0); the converted Hydralisk Den, Sunken Colony and Evolution Chamber are kept in `public/models/thingiverse/`.
- **All pack structures and units wired in, with SC2 tech rules**: every converted structure is a real buildable structure with its Hive Workshop model, and each one now does its SC2 job.
  - **Zerg:** Evolution Chamber researches ground attack/carapace (Spawning Pool no longer does) and Spire researches flyer attack/carapace. Spawning Pool researches Metabolic Boost, Baneling Nest researches Centrifugal Hooks and Ultralisk Cavern (needs a Hive) researches Chitinous Plating. Baneling Nest unlocks Banelings, Spire unlocks Mutalisks, a Spire evolves into a Greater Spire (100/150, 71s, needs a Hive) which unlocks Brood Lords, Hive unlocks Vipers, and the Lurker Den unlocks the **Lurker** (attacks only while burrowed, line splash, range 8). Spore Crawlers hit air and detect cloaked units.
  - **Zerg abilities:** Queens plant **Creep Tumors** (25 energy, on creep; burrowed, spread creep to range 10, and each seeds one more tumor). The Nydus Network summons **Nydus Worms** anywhere you can see (75/75, 14s). Right-click any Nydus structure with ground units to send them in, then select the Network or Worm you want and press **Unload All**: units come out where you unload.
  - **Protoss:** Cybernetics Core unlocks Stalkers, Sentries, Adepts, the Stargate, Twilight Council and Robotics Facility, and researches air weapons/armor. Twilight Council researches Charge, Blink (Stalker Blink is locked until then) and Resonating Glaives, and unlocks the Templar Archives and Dark Shrine. The Robotics Facility builds Immortals and Colossi (Colossus needs the Robotics Bay, which researches Extended Thermal Lance), Templar Archives unlocks Archons, the Dark Shrine unlocks the permanently cloaked **Dark Templar**, the Fleet Beacon unlocks Carriers and Tempests, and the Shield Battery restores shields to allies in range 6 using its energy.
  - **Terran:** new **Viking** (Starport, air-only) and **Widow Mine** (Factory); the Raven casts **Auto-Turrets** (50 energy, 10s, hits air and ground).
  - **AI and tech rules:** there are no AI-only shortcuts any more: every player (human, skirmish AI, multiplayer) needs the real structures. The AI builds the real tech chains (Zerg: Pool, Roach Warren, Lair, Hydra Den, Spire, Evolution Chamber, Infestation Pit, Hive, Greater Spire, Lurker Den, Ultralisk Cavern; Protoss: Gateway, Cybernetics Core, Stargate, Forge, Twilight, Robotics, Robotics Bay, Fleet Beacon, Dark Shrine) and researches/morphs by difficulty (`ZergAI.ts`).
  - **Research takes time, one per building:** every upgrade and tech research is paid up front, runs for its SC2 research time on a free host structure (`UPGRADE_LEVELS` / `RESEARCH` in `config.ts`; Chrono Boost speeds it up, click the progress button to cancel for a full refund). Level 2 / 3 need Lair or Hive (Zerg), Twilight Council (Protoss) or Armory (Terran). Costs and times were typed from memory of the current balance patch because Liquipedia could not be fetched this session: verify them before treating them as exact.
  - **Lair and Hive are Hatchery evolutions** (150/100, 57s; 200/150, 71s; needs Spawning Pool / Infestation Pit): larva, queens and supply carry over. Lair gates Hydralisk Den, Infestation Pit, Spire, Nydus Network, Overseer and level 2; Hive gates Ultralisk Cavern, Greater Spire, Vipers and level 3. Evolution Chamber has the three SC2 lines (Melee, Missile, Carapace). The Hive model shows once a Hatchery reaches tier 3; the Lair uses the Hatchery model.
  - **Unit morphs** (`UNIT_MORPHS`): Overlord to Overseer (detector), Hydralisk to Lurker (Lurker Den; Seismic Spines research gives +2 range with a Hive), Zergling to Baneling, Roach to Ravager and Corruptor to Brood Lord (Greater Spire). The unit is a helpless cocoon while it morphs. Corruptor comes from larva (Spire).
  - **Protoss:** High Templar (Feedback; Psionic Storm after research) and a real **Archon** (select two High/Dark Templar and press T: 12s merge, 10 life + 350 shields, splash). **Warp Gate** research turns Gateways into Warp Gates (7s): warp units in at a Pylon power field with the SC2 per-unit gate cooldowns.
  - **Widow Mine (5.0.17):** speed 3.94; burrow (B) takes 2.14s (unburrow 0.71s), then a target must stay locked for 1.07s (leaving range cancels it, no cooldown spent). Sentinel Missile: 125 (+35 vs shields) primary, 40 (+25 vs shields) splash in radius 1.5, armor/upgrades ignored, hits friendly units and structures but not friendly Widow Mines; 29s reload, during which the mine is revealed unless **Drilling Claws** (Tech Lab, 75/75, 79s, needs Armory) is researched, which also burrows 3x (0.71s) and unburrows 2x (0.355s) faster. Two mines never auto-target the same unit; burrowing within range of enemy units gives them an attack alert (not for already-burrowed mines); burrow state, reload and Drilling Claws sync to multiplayer guests, whose Burrow orders go through the host. Burrow now applies to every selected unit.
  - **Still missing / approximate:** Dark Templar and Lurker reuse the Zealot / Hydralisk models, Overseer / Corruptor / High Templar reuse Overlord / Mutalisk / Zealot models (tinted); Lair and Warp Gate have no distinct model; no Changeling (see `docs/roster-audit.html`, regenerated by `bun tools/roster-audit.ts`); the Brood Lord, Baneling and Ravager morphs can't be cancelled; research hotkeys are only wired for a few buildings; Terran Combat Shield still researches at the Engineering Bay (not a Barracks Tech Lab).
  - **Roster audit:** `docs/roster-audit.html` (generated by `bun tools/roster-audit.ts`) compares the current SC2 multiplayer roster with the game: presence, how each item is obtained, model status and abilities, colour coded. Report only.
- **Zerg Extractor**: now the pack model above (the old procedural one was built by `tools/model/build-extractor.ts`). A drone ordered to build one walks up to the geyser and morphs into it immediately. A finished Spine Crawler (or any structure whose config has no armor type) no longer blanks the selection panel.
- **Refineries**: a worker that finishes a Refinery / Extractor / Assimilator immediately starts harvesting its geyser (unless it has a queued order). The Probe that warps in an Assimilator starts harvesting it when it finishes, if that Probe is idle by then.
- **Rally / waypoint lines**: now bold dashed ribbons draped over the terrain - gold dashes on a dark under-stroke - so they read on grass, sand and rock (they were 1px lines).
- **Rally points are production-only**: only structures that spawn units (`Building.canRally`: non-empty `produces`, e.g. Command Center, Barracks, Gateway, Hatchery) have a rally point; utility / add-on structures (Tech Lab, Supply Depot...) have none and ignore right-click. The dashed line is drawn only for a single selected, grounded production structure, showing just that structure's waypoint.
- **Favicon**: `public/favicon.svg` / `favicon.ico` added (no more 404).
- **Marine** shoulder pauldrons are smaller and less bulbous.
- **Zergling** (`ZerglingModel.ts`, `ZerglingAnimator.ts`, generated `zerglingData.ts`): built from a high-poly sculpt (2.8M triangles, untextured parts) that `tools/model/build-zergling.ts` decimates offline with meshoptimizer to ~6.2k triangles in 14 rigid parts (body, head, jaw, eyes, 4 tail segments, 2 arms, 2 legs, 2 feet) with palette + baked-shading vertex colours (no textures). One shared material/geometry set serves every zergling, with a three-level LOD: full 14-part rig up close (< 30 units), a merged 6-mesh rig at normal zoom (30-64), and a single static mesh zoomed out. The animator drives a gallop from real ground speed (bounce, swaying head, whipping tail, alternating legs and counter-swinging scythe arms), a lunge-and-snap on attack and a breathing idle, only for the level that is showing. Regenerate with `bun tools/model/build-zergling.ts <path to .glb>` (`BUDGET=0.8` for more detail, `WINGS=0` to drop the dorsal fins).
- **Mineral chime** (worker deposit sound) is quieter.

### 3D model credits (`src/credits/modelCredits.json`)

Every `.glb` under `public/` carries its Sketchfab author / licence / source URL in the file's `asset.extras`; `python3 tools/model/credits.py` reads them (plus the original downloads' metadata for models rebuilt by `tools/model/`, whose metadata was lost) and writes `src/credits/modelCredits.json`, grouped per source model with `used` flags, ready for an attribution screen. 74 source models (41 used by the game): most are by **Catholomew** (CC-BY-NC-4.0, non-commercial only); the rest are CC-BY-4.0 (woodsquid, Elisey (Marine), Veterock (Colonel Smith's head), AEGISPROJECT (Firebat), Csaba Baity (Medic), np-dev (Refinery), Medv3D (Bunker), dante6686 (planet) ...). The three Supply Depot models are the project owner's own work (listed under `ownWork` in the JSON); `unknownAuthor` lists any file whose author cannot be determined (currently none). Sounds and music are not covered yet.

### Sample sound effects (`public/audio/sfx/`)

One-shot samples loaded by `SoundSystem` (`SFX_FILES`, played with `playSfx` / `playSfxOf`; every call falls back to the old synthesised sound if a file is missing):

- **Weapons**: `marine` (+ `8-shots-rapid-fire` burst), Siege Tank `cannon1` / `cannon2` (siege mode) and `tank-mode-attack` (tank mode, also used in FPS mode), `squish-fast` / `squish-fast-loud` (Zergling / Ultralisk / Roach).
- **Transforms / flight**: `go-into-siege-mode` / `go-into-tank-mode`, `lift-off` / `land` (Terran buildings).
- **Deaths / explosions**: `terran-death1..5` (random, Terran infantry), `zerg-death-splat` (Zerg units), `medium-explosion` / `big-explosion` (vehicles, air, Protoss; big for tanks / Thor / Archon), `building-collapse` (+ medium blast) for Terran / Protoss structures and `zerg-building-die` for Zerg structures.
- **Spawning / building**: `probe` (Probe select / order), `protoss-warp-in` (Protoss units warping in and Protoss structures placed), `larva-hatch-squish-short` (Zerg unit hatches), `zerg-create-bldg` (Zerg structure placed).
- **Zerg voices**: `growl1..11` (clips cut from a long growl compilation, rate-limited; used on select / orders, pitched up for Zerglings / Drones / Banelings), `deep-growl` (Brood Lord) and `ultralisk-hello` (Ultralisk), the latter two also when those units hatch. Per-unit pools in `playZergGrowl` add the `zg-roar-*` / `zg-growl-trex` / `zg-flyby` roars (Mutalisk, Hydralisk, Roach, Queen, Ravager, Zergling, Ultralisk, Brood Lord, Viper) and `zg-sniff1..8` (Drone, Overlord, small Zerg). Deaths: `zg-die-muta` (Mutalisk; pitched down for Overlord / Brood Lord), `zg-die-big` / `zg-roar-trex` (Ultralisk, Brood Lord, Queen).
- **Zerg weapons and structures**: `hydralisk-attack` (Hydralisk; pitched up for the Queen, down for the Spine Crawler and Lurker), `zerg-fling` (Mutalisk Glaive Wurm, Brood Lord, Corruptor, Spore Crawler), `zerg-attack` (Drone, Swarm Host, half of Zergling bites), all routed through `playZergWeapon`. Clicking a Zerg structure plays `zerg-hatch-sound` (Hatchery / Lair / Hive) or a random slice of `zerg-slime` (others), and the same sounds play when a Zerg structure finishes. Larva / Egg selection, orders and a larva starting to morph play a slice of `larva-egg-slime`. Small Zerg deaths (Zergling, Drone, Baneling, Larva, Egg) alternate `zerg-small-death` and `zerg-squish-pop`; `zerg-squish-pop` also alternates with `larva-hatch-squish-short` when an egg hatches. Spore Crawlers now actually fire (an acid glob that deals their damage).
- **Protoss voices and sounds**: `playProtossVoice` plays `pr-speech1` / `pr-talk1` / `pr-radar1..2` chatter (infantry, Sentry; five quick clicks escalate), `pr-move1..2` and `pr-activate` servo sounds (machines, move orders, unit ready), `pr-comm1..3` (attack orders) and `pr-probe1..5` (Probe); `pr-mechdie1..3` are the Protoss death sounds. `playProtossWeapon` plays `pr-laser`, `pr-laser-quick` and `pr-laser-short`, pitched per unit (Stalker, Sentry, Adept, Immortal, Colossus, Carrier, Tempest). These are stand-in sound effects, cut from user-supplied clips with ffmpeg.
- **Void Ray Prismatic Beam** (`src/graphics/VoidRayBeams.ts`): a continuous beam that reaches the target instantly and stays lit while the Void Ray attacks: a thin white core inside a cyan glow and a soft blue haze, electric arcs curling from the three forward prongs (the model's `Vol_Target 03..05` nodes) into a bright focus at `Ref_Weapon 01` just ahead of the nose, light crackle along the beam and a glowing splash on the target. Damage lands instantly every tick (6 +4 armored every 0.36s). `void-ray-beam.mp3` loops (`SoundSystem.setLoop` / `stopLoop`, one positional loop per firing Void Ray, volume set directly so Safari / iPad play it, with a 30ms fade-in so it starts without a pop). Beam and sound stop together within a frame or two of the attack ending (target dead or out of range, new order, Void Ray dead), and a watchdog cuts them when the game pauses or the match ends.
- **Photon Cannon**: fires a small ball of white energy with a blue fuzzy edge that follows its target, then swells ~18% and fades on impact (`ParticleSystem.spawnPhotonBall`), with `photon-cannon.mp3`.
- **Machine gun / deep boom**: `playMachineGun` plays a trimmed burst of `machine-gun.mp3` for the Auto-Turret, Viking Assault mode and the Goliath's ground autocannons; `playDeepBoom` (`deep-boom.mp3`) is the Planetary Fortress cannon and the Thor's ground cannons (both Thor modes).
- **Banshee Backlash Rockets**: each attack launches two rockets together, one from each side launcher, one 12-damage hit each (SC2: 12 x2).
- **Bullet weapons (Marine, Ghost / Nova, Reaper, Goliath's guns)**: no projectile; `ParticleSystem.spawnBulletFlash` shows a soft teardrop muzzle flash (`spawnMuzzleFlashDir`, a canvas-drawn sprite on two crossed planes, 0.07 s) at the gun tip and the damage lands at once. Rigged models without a muzzle node get one via `muzzleAt` (a point parented to a bone) in `RiggedModels.ts`.
- **SCV**: `repair` plays while an SCV builds or repairs (restarts at most every 1.1 s).
- **Cinematic**: `futuristic-whoosh` (Smith's slap whoosh).
- `tempest.mp3` is included but unused until a Tempest unit exists.

The main menu plays `public/audio/music/menu_theme.mp3` (looped, at the music volume) instead of the music decks while it is open; it stops when a match starts.

### Sounds still procedural (need real samples)

These are still synthesised in `SoundSystem.ts` (Web Audio oscillators / noise) or spoken with browser text-to-speech; replace them with sample files (`public/audio/sfx/`, played via `playSfx`) when available:

- Lock-on beep (`playLockOnTone`)
- Bullet whiz (`playBulletWhiz`)
- Projectile impacts: bullet and acid (`playProjectileImpact`; shell and energy now use samples)
- Medic heal beam (`playHealBeam`)
- SCV welding / repair (`playWelding`)
- Command confirm blip (`playCommandConfirm`), error buzz (`playError`), under-attack alert (`playUnderAttackAlert`)
- Resource deposit chime (`playResourceDeposit`)
- Pilot comms open / radio blip / close (`playStarFoxComms*`)
- Cinematic: slap thump and alarm blips (`SmithCinematic.ts`)
- Protoss unit voices (Zerg select / order sounds are now all growl, sniff or slime clips), the Solaris spoken lines and the cinematic ops lines (browser text-to-speech via `speak`; only Terran units have voice clips)
- Sample-backed sounds that fall back to a synthesised version if the file is missing: Hydralisk / Queen / Spine Crawler attack, Mutalisk attack, Banshee / Wraith fire, heavy cannon / Thor / Archon shots (`boom-explode`), rocket whoosh (`fiery-swoosh`), artillery launch (`throw`), stimpack (`whoosh-pulse`), shell / energy impacts (`explode`, `metallic-energy`), Ultralisk attack (`big-animal-attack`), Banshee shot (`banshee`), cloak voice (`system-active`), Terran / Protoss building death (`building-smash`, alternating with the collapse), Marine / Marauder shots, explosions, siege-mode transform

### Round 4: building visuals, portraits, HUD

- Add-ons (Tech Lab / Reactor) attach at the building's 45-degree-rotated "right" (`Building.addonSpot`, snapped to the 2x2 grid) and their hoses face the parent; their red armour takes the owner's colour.
- Crisper GLB buildings: `vivid` (saturation + mid-tone contrast) and a lighter `shadowLift` in `RiggedModels.ts` for the Terran, Protoss and Zerg building models (Factory look); the Hatchery is lifted a bit.
- Player-colour accents added for Supply Depot, Bunker, Missile Turret, Nexus, Gateway, Spawning Pool, Hatchery and the Refinery hall (`TeamColor.ts`).
- Refinery uses Renn01's Terran Building Pack model (`models/refinery_sc2.glb`, one smoke stack like SC2); the code-built fallback is back to a single stack too.
- Selection panel shows a rendered still of the real unit / building model (`ui/EntityPortrait.ts`) instead of an emoji.
- Selecting another unit / structure leaves the Basic / Advanced Build sub-menu.
- Subsystem Resource Usage (F3) has an FPS-over-time graph (one sample per second since match start).
- SCV click acknowledgments no longer say "SCV ready".
- Rockets (Banshee, Goliath, Missile Turret; `ParticleSystem.spawnRocket`) are finned rockets with a nose cone and exhaust flame flying a slightly parabolic, winding path that decays into the target, steering onto a moving target and trailing smoke; whoosh on launch, hit sound + damage on the frame they land (all ranged damage is applied in the projectile's hit callback).
- Cinematic: Smith now runs in (the run clip never started because his mode began as 'run'); the head keeps its world orientation during slaps (`holdBoneWorldRotation`) while the torso swings; almost no neck on the grafted head; four crates became mineral fields; a CRT "COLONEL SMITH" transmission window (`public/cinematic/smith_comm.jpg`, flipped, scanlines, noise, jitter / slice glitches); the Gueermo soundtrack ducks to 22% under the ops TTS; the final card reads "Eliminate the target.", holds 5 s and fades over 2 s.
- Group moves use an SC2-style formation: rows face the travel direction, short-range / tanky / slow units lead, ranged and support trail, slots matched left-to-right by current position.
- Attributions: a title-screen button opens a modal listing every model the game loads (author link, source, licence, files; `src/credits/ModelCredits.ts` reads `modelCredits.json`), and the title-screen / Campaign / Co-Op / 1v1 hero models carry a "3D model by <author>" caption that opens it.
- Ten more sample sounds (explosions, boom cannon, building smash, Ultralisk, Banshee, throw, whooshes, cloak voice); see the sound sections above.

### Audio fixes (iPad + desktop)

- Music is routed through Web Audio (per-deck gain -> music bus -> master). iOS/iPadOS ignore `HTMLMediaElement.volume`, which is why the volume slider and mute did nothing there.
- Audio unlock on every gesture (`touchend`/`click`/`keydown`): resumes the AudioContext, plays a silent buffer, primes the second music deck so crossfades can start, asks iOS for the `playback` audio session (so the silent switch doesn't mute Web Audio) and recovers from iOS "interrupted" state. Sound effects and voices were silent on iPad because the context was never properly resumed.
- Muting now also stops speech and playing voice clips; the speaker icon stays in sync with the real mute state; the duplicate module-level `SoundSystem` instance (a second AudioContext + music player) was removed.
- Camera: 56 degree pitch, no camera yaw, so the map and minimap are screen-aligned squares; the ground slab grid and every building are rotated 45 degrees so tiles read as diamonds (as in SC2). Pan inputs are screen-space.
- Minimap: a square that fills its slot; the white view outline is the real camera frustum projected onto the ground (an upright trapezoid, wider at the far edge), clipped to the map. The minimap code still honours `cameraYaw` if it is ever non-zero.

### 🎛️ SC2-style menus

- **Title screen** (`MainMenu.ts`, styles in `src/menu.css`): StarCraft-II-style home screen - OpenSlop II logo image top-left (`public/ui/openslop_logo.webp`, screen-blended so its starfield fades into the menu), stacked blue buttons (Campaign / Single Player / Multiplayer / Co-op / Custom Games), the hero art in the centre (`public/ui/openslop2_splash.webp`), a News & Community card, a profile bar and a MENU link that opens Options.
- **Title-screen hero** (`src/ui/TitleHero.ts`): the centre shows one animated unit picked at random per page load (Roach, Adept or Thor), idling with a slow sway. It lazy-loads: the menu paints first, the model (2.7-4.9 MB) downloads once the browser is idle, shaders compile ahead of time, then the canvas fades in over 1 s, so menu navigation is never blocked. Bottom-right of the model: race + unit name ("PROTOSS ADEPT") above a "3D model by <author>" credit that opens Attributions. Phones skip it entirely (no `.hero` element, nothing downloads); iPads and desktop get it; Save-Data users get the plain backdrop.
- **Boot splash**: `index.html` paints the `openslop2_splash.webp` poster (1000x1333 WebP, 162 KB; the old 1125x1500 JPEG was 554 KB; the blurred backdrop is a 32x43 JPEG stretched and blurred; menu art uses `openslop2_sm.webp` and `openslop2_logo.webp`) with a loading bar from inline CSS before any JS loads, then fades out once the tank cinematic is ready (20 s cap).
- **Responsive title screen**: portrait screens (phones, iPad portrait) and short landscape screens (phones sideways) switch from the scaled 1920x1080 layout to a flowing one (logo, cinematic, buttons, news; landscape: buttons left, cinematic right, news hidden). The Campaign / Versus (Training, A.I., 1v1) / Co-op / Custom screens use the same approach: one scrollable column in portrait (nav strips scroll sideways, cards wrap, maps panel below the setup), two columns on landscape tablets and phones. Anything wider than 1100 px and taller than 520 px keeps the scaled desktop layout.
- **Live 3D unit heroes** (`src/ui/UnitHero.ts`): one shared transparent WebGL canvas shows any in-game rigged model with its idle clip, slowly swaying and turned slightly towards the left of the screen, on the right of the play screens (Campaign heroes are scaled per race: Marine 1.25x, Hydralisk 1.5x, Zealot 1.25x); `portrait()` renders cached bust thumbnails for tiles.
- **Campaign race select**: pick Terran / Zerg / Protoss (Marine / Hydralisk / Zealot hero); the mission row shows that race's missions.
- **Co-op commander screen**: commander portrait grid (each mapped to an existing model), Info / Units / Lobby tabs, Ready (host) / Random Mission (random map) / Normal-Hard buttons; quick match, join-by-code and the lobby live in the Lobby tab.
- **1v1 screen** (shares the race cards / info panel / action buttons / right panel components with the A.I. screen; every map is selectable - a map with a different size reloads the page into it and restores the screen, and a guest joining such a game reloads and rejoins automatically): race tiles, league panel (local wins / losses), Ranked (quick match) / Unranked (host) / Maps, and a glass panel with Open Games / Join Code / Maps tabs.
- **Options dialog** (`UIManager.ts`, `.sc2o` in `menu.css`): SC2-style two-pane settings (Graphics, Sound, Gameplay, Hotkeys) with Accept / Cancel (cancel reverts to the values at open) and Restore Defaults; full-screen with a tab strip on phones.
- **Auto quality** (`graphics/AutoQuality.ts`, on by default; checkbox in Options > Graphics): while a match runs it averages the frame rate over 1.5 s windows; under 42 fps it drops one preset (`ultra > high > balanced > performance > low`: render resolution, shadows, post-processing) without overwriting your saved choice. After 12 s at 56+ fps it climbs one step back (never above your own preset); if a climb does not hold, the wait doubles (up to 2 min). Hitches over 250 ms, the menu, pause and hidden tabs are ignored. Steps are seamless: they never change a shader program's inputs (shadows get zero intensity and stop rendering, reflections get zero intensity) and the direct-to-canvas path is compiled in the background first (`compileAsync`) before the switch, so no frame stalls (worst frame in a 150-unit battle went from ~2 s to ~150 ms, which is the unit-spawn hitch). Extra smoothing: `Renderer.warmUp()` draws every unit / building model (both colours) microscopically once at boot so no unit type compiles mid-battle; no-op resizes are skipped; resolution changes walk in 0.5x steps; the `low` effects are applied one per ~120 ms (shadows, bloom, scenery, grass, reflections) instead of all in one frame (reversed on the way up). The low tier keeps rendering through the post-processing composer (bloom off): switching to a direct-to-canvas draw cost 100-230 ms in heavy battles for almost no fps gain, so it was removed. Heavy 3-wave battle at 1x: no hitch around the step-down any more (only the wave-spawn frames spike). Changes are logged as `[auto quality] from -> to`.
- **Building placement (SC2 rules)**: `GameWorld.resolvePlacement` is used by the ghost, by `placeBuilding` and by network guests, so what you see is what gets built. Footprints snap to the cell grid (odd sizes on a cell centre, even sizes on a cell corner); every footprint cell must be buildable; gas buildings only go on a Vespene Geyser (the cursor snaps to the nearest free geyser's exact centre - one valid spot per geyser, none if it already has a structure); town halls need a 3-cell gap from minerals / geysers. The ghost is a semi-transparent green (red when invalid) wireframe-overlaid copy of the actual structure model (`Decals.getGhostModel`, cached per type and validity; falls back to a box if no model builds), turned by the same yaw as the finished model (`ModelFactory.yawFor`, -45 degrees; structure models were flipped 180 degrees), and also draws the true axis-aligned footprint cells. The ghost is re-evaluated every frame (`InputHandler.refreshPlacementGhost`, also used by Land), not only on mouse move, so it flips from red to green live as creep spreads under a stationary cursor or the camera pans.
- **Placing a structure** plays `public/audio/build_place.mp3` pitched down to 0.7x (`SoundSystem.playBuildPlace`).
- **Melee** (zergling, zealot, ultralisk, baneling) plays short pitched kick-drum samples from `public/audio/kicks/`.
- **Roach**, **Ravager** and the Brood Lord's fallback attack use the Hydralisk attack sound.
- **Wraith**: the player's Wraith is permanently cloaked and never loses energy (`Unit.update`). Each attack vs air plays a pair of quiet laser shots ~110 ms apart (vs ground: a single shot), both from `public/audio/banshee_fire.mp3` (`SoundSystem.playWraithFire`). Auto quality restores `scene.environmentIntensity` to its base 0.3 (not 1) when stepping back up, so the scene no longer brightens. Mutalisk has `shadowLift: 0.2` so the body is a little lighter. Terran structures, including the supply depot, share one yaw, `ModelFactory.BUILDING_YAW` (-45 degrees).
- **Play screens**: Single Player opens a screen laid out like the SC2 Versus screen - top nav (Campaign / Co-Op / Versus / Custom / Collection / Replays), sub-nav (Training / A.I. / 1v1 ...), faction cards, difficulty tabs, an info card with a difficulty emblem, gold PLAY button and a right-hand Maps / Enemy panel. Campaign, Co-Op, 1v1 and Custom reuse the same shell. Everything is laid out on a 1920x1080 canvas and scaled to fit the window.
- **In-game menu** (Esc): an SC2-style MENU dialog (Options / Help / Tutorial / Credits / Restart Mission / Quit Game / Return to Game). Options holds the soundtrack, mute, graphics resolution and profiler controls.
- **HUD layout (SC2)**: minerals, gas and supply sit top-right; the FPS / timer and Options / Profiler / Mute buttons sit top-left. The top bar no longer has a Restart button (use Restart Mission in the Esc menu). The middle panel of the bottom console hides when nothing is selected (its space is kept, so the command card does not move).
- **Terran names**: the Engineering Bay and Missile Turret use their SC2 names (were "Tactical Command Matrix" and "Phalanx SAM Turret"). The Factory is 3x3; the Refinery sits on the geyser's centre with the same rotation (yaw 0) as the geyser.
- **SC2 base geometry**: town halls (Command Center, Orbital, Planetary Fortress, Hatchery, Lair, Hive, Nexus) are 5x5, and their models were scaled up to match. Every structure snaps to the cell grid when spawned (odd footprints on a cell centre, even ones on a cell corner). Mineral fields block 2x1 cells and geysers 3x3. `fitBaseResources` (`src/levels/LevelHelpers.ts`) lays each base out SC2-style: the hall sits on a cell centre; geysers sit 3 cells from its edge; mineral fields alternate 3 and 4 cells out on the grid. Each resource keeps its authored bearing, swings round the hall in a pocket, and never crosses a wall (`hallAreaBlocked` flood-fills the hall's own area). When a level loads, `settleLevel` (`src/levels/BaseLayout.ts`) slides any base authored too close to a wall (hall and resources together, up to 7 cells) to the nearest spot where the full layout fits. A town hall can therefore be placed exactly on an expansion spot under the 3-cell resource rule. The AI expands onto that spot too (`expansionSpots` in `src/maps.ts`). The WoL campaign pockets that were too narrow for an SC2 base were widened from 10 to 12 cells, along with their ramps in `links.ts`: naturals on Zero Hour, Smash and Grab, Engine of Destruction, Echoes of the Future and Shatter the Sky, and the Media Blitz main (8 to 12). Every map except Sunken City now meets the 3-cell rule at every base.
- **SC2 unit and structure sizes**: every structure footprint matches SC2 (5x5 town halls; 3x3 production, tech and gas; 2x2 depots, turrets, pylons, cannons, crawlers, Spire, Dark Shrine and Shield Battery; 1x1 Sensor Tower and Creep Tumor). Collision radii come from SC2 game data (BurnySc2/sc2-techtree): units use `UNIT_RADIUS` in `src/simulation/Unit.ts` (Marine 0.375, Siege Tank 0.875, Ultralisk 1, Battlecruiser 1.25, Mothership 1.375; Firebat, Medic, Wraith, Goliath, Vulture and Odin are estimates), and structures use their exact SC2 radius (5x5 2.75, 3x3 1.8125, 2x2 1.125, gas buildings 1.6875). Radius drives collision, melee reach, selection rings and shadows, and is updated when a unit morphs. Small units now collide correctly with large ones, and ground units walk under the Colossus (colossi still collide with each other).
- **Creep Tumors (SC2 rules)**: ground units walk over tumors (no pathing block, no push), but no structure or other tumor can be placed on one. Lowered Supply Depots and tumors share `Building.walkable`.

### 🎨 Visual polish pass

- **Post-processing**: a cheap final grade pass (contrast S-curve, saturation lift, warm highlights / cool shadows, vignette) plus soft image-based lighting (`RoomEnvironment`, intensity 0.3) so metal hulls pick up reflections.
- **Damage effects**: structures below ~55% health smoke and burn, with more fire as health drops (`ParticleSystem.spawnBuildingBurn`, buoyant particles).
- **SC2 command card**: a 5x3 grid (`UIManager.cardHtml`) of square green-glow buttons with the hotkey at top-left; names and costs are in the hover tooltip and locked buttons grey out. Buttons carry a `data-slot` (0-14, row-major) and the rest fill free cells. Units: Move / Stop / Hold / Patrol / Attack on row 1; SCV adds Gather (G) on row 2 and Build (B) / Build Advanced (V) / Repair (R) / Cancel (T) on row 3. Production buildings list units on row 1, with Reactor / Tech Lab / Lift Off on row 3 (Barracks layout of the real card). Build menus fill from the top-left with Cancel (Esc) bottom-right. Not yet drawn: the SCV's second special (Y) and a Set Rally Point button.
- **Command card icons**: emoji are swapped for drawn, glowing SVG glyphs (`src/ui/Icons.ts`, applied in `UIManager`); unmapped emoji fall back unchanged.
- **Command ping**: right-click shows a contracting ring (green move, red enemy, gold resource).
- **Protoss power field**: a translucent disc with a 1px rim on the ground around a finished Pylon, shown only like SC2: when that Pylon is selected, or for all your Pylons while placing a Protoss structure or aiming a Warp-In. A Pylon's placement ghost previews its field.
- **Doodads**: instanced dead trees, glowing crystal spires, broken ruin pillars and fallen logs scattered over the grassland (`Scenery.ts`), kept off cliffs, plateaus and rocks.
- **Unit life**: `IdleAnimator` adds idle sway, walk bob/roll and attack recoil to every unit without a bespoke animator (hover drift for flyers). Transform-only, no gameplay effect.
- **Fixes**: doodads thinned out, no longer shaded black and kept off walkways; mineral fields have 13-16 crystals that vanish as they are mined out; main-base minerals sit behind the Town Hall and expansion resources avoid the attack lanes; flyers cruise lower with correctly placed health bars; destructible rocks are chiselled, textured boulders; **RTS camera pans with the arrow keys only** (WASD are command hotkeys).

- **Bunker (SC2 rules)** (`simulation/Bunker.ts`): 100 minerals, 400 HP, 1 armor, 4 cargo slots; Marines and Marauders take 1 slot each (Medics / Firebats can't enter). Right-click the Bunker with infantry selected, use the **Load** button (`C`, then click a unit) or set a Barracks rally point on it and trained units walk in. Loaded units leave the map (supply stays spent), can't be targeted, and fire with **+1 range**, their own weapon, stim-less, and Infantry Weapons upgrades. The selection panel shows the garrison as four icon slots: **click an icon to unload that unit**; **Unload All** (`D`) empties it. **Salvage** (`V`) unloads everyone, then after 5 s removes the Bunker and refunds 75% (75 minerals); press again to cancel. A destroyed Bunker releases its units unharmed. The enemy ramp Bunker starts garrisoned with 4 Marines.
- **Patrol**: the Patrol button / `P` arms a click-to-target cursor (new patrol reticle); the order patrols between the unit's position and the clicked point, engaging anything it can shoot on the way (attack-move behaviour), with `Shift` queuing.
- **SCV Repair (SC2 rules)**: SCVs repair Terran structures **and mechanical units** (right-click, or `R` then click). The repair rate is the target's max HP over its build time, and costs 25% of its price (minerals and gas) charged as the HP comes back; with no money the SCV stops and says so. SCVs can't repair themselves, enemies or non-mechanical units, and several SCVs stack. (Autocast repair isn't implemented.)
- **Terran texture pass**: Barracks, Marauder, Command Center and Supply Depot have their dark albedo regions lifted at load time (`shadowLift` in `RiggedModels.ts`), and the Factory's blue panels are hue-shifted to the Terran red of the other structures (`blueToRed`).

## Multiplayer security

- **Relay** (`server/relay.ts`): 64 KB max message, 120 msgs/s per connection (flooders are dropped), 8 connections and 3 open rooms per IP, 500 rooms total, 5-letter room codes from a CSPRNG, sanitised player names, config size cap, 3 h hard room expiry.
- **Order validation** (`src/net/commands.ts`, `applyCommand`): the other player is untrusted; order types are whitelisted and every id/position/index is type- and range-checked before it reaches the simulation, on top of ownership checks. Lockstep runs the same checks on both computers. Keyframes are capped (2000 pieces) and only accepted by the guest.
- **P2P** (`P2PClient`): WebRTC is encrypted; inbound payloads must be objects, names are sanitised, codes use `crypto.getRandomValues`.
- **`?relay=` override** only works on localhost/LAN hosts. Deploy the relay behind TLS (wss) so traffic is encrypted.

## Terran add-ons, Orbital Command, lift-off

- **Orbital Command** (`orbital_command`): Command Centers upgrade in place (150 minerals, 25 s, needs a Barracks) and gain MULE / Scanner Sweep, 50 starting energy. Model: `public/models/orbital_command.glb`. The Terran AI upgrades its CCs too.
- **Lift Off / Land** (Command Center, Orbital Command, Barracks, Factory, Starport): production queue must be empty; the footprint is released, the structure rises over 2 s, flies at 0.94 (right-click to move), and Land (target click) validates the spot with the same rules as building placement. Flying structures are air targets and cannot produce. The CC uses its model's fly clips (`Building.liftOff / flyTo`, `RiggedAnimator.updateBuilding`).
- **Tech Lab / Reactor** (`Build Tech Lab` 50/25 18 s, `Build Reactor` 50/50 36 s): attach 2.5 tiles to the right of the parent (SC2 position); procedural models in `AddonModels.ts` (red armoured shells, grey base, green lights, ribbed hoses). A Reactor runs two production slots (queue 8); Marauder, Siege Tank, Thor and Banshee need a Tech Lab (`TECHLAB_UNITS`). An add-on re-connects whenever a structure lands on its spot. As in SC2 the add-on stays on the ground when its building lifts off. The Tech Lab is fitted to its host (`TECHLAB_FIT` in `AddonModels.ts`: scale, slide, hose reach, spread and connector height per Barracks / Factory / Starport), so the hoses meet the hull and the Barracks and Starport labs are smaller than the Factory's. The parent cannot produce while its add-on is being built.
- **Zerg projectiles**: roach = stream of green vapour, hydralisk = a pair of needle spines with glowing yellow points (`spawnHydraliskSpine`, also used by the Queen), mutalisk = glaive wurm that bounces to two more targets within 3 range for 1/3 and 1/9 damage (`ParticleSystem.emitTrail`, `Unit` mutalisk case).
- **Planetary Fortress** (`planetary_fortress`): Command Center upgrade (150/150, 36 s, needs an Engineering Bay; mutually exclusive with Orbital). 3 armor, ground-only cannon (40 damage, range 6, splash 50% / 25%), still a town hall and trains SCVs, cannot lift off or use MULEs. Model = the Command Center rig plus `buildPlanetaryArmor` (maroon gun block with amber visor, thruster pods, shoulder plates, hazard hatch).
- **Terran AI**: builds an Engineering Bay once it holds an expansion, upgrades expansions to Planetary Fortresses (150/150) and its main Command Center to an Orbital Command (MULEs, scans).

## Team colours, bars, ultralisk, misc (latest)

- **Team colours** (`TeamColor.ts`): unit models stay neutral and only some areas carry the player colour (blue = you, red = enemy). One cached material clone per (material, team) with a patched fragment shader: Terran blue paint and Protoss cyan glow are hue-keyed to the team colour (luminance kept); Zerg get a tinted dorsal crest (clearly red for the enemy); SCV and Hellion (red / orange paint) are hue-keyed too and the Medic (white) gets a blue crest, so every Terran unit shows blue. Original shared materials and the menu / portrait renders are untouched. Called from `ModelFactory.createUnitModel` via `teamize(...)`.
- **Overhead bars** (`Decals.updateBars`): shields (blue), health (green) and energy (purple) as square-ended rows of mini rectangles. Every mini rectangle is the same size in screen pixels on every unit (16:9, 11.7 x 6.6 px, billboards scaled by camera distance so flyers match ground units) laid out in whole screen pixels (bars shrink in proportion as the camera zooms out - `Decals.zoomScale` = min zoom / camera distance, 1 at full zoom-in, the same for every unit so flyers match ground units; `FILL_W`/`FILL_H` 14 x 8 fill at full zoom-in, `BORDER` 2 CSS px, scaled by the render pixel ratio and rounded to whole rendered pixels via `Decals.viewport`) so every black line - bar ends, top / bottom, between rectangles and between rows - is exactly the same width, with the quad snapped to the pixel grid; bars are centred on the model's measured silhouette (`updateBars` measures it once); only the count differs, log-scaled by max points (`segCount`: Probe 4, Hydralisk 5, 200-HP unit 6, structures start at 8 for a Pylon / Photon Cannon); segments vanish as the value drops and the draining one shows a faded tint. Billboarded to the camera and placed just above the topmost point of the rendered model.
- **Hover outline** only draws the outer 2D silhouette (hull drawn before the model, depth-write off) and follows the animated pose for skinned models.
- **Ultralisk**: new static model built by `tools/model/build-ultralisk.ts` from the untextured sculpt (no UVs, so colours are baked as vertex colours from the old texture palette); breathing / stomp / lunge motion in `IdleAnimator`. Credit: "Ultralisk Zerg Starcraft Untextured" by woodsquid, CC-BY 4.0 (https://sketchfab.com/3d-models/ultralisk-zerg-starcraft-untextured-198885e270d34d23a1c01c3572f57cdc).
- **Fixes**: Baneling was rendered ~6 tiles away from its position (unclickable) - its clips are now re-rooted; edge scrolling is disabled while the cursor is over the command card / minimap / selection panel / top-right buttons; zergling torso is dark purple; Thor, Queen, Ravager, Hydralisk slightly brighter; Medivac torso blue tint; music-note button removed from the top bar.
- **Picking gotcha**: never leave a cached `SkinnedMesh.boundingBox` behind (e.g. via `Box3.setFromObject`) - it is computed from whatever pose the skeleton had and culls every raycast, which breaks hover and click. `pickEntity` and the bar placement clear it.
- **Model tools** (`tools/model/`): `build-ultralisk.ts` (decimate + recolour the Ultralisk sculpt), `inspect-glb.ts` (list meshes + world bounds of a GLB) and `profile-glb.ts` (height / width profile along an axis, handy for finding a model's front).

## Round of fixes (structures, damage, effects)

- **Start**: the 2 spare workers stand to the right of and below the town hall (screen-wise), mirrored for the enemy.
- **Cancel everywhere**: every production building shows its whole queue as clickable icons (the compact strip too); an in-progress Orbital / Planetary upgrade has a cancel icon (full refund, `Building.cancelMorph`) and a structure / add-on under construction has Cancel (75% refund, `cancelConstruction`).
- **Land** (flying Command Center / Barracks / ...): the cursor shows the green / red placement ghost, snapped exactly like the real landing. Flying structures now move their model (`tickLift` syncs the mesh each frame; before only the ring moved).
- **Add-ons**: the command card re-renders when an ability becomes affordable (it used to stay greyed after you got the gas); a blocked add-on spot now flashes red and says what blocks it.
- **Damage is plain SC2**: the IL-2 style per-component damage (Power / Production / Defenses, engines, wings...) is gone - no components, no speed / fire-rate / armor penalties, no "Sys" badge. Only shields, hit points and armor.
- **Shield regeneration** (`SHIELD_REGEN_DELAY` / `SHIELD_REGEN_RATE` in `src/config.ts`, `Entity.tickStatus`): Protoss units and buildings regenerate 2 shields/s after 7 s without taking any damage (the LotV Faster-speed value; 10 s at Normal speed). Any damage restarts the delay, and only the time past the delay regenerates. Covered by `src/simulation/shields.test.ts`.
- **Zerg regeneration** (`ZERG_REGEN_RATE` / `ROACH_BURROW_REGEN_RATE` in `src/config.ts`): every Zerg unit (larvae and eggs included) and finished Zerg structure regenerates 0.2734 HP per Normal second (0.38 per Faster second), structures on or off creep (off-creep structures still bleed out on top of that). A burrowed Roach regenerates 7 HP/s in total (5 at Normal), replacing the base rate. Covered by `src/simulation/zergRegen.test.ts`.
- **Unit acceleration** (`UNIT_ACCELERATION` in `src/config.ts`): units with a real SC2 acceleration ramp up to full speed at the start of every move leg instead of jumping to it: SCV/MULE/Probe/Drone 2.5, Viking 3.25, Medivac 2.25, Banshee 3.25, Void Ray 2.8, Overseer 2.5, Mutalisk 3.25, Corruptor 4.2, Brood Lord 1.063, Viper 3.0 (per Normal-second², x1.96 in Faster game time). Everything else has SC2 acceleration 1000 and reaches full speed at once. Flux Vanes / Gravitic Boosters values are not modelled. Covered by `src/simulation/workerAccel.test.ts`.
- **Effects**: structure smoke now uses the same soft translucent puffs as unit-death smoke (`DeathEffects.burnSmoke`) and a softer flame; debris materials are lighter so no chunk renders as a black square; waypoint (rally) dashes are thinner (0.088 half-width) with a very thin black outline wrapped around each dash.
- **Models**: the Engineering Bay lost its 4 corner pillars; Banshee rotor blades spin slowly at rest and spool up with speed (`RiggedAnimator.spinBansheeRotors`).
- **Terran structure team colours**: Barracks, Factory, Command Center family and Starport now go through `teamize` too (red panels / the Starport's green-teal lights become the team colour: blue for you, red for the enemy); orange hazard stripes are left alone.
- **AI reset**: `ZergAI.reset()` drops any instance-level `update` override, so a console / test hook that muted the AI can no longer leave later matches in the same page with a dead enemy.

## Campaigns: Nova Covert Ops and Wings of Liberty
- The **Campaign** screen now has two pathway cards next to Terran/Zerg/Protoss: **Nova Covert Ops** (9 linear missions in 3 packs) and **Wings of Liberty** (29 missions in 7 arcs with the real unlock rules, branches and the secret *Piercing the Shroud*).
- Every mission has its own map (`src/campaign/maps`), an objective panel (primary / bonus / counted / hidden, with live progress), scripted waves and triggers, and mission-specific victory/defeat. Completion is saved per campaign; **Next Mission** follows the story order.
- New units: **Nova** (permanently cloaked hero with Snipe, Pulse Grenades, Dominate, Tactical Nuke), **Ghost**, **Reaper**, **Liberator**, **Raven**, **Battlecruiser**, **Hellbat** (Firebat model) and **Vulture** (Hellion model). The Artifact's *Energy Nova* is the All-In panic button.
- **Objective panel and narration**: the objective panel pops open whenever an objective appears, progresses, completes or fails; completed rows get a green check and a flash, the current objective is highlighted, and each change also shows a toast (`MissionRuntime.log` / `version`, `UIManager`). Every `rt.say(...)` line and every objective "New objective / Objective complete" announcement is a Kokoro clip in `public/audio/voices/campaign/<hash>.mp3` (hash from `src/campaign/voiceKey.ts`; Adjutant voice for objectives, a male voice for story lines), played on the Adjutant channel through `SoundSystem.playMissionLine` (primary objectives that are visible from the start are narrated 2 s into the mission), with browser TTS if a clip is missing. Regenerate with `KOKORO_PY=<venv python> KOKORO_MODELS=<dir> bun tools/campaign/genvoice.ts [nco|wol]` (see `tools/tts/generate.py` for setup). Mission 1 now has its Armory, Research Bay and Starport structures.
- **Armory**: `models/armory.glb`, the hand-made PBR model `armory_pbr.glb` (textures shrunk to 512px by `tools/model/shrink-textures.py`). Its `TEAMCOLOR` mesh takes the owner's colour and the green light mesh glows. Construction: hazard scaffold, a steel core block, then the hull grows in at ~70%, no concrete slab (`ModelFactory.buildArmory`, `Building.updateConstructionVisuals`).
- **MULE**: `models/mule.glb`, the "Construction Vehicle" by gmetin (CC-BY-4.0, https://sketchfab.com/3d-models/construction-vehicle-a9d61abc3d884b09b1d79e977a3f97b6), scaled to MULE size by `RiggedModels`; credited in the in-game model credits.
- **Models now loaded from standalone GLBs**: Refinery, Mineral Patch, Vespene Geyser, Tech Labs (one per host), Reactor and MULE. The original code-built versions are only a fallback if a file fails to load; the code-built ones were baked to GLB by `src/dev/exportModels.ts` + `tools/model/save-server.ts`. Per-patch variety, the geyser's gas puffs and team colours are re-applied at load.
- **Infestation Pit and Hive:** Zerg tech structures from Catholomew's Sketchfab models (CC-BY-NC). The Pit gates the Swarm Host (the enemy AI builds it); the Hive needs the Pit. Primal Hive and Gun Tower models are in `public/models/` but not wired in; the Robotics Bay model turned out not to be Protoss and was dropped.
- **9 more SC2 units from Sketchfab models, now buildable with Liquipedia stats (Odin excepted):** Terran **Cyclone** and **Odin**, Zerg **Overlord** and **Swarm Host**, Protoss **Immortal**, **Colossus**, **Carrier**, **Tempest** and **Adept**. Cyclone, Odin, Immortal, Colossus, Carrier and Adept are skinned and animated (walk / idle clips mapped in `RiggedAnimator.ts`). The Overlord and Swarm Host source meshes had no textures and over a million triangles: they are decimated with gltf-transform (weld then simplify) and given vertex colours by `tools/model/build-overlord.ts` (glossy purple sacs / brown chitin, glow patches, dark spikes). The Colossus walk clip is exaggerated at load (`walkGain` 2.6) because its stride is subtle; the Tempest's cyan core uses an emissive override (`emissive`) so it no longer blows out to white. Production: **Cyclone** and **Odin** (Factory + Tech Lab; Odin also needs an Armory), **Adept / Immortal / Colossus** (Gateway), **Carrier / Tempest** (Stargate), **Overlord** (Hatchery, 8 supply while alive, costs larva) and **Swarm Host** (Hatchery). Stats are Liquipedia's current multiplayer values (attack speed = 1 / cooldown); Odin has no Liquipedia page so its numbers are estimates, the Swarm Host's Locusts are a short-range double strike, the Carrier's Interceptors are one 8 x 2-hit volley, and Immortal Barrier / Cyclone Lock On / Adept Shade / Colossus line splash are not implemented. We have no Robotics Facility, Robotics Bay, Fleet Beacon, Cybernetics Core or Infestation Pit, so the tech gates use stand-ins: Immortal, Carrier and Tempest need a Forge, Colossus needs a Stargate, Swarm Host needs a Hydralisk Den, Adept needs nothing. The enemy AI now builds Cyclones, Adepts, Immortals, Carriers, Tempests and Swarm Hosts at higher tiers. Licences: Cyclone, Odin, Immortal, Colossus, Carrier, Adept are CC-BY-NC (non-commercial), see the in-game credits.
- **Engineering Bay**: `models/engineering_bay.glb`, generated procedurally from the SC2 reference art by `tools/model/build-ebay.ts`: one continuous sloped hull (1 : 2 bottom plate, roof 60% of it), small roof fittings, four round-footed light-grey legs; red panels take the player colour. Surfaces use the shared procedural PBR detail set (`DetailTextures.ts`: panel seams, rivets, scratches, grime) and it has no slab. Same construction stages as the Armory (`ModelFactory.buildEngineeringBay`).
- **Ghost**: the Combine soldier model (`models/ghost.glb`, clips mapped in `RiggedAnimator`); **Nova** uses her own model (`models/nova.glb`), with shots coming from her right hand, `ghost-attack-new.mp3` on every shot and `ghost-snipe.mp3` for Snipe / Steady Targeting; Ghost, Reaper and Firebat use `shotgun-load-sound-unit-ready.mp3` as their unit-ready sound.
- **Ability numbers (current multiplayer, patch 5.0.17)**: Psionic Storm 110 damage over 6 s, radius 2, range 8. The multiplayer Ghost has **Steady Targeting** (50 energy, 1.43 s channel, 130 / +40 vs Psionic, ignores armor, biological only, cancelled by damage or target > 14 away, energy refunded) instead of Nova's campaign Snipe (125). Ghost **Tactical Nuke**: 14 s, 300 (+200 vs structures), range 12; Nova's campaign Nuke: 5 s, 750 (+200), range 10. Nukes hit friend and foe, ignore armor and deal 100% / 50% / 25% in rings out to radius 8 (inner ring radii 4 / 6 are from game data memory, not confirmed). Ghost also has **Cloak** (25 energy, drains 1.3/s) and **EMP Round** (75 energy, range 10, radius 1.5: strips up to 100 shields and 100 energy from every unit and structure, friend and foe, and reveals cloaked units for 5 s (estimate)). Personal Cloaking research is not modelled because there is no Ghost Academy. Sources: Blizzard patch notes and Liquipedia.
- **Snipe cursor**: while targeting Snipe or Steady Targeting the cursor is a green reticle with no X over enemy units it can hit, and the red reticle with an X over anything else (`Cursors.ts` `snipeOk`, `InputHandler.updateContextCursor`).
- **Banshee rotors** spin about the blade disc normal, so the blades turn inside their cowls (`RiggedAnimator.spinBansheeRotors`). The Smith mission text no longer says "extreme prejudice".
- **Map QA tools**: `bun tools/campaign/mapcheck.ts [nco|wol]` flags mission points inside rock or cut off from the start, and stray resources; `bun tools/campaign/mapascii.ts <levelId>` prints a text picture of a map; `bun tools/campaign/autolink.ts` adds the connecting ramps and objective clearings to `src/campaign/maps/links.ts` (generated data, delete an entry to undo). Maps with `noResources: true` have no minerals/geysers.
- Architecture, how to fix a mission, and the list of estimated numbers: `docs/campaign/README.md`. Research notes: `docs/campaign/nova-covert-ops.md`, `wings-of-liberty.md`, `wings-of-liberty-flow.md` (sources: StarCraft Wiki and Liquipedia).

### Camera zoom

RTS zoom runs from 50% (camera distance 92) to 500% (distance 9.2) and starts at 185% (distance 24.9); 100% is the old default distance of 46, so the camera really moves, not just the label. The minimap shows reset, `-` and `+` buttons in its top-right corner on hover (RTS view only); each `-` / `+` press changes the distance by 18%, reset returns to 185%, and a brief `Zoom NN%` read-out appears (`Renderer.ZOOM_REF`, `DEFAULT_DISTANCE`).

## Landing page and "Playing now"

`landing.html` (served at `/landing.html`, built as a second Vite page) is a standalone landing page laid out like nfsu2.xyz's (`src/landing/`). Its **Playing now** panel shows players in total, single player and multi player, polled every 10 s from the relay's `GET /api/players`. Each open game tab heartbeats `POST /api/presence` every 20 s while a match is on screen (`src/net/Presence.ts`; multiplayer PvP / co-op count as multi player, everything else as single player; menus and game-over don't count) and a player drops off after 50 s without one. Needs the relay running (`bun run relay`; vite proxies `/api`). On a static host (Vercel) there is no relay, so the numbers show a dash until one is hosted: set `VITE_PRESENCE_URL` to its address.

## Loading experience

From landing to a running match there is always something on screen: the landing page prefetches the splash art, the boot splash (`index.html`) leaves once the title screen has painted, and pressing Play shows a full-screen **Preparing battlefield** card at once (`src/ui/LoadingOverlay.ts`). **Menus load no 3D models up front**, so they stay smooth (the title-screen hero lazy-loads its one model when the browser is idle). Models load once (`RiggedModels.ts`, one cached promise per model): pressing Play shows one **Preparing battlefield** card with a real progress bar while every model of the two races in the match (all three in desktop campaign missions) loads, three at a time with a pause after each so the bar keeps moving. On desktop the one-time shader warm-up (a ~3 s freeze) also runs behind that card ("Preparing graphics"), so nothing freezes or streams in once play starts; iPads skip the warm-up. Menu unit viewers load just the model they show. A map-size change reloads the page *before* any models load (so they are never loaded twice); the boot splash stays up until the resumed match is running. The indicators use opacity / transform animations only, so they keep moving while the main thread is busy.

The shader warm-up (`Renderer.warmUp`, which builds and compiles every model for both teams) is skipped on touch devices: it froze the page for several seconds on phones. Those devices may hitch briefly the first time a new unit or building appears.


### Recent fixes

- **Nova's new model**: Nova (campaign hub, mission select and in-game) uses the "female specops" model with a subtle slow standing loop and a walk; textures shrunk to 1024 px (2.9 MB).
- **Campaign hub sizes**: Marine, Archon and Nova stand at the same height, the Marine's feet sit on his pedestal, and figure framing no longer changes from load to load.
- **Ghost rifle**: the Ghost holds a sniper rifle GLB (`public/models/nova_sniper.glb`), turned muzzle-forward and seated in both hands.
- **Group movement**: units whose formation slots fall in the same 4x4-cell block share one flow field, and the field cache holds 24 entries, so big groups no longer stall or wander.
- **Cliff edges**: a unit pushed onto a cliff edge can walk back off it, and unit-to-unit pushing never shoves a unit onto a cliff.
- **Selection bar**: the multi-select grid is fluid (icons stay inside their tiles and the bar, desktop and mobile); clicking one icon selects only that unit.
- **Credits screen**: the in-game Credits panel lists every 3D model artist (linked, with model counts and licence) plus a button to the full Attributions screen; the Ghost/Nova model is now correctly credited to MrYoink (`tools/model/credits.py` had a stale entry).
- **In-game menu on phones**: Options, Help, Tutorial, Credits and the other sub-screens use the phone scale (`--u`) and fit the screen.
- **Idle aggression**: idle units no longer walk toward enemies that are merely in sight (as in SC2). They fire only at enemies already inside weapon range, and chase only for 4 s after being hit. Attack-move, patrol and direct attack orders still chase; hold position never moves.

## Credits

- Ghost model: "Combine Soldier" by MrYoink (https://sketchfab.com/3d-models/combine-soldier-6fa87ed8061b4bda85cd5b4b8bd7b7b2), CC-BY-4.0.
- Nova model (`public/models/nova.glb`): "female specops" by DJMaesen (https://sketchfab.com/3d-models/female-specops-367a37bf5c0b48e688195d915c5496a2), CC-BY-4.0.
- Ghost's rifle (`public/models/nova_sniper.glb`): "Highly Detailed Sniper rifle" by rajibkc (https://sketchfab.com/3d-models/highly-detailed-sniper-rifle-ef4c1c81e1fe4c0998e359025082f2ab), CC-BY-4.0.
- Earlier rifle (`public/models/nova_rifle.glb`, no longer used): "Nemesis Sniper Rifle" by CaptainToggle (https://sketchfab.com/CaptainToggle), CC-BY-4.0.
