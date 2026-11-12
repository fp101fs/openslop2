# Campaign system (src/campaign)

One folder per campaign, **one file per mission, one file per map**, and a small shared engine. Fixing a mission never touches the engine or other missions.

```
src/campaign/
  types.ts            CampaignDef / MissionDef / ObjectiveDef (data shape)
  MissionRuntime.ts   per-match state: objectives, timers, win/lose, HUD markup, small scripting API (after/every/onTick/spawn/near/say/focus)
  helpers.ts          reusable building blocks: wave(), waves(), place(), reach(), countKills(), destroyAll(), rescue(), mustSurvive(), mineGoal(), boss()...
  progress.ts         per-campaign completion in localStorage + unlock/next-mission rules
  registry.ts         CAMPAIGNS = [NCO, WOL]  (add a campaign here and it appears as a card on the Campaign screen)
  units.ts            stats of campaign-only units (Ghost, Nova, Reaper, Liberator, Raven, Battlecruiser, Hellbat, Vulture)
  campaigns/nco/      Nova Covert Ops (9 missions: missions/*.ts + index.ts)
  campaigns/wol/      Wings of Liberty (29 missions: missions/*.ts, common.ts has unlock helpers, index.ts)
  maps/               one LevelDef per mission (builder.ts = compact map recipe; nco/*.ts, wol/*.ts); merged into LEVELS
  data/               missions as data: MissionData.ts (format), compile.ts (dataMission → MissionDef), level.ts (map → LevelDef),
                      validate.ts (shared checks), serialize.ts (canonical file format), fixtures/ (test missions)
```

## Missions as data (`.openslop2mission`)
A mission can be a single JSON file next to its `.ts` file, e.g. `campaigns/wol/missions/liberation_day.openslop2mission`. The `.ts` file is then two lines (`export const liberationDay = dataMission(data, hooks)`), and the map file is `dataLevel(data)`.
- Edit the file in the **Mission Builder**: run `bun run mission-builder` and open http://localhost:5210. Save always writes the canonical format, so diffs stay small.
- **Code escape hatch:** list hook names in `hooks` and pass functions to `dataMission(json, { name: (ctx, args) => ... })`. Use them as a `hook` condition (returns a boolean) or a `hook` action.
- **Checks:** `bun tools/campaign/mapcheck.ts` validates data missions with `src/campaign/data/validate.ts`, the same checks the editor's Problems tab shows.
- **Playthrough:** `bun tools/campaign/autoplay.ts <campaign> <key> [difficulty] [--saveAt <sec>]` plays the mission headless along its `testRoute` path.
- **Voices:** `tools/campaign/genvoice.ts` reads every dialogue line with its speaker's Kokoro voice.
- **Hand-coded missions** keep working unchanged. Convert one when it is rebuilt from research (Mission 2 notes: `wol/02-the-outlaws/README.md`).

## Research docs (docs/campaign)
```
docs/campaign/
  nova-covert-ops.md, wings-of-liberty.md   one-paragraph spec per mission
  wings-of-liberty-flow.md                  unlock order
  wol/01-liberation-day/README.md           deep research for one mission: route with map coordinates, enemies per difficulty, timed dialogue and triggers, gaps vs our version
  wol/01-liberation-day/img/                reference maps used by that doc
  wol/02-the-outlaws/README.md              how Mission 2 maps onto the data format (no research yet)
```
New deep-research docs follow `<campaign>/<NN>-<mission-name>/README.md` (campaign ids match `src/campaign/campaigns/`).

## Adding / fixing a mission
1. Spec first: `docs/campaign/nova-covert-ops.md` or `wings-of-liberty.md` (fix the numbers there, then in code).
2. Mission file: `mission({...})` with `objectives` (primary/bonus, counted, passive, hidden) and `script(rt)`. Win = every non-passive primary objective done (`customWin`); `rt.win()/rt.lose()` for special cases. `gaps` lists what the real mission has that we don't.
3. Map file: `campaignLevel({ tiers, ramps, massifs, pits, bases })`; edit coordinates freely.
4. `bun tools/campaign/gaps.ts [nco|wol]` prints all recorded gaps.
5. After editing a map or a mission's coordinates, run `bun tools/campaign/mapcheck.ts`; if it reports cut-off points, `bun tools/campaign/autolink.ts` writes the fixes to `src/campaign/maps/links.ts`.

## Estimates (UNVERIFIED)
Wave sizes/intervals, hold-out lengths (Sudden Strike 22 min, Dark Skies ~13 min, All-In 22 min), Trouble in Paradise reinforcement timer (8 min), Night Terrors device count/extract time, Media Blitz attack/upload lengths, Xanthos/Gorgon behaviour, lava/fire speeds, hero hit points. Search the code for `UNVERIFIED` / `estimate`, and the doc sections of the same name.

## Nova's equipment (Nova Covert Ops)
`campaigns/nco/equipment.ts` holds the 16 items (Liquipedia stats) and which mission unlocks each. The menu shows four slot buttons (click to cycle through unlocked items); `spawnNova()` applies the loadout (life/armor/speed/energy, weapon damage/range/cooldown, cloak rule, enabled abilities). Unit-tech upgrades (Spider Mines, Super Stimpack, Jump Jets, ...) are not implemented yet.
