# OpenSlop II vs StarCraft II: how close are we?

One table per area. Rows are items (units, buildings, systems); columns are the parts of the game that apply to them.
Read down a column to see a gap; read across a row to see how finished one item is.

**★ = a 3D model made in this project** (modelled, generated or textured by us rather than taken from a third-party download). See *Models we made* below.

**Legend:** ✅ matches SC2 (or close enough that nobody would notice) · 🟡 partly there / stand-in / reused asset · 🔧 procedural (code-made) stand-in, no real asset · ❌ missing · ➖ doesn't apply to this item · ❓ not verified

> Audited from the code on 2026-11-07 (Engineering Bay, Armory, Banshee rotor and Snipe cursor rows updated the same day) (`src/config.ts`, `src/simulation/Mechanics.ts`, `src/audio/SoundSystem.ts`, `src/graphics/RiggedModels.ts`, `public/audio`, `public/models`). This is an honest first pass, not a promise: stats are judged by whether the README / mission docs record a Liquipedia source (✅) or the number is just "in the right ballpark" (🟡). Fix a cell by editing this file when something changes.

Column keys for units: **3D** = real model, **Anim** = animated (idle/move/attack clips), **Stats** = HP/damage/range/cost match SC2 or the campaign unit, **Attack SFX** = weapon sound, **Attack VFX** = muzzle flash / projectile / impact visuals (being reworked unit by unit, starting with the bullet weapons), **Voice** = selection/command voice lines, **Abilities** = the unit's own abilities, **Upgrades** = unit-specific techs (the generic Weapons/Armor levels apply to everything and are in *Systems*).

## Models we made

Every one of these is a standalone GLB in `public/models/` and the game loads it. The code that originally built the Refinery, Mineral Patch, Geyser, Tech Lab and Reactor (and the old MULE) is kept only as a fallback if a file fails to load. The GLBs for those were baked from that code by `src/dev/exportModels.ts` (+ `tools/model/save-server.ts`). Things GLB can't hold are redone at load: team colour (Refinery hall, Tech Lab, Reactor), the Geyser's animated gas puffs, flat shading and per-patch variation on Mineral Patches.

| Model | How it was made | GLB file |
|---|---|---|
| Engineering Bay | Generated from the SC2 reference art: boxes, a sloped square frustum, cylinders and tori with baked vertex colours and UVs, then given the shared procedural PBR set (panel seams, rivets, scratches, grime) at runtime (`tools/model/build-ebay.ts`, `DetailTextures.ts`) | `engineering_bay.glb` (loaded by the game) |
| Armory | Hand-made PBR model (`armory_pbr.glb`, made by Claude); textures shrunk to 512px, `TEAMCOLOR` mesh recoloured per owner, green light mesh emissive (`tools/model/shrink-textures.py`) | `armory.glb` (loaded by the game) |
| Supply Depot | Three flat vertex-coloured sculpts split by colour and given generated PBR textures; separate hatch node, raise/lower clip driven by depot state (`tools/model/texture-depot.py`) | `supply_depot_animated.glb` (used), `supply_depot_lowered.glb`, `supply_depot_normal.glb` |
| Refinery | The Barracks model reskinned maroon, plus built gas tanks, clamps, stack and pipe, baked once to a GLB by `src/dev/exportModels.ts`. The game now loads the file (hall panels take the owner's colour); the old live build is kept only as a fallback (`ModelFactory.buildRefinery`) | `refinery.glb` (2.8 MB) |
| Mineral Patch | 13-16 faceted blue crystals in core / inner / outer rings, random lean and height every time, shrinking as the patch is mined out (`createMineralPatch`) | `mineral_patch.glb` (one sample field; each patch gets a random spin, squash and 0-2 fewer small crystals) |
| Vespene Geyser | Noise-displaced, ridged volcanic vent cone with a crater lip, scorched-ground decal and green gas puffs (`createVespeneGeyser`) | `vespene_geyser.glb` |
| Tech Lab | Code-built add-on baked once per host (`buildTechLabModel`) | `techlab.glb` (Factory), `techlab_barracks.glb`, `techlab_starport.glb` |
| Reactor | Code-built add-on (`buildReactorModel`) | `reactor.glb` |
| MULE (not ours) | "Construction Vehicle" by gmetin, CC-BY-4.0, swapped in for the old code-built drone | `mule.glb` |

Not ours: Ghost / Nova (Combine soldier), Banshee and the other unit and building models came from downloaded sculpts or GLBs (some baked or retextured by our tools).

---

## 1. Units

### Terran
| Unit | 3D | Anim | Stats | Attack SFX | Attack VFX | Voice | Abilities | Upgrades |
|---|---|---|---|---|---|---|---|---|
| SCV | ✅ | ✅ | 🟡 | ✅ repair clip | ❓ | ✅ | ✅ build / repair / mine | ➖ |
| MULE | ✅ gmetin construction vehicle | ❌ | 🟡 | ➖ | ➖ | ➖ | ✅ mines fast, times out | ➖ |
| Marine | ✅ | ✅ | 🟡 | ✅ | ✅ muzzle flash at the gun tip, no projectile | ✅ | ✅ manual Stim (no auto-stim) | ❌ Stim / Combat Shield (shield ✅) |
| Marauder | ✅ | ✅ | 🟡 | 🟡 autorifle clip, pitched down | ❓ | ✅ | ❌ Concussive Shells | ❌ |
| Firebat | ✅ | ✅ | ✅ | 🟡 marauder shot reused | ❓ | 🟡 | ❌ Stim | ❌ |
| Medic | ✅ | ✅ | ✅ | ➖ | ➖ | 🟡 | ✅ auto-heal | ❌ |
| Reaper (new) | ✅ | ✅ | 🟡 | ❓ | 🟡 muzzle flash (alternating pistols) | 🟡 | ❌ KD8 charge / jetpack | ❌ |
| Ghost / Nova (new) | 🟡 Combine soldier stand-in | ✅ idle / walk / shoot | ✅ Liquipedia loadout | ✅ ghost-attack-new + ghost-snipe clips | 🟡 muzzle flash, no projectile | 🟡 | ✅ snipe, cloak, nuke; Nova: dominate, pulse, blink, decoy… | ✅ 16-item Nova equipment |
| Hellion | ✅ | ✅ | 🟡 | 🟡 marauder shot reused | ❓ | 🟡 | ❌ Hellbat transform | ❌ |
| Hellbat (new) | 🟡 firebat model | 🟡 | 🟡 | 🟡 | ❓ | 🟡 | ❌ | ❌ |
| Vulture (new) | 🟡 hellion model | 🟡 | 🟡 | 🟡 | ❓ | 🟡 | ❌ Spider Mines | ❌ |
| Siege Tank | ✅ | ✅ | 🟡 | ✅ tank + siege clips | ❓ | ✅ | ✅ siege mode | ❌ |
| Goliath | ✅ | ✅ | ✅ | 🟡 marine clip / missile swoosh | 🟡 muzzle flash (ground); missile (air) | ✅ | ➖ | ❌ |
| Thor | ✅ | ✅ | 🟡 | 🟡 tank boom reused | ❓ | ✅ | ❌ High Impact Payload | ❌ |
| Medivac | ✅ | ✅ | 🟡 | 🔧 heal beam is synth | ❓ | ✅ | 🟡 heal only | ❌ |
| Wraith | 🔧 | ❌ | ✅ | ✅ | ❓ | ✅ | ✅ cloak | ❌ |
| Banshee | ✅ | ✅ rotor blades spin inside their cowls | 🟡 | ✅ | ❓ | ✅ | ❌ cloak (Wraith has it, Banshee doesn't) | ❌ |
| Liberator (new) | ✅ | ✅ | 🟡 | ❓ | ❓ | 🟡 | ❌ Defender Mode | ❌ |
| Raven (new) | ✅ | ✅ | 🟡 | ❓ | ❓ | 🟡 | ❌ auto-turret / interference | ❌ |
| Battlecruiser (new) | ✅ | ✅ | 🟡 | ❓ | ❓ | 🟡 | ❌ Yamato / Tactical Jump | ❌ |
| Viking | 🟡 = Wraith | 🟡 | 🟡 | 🟡 | ❓ | 🟡 | ❌ Assault Mode | ❌ |
| Cyclone | ✅ | ✅ | 🟡 Liquipedia numbers | ❌ | ❓ | ❌ | ❌ Lock On | ❌ |
| Odin | ✅ | 🟡 | 🟡 estimated (no Liquipedia page) | ❌ | ❓ | ❌ | ❌ | ❌ |
| Widow Mine, Diamondback | ❌ | ❌ | ❌ | ❌ | ❓ | ❌ | ❌ | ❌ |

### Zerg
| Unit | 3D | Anim | Stats | Attack SFX | Attack VFX | Voice | Abilities | Upgrades |
|---|---|---|---|---|---|---|---|---|
| Drone | ✅ | ✅ | 🟡 | ➖ | ➖ | 🟡 sniff clips | ✅ build / mine | ➖ |
| Zergling | 🔧 | ❌ | 🟡 | ✅ squish clip | ❓ | 🟡 roar clips | ✅ burrow | ❌ Metabolic Boost / Adrenal |
| Baneling | ✅ | ✅ | 🟡 | 🔧 synth | ❓ | 🟡 roar clips | ❌ burrow | ❌ |
| Roach | ✅ | ✅ | 🟡 | ✅ | ❓ | 🟡 roar clips | ✅ burrow | ❌ |
| Ravager | ✅ | ✅ | 🟡 | 🟡 roach clip reused | ❓ | 🟡 roar clips | ❌ Corrosive Bile | ❌ |
| Hydralisk | ✅ | ✅ | 🟡 | 🟡 pitched roach clip | ❓ | 🟡 roar clips | ✅ burrow | ❌ |
| Queen | ✅ | ✅ | 🟡 | 🟡 | ❓ | 🟡 roar clips | ✅ inject / transfuse | ❌ |
| Mutalisk | ✅ | ✅ | 🟡 | 🟡 | ❓ | 🟡 roar clips | ➖ | ❌ |
| Ultralisk | ✅ | ✅ | 🟡 | ✅ | ❓ | ✅ clip + roars | ➖ | ❌ |
| Brood Lord | ✅ | ✅ | 🟡 | 🟡 roach clip reused | ❓ | 🟡 roar clips | ➖ | ❌ |
| Viper | ✅ | ✅ | 🟡 | ❓ | ❓ | 🟡 roar clips | ❌ abduct / blinding cloud | ❌ |
| Overlord | ✅ (recoloured sculpt) | ❌ | 🟡 Liquipedia numbers | ➖ | ➖ | 🟡 sniffs | ❌ | ❌ |
| Swarm Host | ✅ (recoloured sculpt) | ❌ | 🟡 Liquipedia numbers | ❌ | ❓ | ❌ | ❌ locusts | ❌ |
| Overseer, Corruptor, Infestor, Lurker | ❌ | ❌ | ❌ | ❌ | ❓ | ❌ | ❌ | ❌ |

### Protoss
| Unit | 3D | Anim | Stats | Attack SFX | Attack VFX | Voice | Abilities | Upgrades |
|---|---|---|---|---|---|---|---|---|
| Probe | ✅ | ✅ | 🟡 | ➖ | ➖ | 🟡 gibberish clips | ✅ build / mine | ➖ |
| Zealot | ✅ | ✅ | 🟡 | 🟡 squish clip | ❓ | 🟡 synth chatter clips | ❌ Charge | ❌ |
| Stalker | ✅ | ✅ | 🟡 | 🟡 laser clip | ❓ | 🟡 synth chatter clips | ✅ blink | ❌ |
| Sentry | 🔧 | ❌ | 🟡 | 🟡 laser clip | ❓ | 🟡 radar / chatter clips | 🟡 guardian shield (no force field / hallucination) | ❌ |
| Archon | ✅ | ✅ | 🟡 (plays as an Immortal) | 🟡 tank clip | ❓ | 🟡 servo clips | ➖ | ❌ |
| Void Ray | ✅ | ✅ | 🟡 | 🟡 laser clip (pitched) | ❓ | 🟡 servo clips | ❌ Prismatic Alignment | ❌ |
| Immortal | ✅ | ✅ | 🟡 Liquipedia numbers | 🟡 laser clip (low) | ❓ | 🟡 servo / chatter clips | ❌ Barrier | ❌ |
| Colossus | ✅ | 🟡 walk exaggerated | 🟡 Liquipedia numbers | 🟡 laser clip (very low) | ❓ | 🟡 servo / chatter clips | ❌ Extended Thermal Lance | ❌ |
| Carrier | ✅ | ✅ | 🟡 Liquipedia numbers | 🟡 laser clip | ❓ | 🟡 servo / chatter clips | ❌ no Interceptors | ❌ |
| Tempest | ✅ | ❌ | 🟡 Liquipedia numbers | 🟡 laser clip (very low) | ❓ | 🟡 servo / chatter clips | ❌ | ❌ |
| Adept | ✅ | ✅ | 🟡 Liquipedia numbers | 🟡 laser clip (high) | ❓ | 🟡 synth chatter clips | ❌ Psionic Transfer | ❌ |
| Phoenix, Oracle, High/Dark Templar, Disruptor, Observer, Warp Prism, Mothership | ❌ | ❌ | ❌ | ❌ | ❓ | ❌ | ❌ | ❌ |

---

## 2. Buildings

| Building | 3D | Anim | Stats | SFX (place / die) | Production / function | Upgrades / tech |
|---|---|---|---|---|---|---|
| **Terran** | | | | | | |
| Command Center | ✅ | 🟡 | 🟡 | ✅ | ✅ SCVs, lift-off / land | ➖ |
| Orbital Command | ✅ | 🟡 | 🟡 | ✅ | ✅ MULE, scan | ✅ |
| Planetary Fortress | 🟡 CC model | ❌ | 🟡 | ✅ | ✅ | ✅ |
| Supply Depot ★ | ✅ | ✅ raise / lower | ✅ | ✅ | ✅ | ➖ |
| Refinery ★ | ✅ | 🟡 | 🟡 | ✅ | ✅ | ➖ |
| Barracks | ✅ | 🟡 | 🟡 | ✅ | ✅ 4 units, lift-off | ✅ Tech Lab / Reactor |
| Engineering Bay ★ | ✅ GLB from the SC2 reference art (sloped hull, procedural PBR detail, team colour, construction stages) | ❌ | 🟡 | ✅ | ✅ | 🟡 Weapons / Armor levels only |
| Bunker | ✅ | 🟡 | 🟡 | ✅ | ✅ load / unload / salvage | ➖ |
| Missile Turret | ✅ | ✅ | 🟡 | ✅ | ✅ | ➖ |
| Factory | ✅ | 🟡 | 🟡 | ✅ | ✅ 4 units | ✅ add-ons |
| Armory ★ | ✅ hand-made PBR GLB, team-colour mesh, glowing green lights, construction stages | ❌ | 🟡 | ✅ | ✅ | 🟡 vehicle / ship levels |
| Starport | ✅ | 🟡 | 🟡 | ✅ | ✅ 3 units | ✅ add-ons |
| Tech Lab / Reactor ★ | 🔧 | ❌ | 🟡 | ✅ | ✅ | ➖ |
| Sensor Tower, Ghost Academy, Fusion Core | ❌ | ❌ | ❌ | ❌ | ❌ (Ghost / BC have no tech gate) | ❌ |
| **Zerg** | | | | | | |
| Hatchery | ✅ | 🟡 | 🟡 | ✅ | ✅ 11 units | ❌ Lair / Hive |
| Spawning Pool | ✅ | 🟡 | 🟡 | ✅ | ✅ | ❌ |
| Overlord Pod, Roach Warren, Hydralisk Den, Spine Crawler, Extractor | 🔧 | ❌ | 🟡 | ✅ | ✅ | ❌ |
| Infestation Pit, Hive | ✅ | 🟡 | 🟡 | ✅ | 🟡 Pit gates Swarm Host; Hive is a tech-tier building (no Lair morph) | 🟡 Pit prerequisite is the Hydralisk Den (stand-in for the Lair) |
| Evolution Chamber, Spire, Baneling Nest, Spore Crawler… | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Primal Hive, Gun Tower | model kept (`public/models/`), not wired in (not used by any mission) | | | | | |
| **Protoss** | | | | | | |
| Nexus | ✅ | 🟡 | 🟡 | ✅ | ✅ probes, chrono boost | ➖ |
| Gateway | ✅ | 🟡 | 🟡 | ✅ | ✅ | ➖ |
| Pylon, Forge, Photon Cannon, Assimilator, Stargate | 🔧 | ❌ | 🟡 | ✅ | ✅ | ❌ |
| Cybernetics Core, Twilight, Robotics, Templar Archives, Fleet Beacon… | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 3. Game systems

| System | Status | Notes |
|---|---|---|
| Economy: minerals, gas, supply | ✅ | MULE, inject, chrono boost included |
| Fog of war + minimap | ✅ | |
| Cloak / burrow / detection | ✅ | scan, detectors |
| Creep | ✅ | Zerg only |
| Control groups, hotkeys, camera hotkeys | ✅ | build chords (B / V) have an open bug report |
| Touch controls (iPad) | ✅ | not in SC2 |
| First / third person possession | ✅ | not in SC2 |
| Generic upgrades (Weapons, Armor ×3) | ✅ | one track per unit class |
| Unit-specific upgrades (Stim, Charge, Blink, Metabolic Boost…) | ❌ | the biggest unit-side gap |
| Tech tree depth | 🟡 | roughly 40% of SC2's buildings exist |
| Skirmish vs AI | 🟡 | one AI file serves all three races; difficulty Recruit → Grandmaster |
| Multiplayer 1v1 / Co-op (relay) | ✅ | host-authoritative |
| Ladder, matchmaking, replays, observer | ❌ | |
| Map editor / Arcade | ❌ | |
| Skirmish maps | 🟡 | 3 hand-built maps vs SC2's ladder pool |
| Music | 🟡 | public-domain classical + menu theme, no SC2 score |
| Adjutant / event voice lines | ✅ | clip set under `public/audio/voices` |
| Unit voice acting | 🟡 | Terran clips for 9 units; Zerg use per-unit roar / growl / sniff clips and Protoss synthetic chatter / servo clips (all stand-in sound effects, not SC2 lines) |
| Cinematics / cutscenes | 🟡 | one opening cutscene; no per-mission cinematics or briefing videos |
| Achievements, collection, commanders (Co-op) | ❌ | |

---

## 4. Campaign

| Campaign / mission | Map | Objectives / win rules | Timings | Units used | Story / dialog | Cinematic |
|---|---|---|---|---|---|---|
| **Original 4-mission campaign** (Outpost 42069 …) | ✅ | ✅ played end to end | ✅ | ✅ | 🟡 | 🟡 |
| **Nova Covert Ops (9 missions)** | 🟡 hand-built; mission 1 checked in a browser | 🟡 data-driven, no full playthrough | 🟡 many estimates (`UNVERIFIED`) | 🟡 stand-ins | ❌ briefing text only | ❌ |
| 1. The Escape | ✅ walkable, no stray resources | 🟡 | 🟡 | 🟡 Warhawk = Battlecruiser | ❌ | ❌ |
| 2–9. Sudden Strike … End Game | 🟡 connected by script, layout unchecked | 🟡 | 🟡 | 🟡 | ❌ | ❌ |
| **Wings of Liberty (29 missions)** | 🟡 hand-laid approximations | 🟡 objectives and unlock rules follow Liquipedia | 🟡 estimates | 🟡 see below | ❌ | ❌ |
| Terran missions (Liberation Day … Gates of Hell) | 🟡 | 🟡 | 🟡 | 🟡 Raynor / Tychus = buffed Marine / Marauder | ❌ | ❌ |
| Protoss missions (Whispers of Doom, A Sinister Turn, Echoes, In Utter Darkness) | 🟡 | 🟡 | 🟡 | 🟡 Zeratul / Tosh = Nova-type hero; Mothership etc. = boosted units | ❌ | ❌ |
| Hero abilities (Raynor, Tychus, Swann, Stetmann, Tosh, Zeratul) | ➖ | ➖ | ➖ | ❌ | ❌ | ❌ |
| Campaign tech: Armory upgrades, mercenaries, research | ➖ | ➖ | ➖ | ❌ | ❌ | ❌ |

Known estimates per mission: `bun tools/campaign/gaps.ts [nco|wol]`. Map health: `bun tools/campaign/mapcheck.ts`.

---

## 5. Where the biggest gaps are

1. **Unit abilities and upgrades**: Stim, Concussive, Charge, Spider Mines, Yamato, Cloak on Banshee, and every Protoss / Zerg tech building.
2. **Missing units**: about 13 of SC2's multiplayer units still have no model; 9 more are now buildable (Cyclone, Odin, Overlord, Swarm Host, Immortal, Colossus, Carrier, Tempest, Adept) with Liquipedia stats (Odin estimated), but the tech gates use stand-in buildings because Robotics Facility / Bay, Fleet Beacon, Cybernetics Core and Infestation Pit don't exist yet.
3. **Campaign polish**: no cinematics, dialog or hero abilities; every timer flagged `UNVERIFIED` is a guess.
4. **Audio**: the weapon sounds are largely reused clips (🟡) or synth (🔧); Zerg and Protoss have no real voice lines, only stand-in roars and synth chatter; Protoss weapons use three laser clips pitched per unit; SCVs use a repair clip; Protoss deaths use mechanical collapse clips.
5. **Art**: Wraith, Sentry, MULE and most Zerg / Protoss structures are code-made stand-ins.
