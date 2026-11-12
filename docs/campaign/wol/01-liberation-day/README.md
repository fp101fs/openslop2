# WoL 1 — Liberation Day: detailed research

Sources (read 2026-11-12 via Chrome):
- Liquipedia `Campaign/Liberation_Day` (guide, difficulty table, secrets, map image)
- StarCraft Wiki (Fandom) `Liberation_Day` and `StarCraft_II:_Wings_of_Liberty_campaign_quotations/Mar_Sara_Missions` (story, full in-mission dialogue)
- GameFAQs walkthroughs 60677 (starlin17) and 60772 (James00715)
- YouTube `669miah1LMk` (GameDestroyer, Hard, no commentary, 3:28) — auto-transcript used for timings, 3 frames inspected

Dialogue below is paraphrased; the exact script is on the Fandom quotations page.
- GamePressure `starcraftiiwingsofliberty/liberation-day/z72696` (numbered event markers 1–5)

Maps in `img/` (next to this file):
- `liberation_day_map.jpg` — Liquipedia top-down, 606×706, yellow = holoboards, green = HQ. **All coordinates below use this image's frame.**
- `liberation_day_path_joanasworld.webp` — 3D tilted view with the player's path in yellow, holoboards circled pink, HQ circled green.
- `liberation_day_gamepressure_markers.webp` — 400×468, slightly different crop; green dots = holoboards, numbers = events. Converted to the Liquipedia frame by matching holoboards: x_liq ≈ 1.18·x_gp − 0.11, y_liq ≈ 1.23·y_gp − 0.16 (±3%).

## Summary
- Setting: Backwater Station, Mar Sara. Dominion logistics HQ, understrength after troop pull-out.
- Objectives: Destroy the Logistics Headquarters; Raynor must survive. Bonus: Destroy 6 Dominion Holoboards (no reward).
- Player: Raynor (hero Marine, +1 range over Marines, much tougher) + 5 Marines. No base, no income, no credits/research.
- Reinforcements: 3 drop pods of Marines at the town plaza (9 Marines total; one guide says Horner drops "two sets").
- Allies: 61 civilians freed near the end. Not controllable, follow you, throw molotovs. Victory screen shows civilians lost.
- Point of no return after the civilian camp (the guide warns you can't go back for missed holoboards/enemies once you push north).

## Route (map is ~portrait, HQ top-right)
Normalised positions from the Liquipedia map (x 0=west..1=east, y 0=north..1=south). ± a few %.

| # | What | Approx (x, y) |
|---|------|---------------|
| S | Drop-off on the south road, just east of the gate/checkpoint structure where the road comes in from the west edge (GamePressure "START", JoanasWorld path start) | (0.23, 0.93) |
| GP1 | First enemy group: south-east corner, where the south road turns north | (0.87, 0.92) |
| HB1 | Holoboard #1 just east of the road as it climbs the east side; Mengsk line + bonus objective here | (0.93, 0.78) |
| GP2 | Top of the east road's loop: civilian "my neighbours, my family" line; road then swings west/south-west into town. A single Dominion Marine is on this stretch | (0.79, 0.50) |
| GP3 | East edge of the town plaza: Adjutant warns of the large force downtown → drop pods (3 pods, 9 Marines) land here; the 9 enemy Marines hold the plaza centre | (0.62, 0.61) |
| HB2 | Holoboard #2, plaza centre, on a raised sand/palm island among the enemy Marines | (0.43, 0.62) |
| HB3 | Holoboard #3, south-east lobe of the plaza (side area) | (0.56, 0.73) |
| HB4 | Holoboard #4, south-west corner of the plaza (side area) | (0.24, 0.79) |
| — | Path turns north up the west side of town (plaza is crossed diagonally east → south-west, then north) | (0.20, 0.55) |
| GP4 / HB5 | Civilian holding camp "post" (the cutscene spot): Dominion Marines + transport, "RESTRICTED" gate, Holoboard #5. Freed civilians attack the nearby holoboard themselves | camp (0.30, 0.42), HB5 (0.27, 0.39) |
| HB6 | Road runs north-east (a straight paved causeway north of the pond); Holoboard #6 on its east side | (0.49, 0.32) |
| GP5 | HQ compound: big paved plaza, Mengsk statue on a stepped plinth, bunker-like buildings around the edge; Logistics HQ in the NE corner | HQ (0.72, 0.06) |

Path order (JoanasWorld yellow line): S → east along south road → north up east road → loop at top → west/south-west into the plaza → diagonally to the SW corner (HB4) → north up the west side → camp (HB5) → north-east causeway (HB6) → HQ. HB2 and HB3 sit just off this line; HB3 is a short detour.

Terrain from the 3D view: the town sits in a basin ringed by high orange mesas; the whole west side drops into a deep purple-blue chasm; the south and east roads run in a trench between cliffs; there is a dark scorched crater between the east road and the plaza, and a small pond between the camp and the causeway. A second road leaves the HQ plaza to the north-west and climbs off the top edge (not used). Pre-existing estimate of the drop-off at (0.17, 0.93) replaced by (0.23, 0.93); first contact moved from the middle of the south road to its east end.

Other map notes:
- Two of the six holoboards are in side areas off the plaza near where the pods land; four are on the main path (Fandom).
- Flavour props (Liquipedia "secrets"): a gas station ("Big Daddy Browder's Gas & Guns") with a flame-painted truck on its roof just past the first Marines; 3 signs sprayed with anti-Mengsk graffiti (the tagger lies dead at one, in spray paint); a billboard with a battlecruiser silhouette at 12 o'clock on the plaza; a "Real men drill deep" sign at 8 o'clock on the plaza.
- Holoboards are attackable "buildings" — a tall billboard with three Dominion emblems ("Protecting you from..."). Mengsk's voice plays propaganda lines from them.

## Enemy forces by difficulty (Liquipedia, in order of appearance)

| Group | Casual | Normal | Hard | Brutal |
|---|---|---|---|---|
| Road group 1 | 2 Marines | 2 | 3 | 4 |
| Road group 2 | 1 Marine | 1 | 2 | 2 |
| Plaza | 9 Marines | 9 | 9 | 9 |
| At a billboard (avoidable) | 2 Marines | 2 | 2 | 3 |
| Civilian camp | 3 Marines + 1 Transport | 4 + 1 | 5 + 1 | 6 + 1 |
| HQ | 3 Marines + 2 Vikings | 5 + 2 | 6 + 2 | 5 + 1 Firebat + 3 Vikings |
| Enemy upgrades | all units half HP (rounded down) | none | Infantry Armor 1 | Infantry Armor 1 + Infantry Weapons 1 |

The upgrades row is my reading of a collapsed table whose text came out flattened ("half HP… None None Infantry armor 1 Infantry armor 1 Infantry weapons 1"); Hard might be "none" instead — UNVERIFIED.
GameFAQs counts differ slightly (8 or 9 at the plaza; 4–5 at the camp; 5–6 + 2 Vikings at the HQ) — use the Liquipedia table.

Vikings: fly in and land to guard the HQ as you approach (one guide: they appear after the Mengsk statue(s) are destroyed — UNVERIFIED). Advice everywhere: catch them while still in the air.

## Timeline (Hard run, video time ≈ mission time, player moving at a steady pace)
| Time | Event / speaker |
|---|---|
| 0:00–0:07 | Drop-off. Raynor: let's show the locals they needn't fear the Dominion. Adjutant mentions tutorial videos (tutorial popups: Tutorials, New Unit: Marines, Hero Units) |
| 0:14 | Raynor: keep intervals wide, eyes open, move out |
| 0:21 | Civilian (ambient): warns not to go up the road |
| 0:28 | First contact. Dominion Marine recognises Raynor, orders the kill |
| ~0:40 | Mengsk propaganda line (watch your neighbours) as the first holoboard comes into view |
| ~0:43 | Adjutant: destroying holoboards will incite rebellion → bonus objective appears |
| 0:45 | Raynor: tired of seeing Mengsk's face, blast it. Holoboard #1 destroyed (1/6 by 1:24) |
| 0:53 | Raynor: where is everyone? |
| 1:02 | Civilian: my neighbours, my family... |
| 1:05 | Raynor: this is starting to look ugly |
| 1:12 | Adjutant: large Dominion force gathering (transcript says "in the center of town"; Fandom says "on the road") — triggered on approaching the plaza; autosave here |
| 1:17 | Raynor: time to call in the "special delivery" |
| ~1:22 | 3 drop pods land with 9 Marines next to the plaza fight |
| 1:28 | Raider Marine: thanks for the assist, we're with you |
| 1:35–1:55 | Dominion Marine: that's Raynor, most wanted man. Mengsk lines from the plaza holoboards (sacrifice, safeguarding communities, freedoms must be protected) |
| 1:57 | Raynor: this is bad (approaching camp) |
| 2:05 | Raynor: finally, there's the locals → short cutscene |
| 2:05–2:15 | Cutscene: Dominion Marine promises meals at the dig site; a civilian says their brother vanished at the mine and runs; Marine shouts "runner", he's shot |
| ~2:15 | Raynor: they're shooting civilians, move in. Fight: camp Marines + transport. Holoboard #5 here (4/6 at 2:11) |
| 2:22 | Raynor: Mengsk has a lot to pay for (camp cleared) |
| 2:27 | Civilians: thanks Raynor; more people held up ahead. Raynor: I'll see to them |
| 2:36 | Mengsk: official labour programs... Civilian: Marshal Raynor, been a while. Civilian: we're with ya |
| 2:45 | Mengsk: labour redistribution mandates... Dominion Officer: restricted area, you're under arrest (entering HQ compound) |
| 2:48 | Civilian: we got your back |
| ~2:58 | Holoboard #6 done (6/6). Vikings land, HQ fight |
| ~3:15–3:28 | HQ destroyed → ending lines: civilian didn't think they could fight; Raynor: now you have weapons and resources, Mengsk only controls you if you let him |

Cut line (not in game): Raynor asking why the people don't fight back.

Achievements (reference for pacing): Quick Sign Off = all 6 holoboards in < 3:00 on Normal; old beta achievement "Backwater Speed Run" = complete in < 3:00 on Hard. So a fast full clear is ~3 minutes.

## Story frame
- Before: cinematic "Public Enemy" (Raynor in a bar watching Mengsk's broadcast), then briefing with the Adjutant (HQ in Backwater Station, hub for Mar Sara ops, recently understrength; locals anti-Dominion but unarmed; "Prep my ship").
- After: cinematic with Tychus, UNN report by Kate Lockwell (cut short) / Donny Vermillion; Mar Sara revolts.

## Status in our version (2026-11-12)
Rebuilt as data: `src/campaign/campaigns/wol/missions/liberation_day.openslop2mission` (edit it in the Mission Builder, `bun run mission-builder`). The map frame is this doc's Liquipedia image placed at world x 15..128, y 6..138 on a 144-tile map (x = 15 + 113·nx, y = 6 + 132·ny).
- Done: the snake route and its terrain, enemy groups and counts per difficulty with upgrades, 6 holoboards with Mengsk lines, drop pods (9 Marines), the camp cutscene (the runner is shot), the Dominion transport, 61 civilians who follow and throw molotovs, Vikings landing at the HQ, every dialogue line on its trigger, tutorial popups, the point of no return, an autosave at the square, and civilians lost on the victory screen.
- Remaining gaps:
  - Dialogue is paraphrased TTS.
  - Props are procedural stand-ins.
  - The town's buildings aren't placed one by one, so the square is open ground.
  - The gas station's truck and the dead tagger are not modelled.
  - Mengsk has no portrait art.
- UNVERIFIED (listed in the mission file under `unverified`): hit points of Raynor (300), holoboards (400), civilians (40 hp, 8 molotov damage) and the transport (250); trigger radii; where the point of no return is; Hard's upgrades; which holoboard the avoidable group guards.
