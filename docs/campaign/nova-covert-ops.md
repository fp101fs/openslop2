# Nova Covert Ops — mission spec (research notes)

Source: StarCraft Wiki (starcraft.fandom.com, CC-BY-SA), read in Chrome on 2026-11-07, paraphrased. This is the spec each
`src/campaign/missions/nco/*.ts` file implements. Mark corrections here first, then in the mission file.
Numbers marked (?) were not stated on the page and are our own tuning.

Enemy faction key: DoM = Defenders of Man (Terran), FZ = feral zerg, TD = Tal'darim Death Fleet (Protoss).

## Pack 1
### 1. The Escape (Sharpsburg) — hero mission, 3 phases
- Objectives: escape the facility; reach the spaceport; Nova must survive. Bonus: rescue 3 ghosts (1 is automatic at the end of phase 1, 2 are in the south).
- Phase 1 stealth: Nova permanently cloaked; avoid ghost detection (cones), turrets (flame turrets, cyclones). Pick up C-20A canister rifle (unlocks Snipe) then pulse grenades. Kill ghosts from behind/range. Neighbouring ghosts step forward when one dies. Ghost allies follow and attack.
- Phase 2 vehicle chase on a freeway: Nova + Stone on vulture bikes; dodge civilian vehicles; enemy vultures, hellions, banshees. Snipe one-shots vultures/hellions; banshee = snipe + auto. Pulse bomb for 3+ vultures. Restoration cubes appear at low health. If Stone's bike dies he leaves and Nova arrives alone.
- Phase 3 Warhawk boss: rocket volleys (red circles), switches lane and fires a laser across the road, banshees join, final fast volley. Mission ends when it dies.
- Achievements/targets: 20 snipe kills; no flame-turret damage; no Warhawk damage on Hard+; reach bike staging area < 5 min.
- Hidden: a reptile crate critter that wanders (trivia).
### 2. Sudden Strike (Borea) — base defence vs FZ
- Objective: defend Horner's base. Bonus: secure Military Research Center, secure Experimental Weapons Lab (appear halfway; only reapers can reach; the second falls fast on high difficulty).
- 4 lanes zerg arrive through; limited starting minerals; Reapers (spider mines, jump pack), Marines, Marauders; bunker metal plates mark build spots; Nova with a jump jet. Horner's AI base holds the Command Center + refineries.
- Waves escalate to ultralisks + a brutalisk; last wave heavy then mission ends even if base falls. Defilers (dark swarm), ravagers, banelings.
- Targets: 30 spider-mine kills; lose <= 5 structures (Normal), 0 (Hard+); 200 mine kills (Normal).
- Ending: Defenders of Man battlecruisers arrive.
### 3. Enemy Intelligence (Tarsonis) — 2 phases
- Phase 1 base build: garrison units in 5 buildings (garrisons are invulnerable once filled). Clear infested pustules (grenades/shotgun/nuke) then run units in (stim). Zerg attack from north, then east, then west. New units: Siege Tank, Hellbat. Rescued troops (bonus) count toward supply.
- Phase 2 infiltration: Nova auto-switches to monomolecular blade, stealth suit + visor, flashbangs (5 s stun, switches off detectors). Reach the command room. Nova must survive. Zerg pour in via psi emitter; Zerg kills don't count as DoM kills. Bonus: rescue survivors.
- Targets: fill 2 garrisons < 10 min (5 on Normal); kill no DoM; <= 35 supply in phase 1 on Hard+.

## Pack 2
### 4. Trouble in Paradise (Tyrador IX) — 2 phases, timed
- Phase 1 (Nova must survive): destroy zerg hatcheries before reinforcements arrive (6 hatcheries; bonus: all remaining 6). Banshees with cloak + Nova; a nuke is provided.
- Phase 2: destroy 4 shield projectors (photon-cannon guarded, spread out); each destroyed projector triggers a protoss attack wave; then the Tal'darim mothership attacks the base (line attack, interceptors, detection, warp-in) — destroy it. Civilian shelter must survive. Bonus: Tal'darim fleet beacon on a south-east island reachable by a shallow-water strip. New units: Goliath, Banshee.
- Targets: 3 / 6 hatcheries before reinforcements; DoM lose <= 20 structures; mothership not fully powered on Hard+.
### 5. Night Terrors (Jarban Minor) — holdout / extraction
- Objectives: extract terrazine from 6 extraction devices; devices must not be destroyed (3 may be lost). Bonus: explore Umojan mine (blightbringer boss), explore science facility (2 eradicators boss) — the outside battle pauses while Nova is inside.
- Endless infested waves (volatile infested, infested banshees/tanks, mutas) + Tal'darim raids on devices (path shown on minimap, warp prism). Umojan outpost in the centre: resources, extraction device, HERC compound, missile turret, bunker with 4 War Pigs. Competitor ji'nara destroys devices counter-clockwise from the player's base's right. New units: Liberator, Raven; siege tanks need no tech lab.
- Targets: 500 liberator kills; no devices lost; no Tal'darim kills on Hard+; no tanks/liberators on Normal.
### 6. Flashpoint (Antiga Prime) — holdout / memory sites
- Objective: search 6 coordinates (memory sites) with Nova, then reach the operations centre (NE corner). Bonus: recover experimental weapon in the middle (two zerg clusters guard it).
- Each memory site: cinematic flashback, then removes/reveals the structures of one zerg strain (banelings, brood lords, ultralisks, nydus worms, lurkers, mutalisks); destroying those structures ends that strain in attack waves. The map expands as sites are cleared; waves enter from further back; nydus always near the base until cleared; overseers spawn forever from the corners; corruptors patrol on high difficulty.
- Targets: 75 zerg killed with nukes; destroy all zerg structures; do not eliminate any unit type on Hard+; 50 units with one nuke.

## Pack 3
### 7. In the Enemy's Shadow (Vardona) — infiltration, Nova only
- Objectives: infiltrate; deactivate 2 door locks (east terminal needs a dominated scientist; west terminal is in the hangar guarded by sonar drones and an elite battlecruiser); Nova must survive; then defeat Stone and arrest Davis. Bonus: investigate energy signal (indoctrination visor in the sewers; dominate enemies, a Thor in the sewer), obtain tactical gear (phase reactor suit, NE, ghosts+turrets), obtain advanced weaponry (special ordnance cache near hangar with a Thor), secret blazefire gunblade.
- Laser gates, sensor/sonar drones, gun turrets (high HP), cyclones, a siege tank, recovery terminals.
- Stone boss: 450 HP, collapses below 50; EMP to reveal, snipe, defensive matrix (10 dmg per hit), cloak + teleport; at 75% sensor drones spawn in the corners. Dominated units may help.
- Targets: timer achievement (jumpjet rush); bring the sewer Thor through a door at the end.
### 8. Dark Skies (Vardona) — lane defence vs TD
- Objective: defeat the Death Fleet. Bonus: protect the science facility (front-centre lane building). 3 lanes at first, 4 more open later (2 per side). Dominion + DoM defenders ally. New: Battlecruisers (+ tactical jump, Yamato); Gorgon strafing runs, one per starting lane with cooldowns 180/240/300 s (Normal/Hard/Brutal). Subway to move ground forces. Mothership appears at several points. Nova starts with siege tanks and liberators.
- Targets: One Woman Army (nuke kills); no lane lost.
### 9. End Game (Cerros Shipyards) — boss defence
- Objectives: do not let 5 Gorgons be destroyed; destroy the Xanthos. Final short section: kill Davis.
- Xanthos: near-invulnerable while its modules are up; modules = flamethrower, rail gun, fighter bay, missile launcher; destroying them forces it to the repair bay where it is vulnerable; final new mode fires a long-charge line laser; summons reinforcements 3 times; trajectory shown on the minimap; heads to one of the 5 Gorgons and slows when it meets enemies.
- Player starts with a base in the lower right, a north base for economy; battlecruisers with special ordnance; capture enemy tech reactors; Hyperion (Horner) pushes a lane between waves; DoM attack waves (later with nuke ghosts) between Xanthos waves.
- Targets: Bringing Down the Big Guns (Yamato everything after wave 2).

---
# Liquipedia additions (read in Chrome 2026-11-07; paraphrased) — authoritative for numbers below

## Campaign flow (linear)
- 9 missions, strict order, 3 packs of 3. Difficulties: Casual/Normal/Hard/Brutal. Between missions Nova picks 4 equipment pieces (one each: helmet, suit, gadget, weapon) and unit technologies (each tech can be on only ONE unit type at a time).
- All Covert Ops units are "Elite" (mercenary-grade) and a few upgrades are free from the start (Combat Shields marines, Concussive Shells marauders).
- Rewards per mission (new units | in-mission equipment | reward equipment | reward unit tech):
  1 The Escape: - | C-20A Canister Rifle, Pulse Grenade, Ghost Visor, Tactical Stealth Suit | Hellfire Shotgun, Flashbang Grenades | Spider Mines
  2 Sudden Strike: SCV, Marine, Reaper, Marauder | Turbojet Jumpsuit | Rangefinder Oculus | Laser Targeting System, Internalized Tech Module, Super Stimpack, Jump Jets
  3 Enemy Intelligence: Hellbat, Siege Tank | Monomolecular Blade (phase 2) | Stim Infusion | Advanced Cloaking Field
  4 Trouble in Paradise: Goliath, Banshee | - | Apollo Infantry Suit | Regenerative Bio-Steel, Smart Servos
  5 Night Terrors: Liberator, Raven | - | Holo Decoy | Magrail Munitions
  6 Flashpoint: - | - | Plasma Rifle | -
  7 In the Enemy's Shadow: - | Indoctrination Visor, Phase Reactor Suit, Blazefire Gunblade (the Phase suit and Gunblade are collected as bonus/secret pickups) | - | Special Ordnance, Optimized Logistics
  8 Dark Skies: Battlecruiser | - | Ionic Force Field | -
  9 End Game: - | - | - | -
  (Fandom: Phase Reactor Suit comes from the Tal'darim fleet beacon bonus in Trouble in Paradise — CONFLICT with Liquipedia's mission 7 pickup; Liquipedia table used.)

## Nova abilities / equipment (exact stats)
- Permanent cloak (Tactical Stealth Suit): +150 life, +1 armor, +0.25 speed.
- C-20A Canister Rifle: dmg 30, range 7, cd 1.5, hits ground+air. Snipe: 25 energy, range 10, 125 dmg, ground/air units, not structures (Q).
- Pulse Grenades: 50 energy, range 7, cd 5, up to 100 dmg to enemy ground in area (W).
- Ghost Visor: reveals enemy units within 20, detects cloaked/burrowed.
- Break Neck (Q, melee instant kill, phase 1 stealth).
- Hellfire Shotgun: dmg 20 (+20 vs light), range 4, cd 1.5, frontal arc; Penetrating Blast 50 energy?, cd 1 s, 50 dmg (100 vs light) in an arc (Q). Flashbang: 25 energy, range 7, cd 5, 5 s stun + disables detection (W), massive/friendly immune.
- Turbojet Jumpsuit: +250 life, +2 armor, +0.5 speed, cliff jumping, cannot cloak. Rangefinder Oculus: +2 vision and +2 range on non-melee weapons.
- Monomolecular Blade: dmg 100, melee, cd 1.5, ignores armor/shields; Dash Attack 50 energy, 50 dmg in a line (Q).
- Stim Infusion: cd 25, 10 s, +50% attack and move speed, heals 200 over duration (W).
- Apollo Infantry Suit: +200 life, +1 armor, +0.25 speed, +100 energy, +50% energy regen, can cloak. Cloak: 50 energy, cd 40, 30 s (C).
- Holo Decoy: 50 energy, cd 20, 45 s; decoy deals 25% damage (W).
- Plasma Rifle: dmg 15, range 6, cd 0.86; Plasma Shot 75 energy, 100 dmg in path + slowing plasma trail (Q).
- Indoctrination Visor: Domination 25 energy, cd 30 (after cancel), D; one controlled unit at a time.
- Phase Reactor Suit: +200 life, +1 armor, +0.25 speed; Blink cd 8 s, cloaked 10 s after (C).
- Blazefire Gunblade: dmg 90 (+80 splash), range 4, cd 1.2; Fury of One 100 energy: 11 jumps in radius 5, 45 dmg each (Q).
- Ionic Force Field: 25 energy, cd 30, 10 s, damage capped at 10 per hit until 500 absorbed (W).
- Unit techs: Spider Mines (trio of mines); Super Stimpack (+50% attack+move 15 s, heals 30, autocast); Laser Targeting (+2 vision, +1 range); Internalized Tech Module (no tech lab needed); Jump Jets; Advanced Cloaking Field (permanent cloak); Regenerative Bio-Steel (10 hp/s out of combat); Smart Servos (4x faster mode change); Magrail Munitions (marine/marauder secondary attack 90 dmg, cd 30, autocast G); Special Ordnance; Optimized Logistics (much faster training).

## Per-mission corrections / extra facts
- The Escape primary objectives (5): reach the Armory, reach the Research Bay, escape the facility, reach the Starport, Nova must survive. Bonus: rescue 3 ghosts. Gotta Go Fast: reach the vulture-bike staging area within 5:00.
- Sudden Strike: mission objective text "Hold out until the Dominion arrives". Last wave is endless until the finale plays.
- Enemy Intelligence primary: garrison units (5), reach the Communication Hub, reach the Command Room, Nova must survive (phase 2 only). Dash Attack is phase 2 only; Rangefinder Oculus is phase 1 only.
- Trouble in Paradise objective text "Defeat the Zerg". Primary: destroy hatcheries before zerg arrive, Nova must survive (phase 1), destroy 4 shield projectors, civilian shelter must survive, destroy Tal'darim mothership. Bonus: destroy 6 remaining hatcheries; destroy the Tal'darim fleet beacon. (Transcript note: reinforcements timer 30 s — UNVERIFIED as real timer.)
- Night Terrors objective text "Acquire the Terrazine". Bonus (Liquipedia): explore Umojan mine, kill Eradicators, kill Blightbringer. Timing from a Hard guide: first extractor capped by ~5-6 min; Tal'darim attack the main base around 17:00; whole mission ~22-25 min when speed-running; Tal'darim first destroy the 2 south-east extractors, then proceed in order around the map; Tal'darim spawn near the right geyser of their base (warp-ins).
- Flashpoint: Liquipedia says search coordinates (5); Fandom says (6) — CONFLICT, use 5 (Liquipedia is the later edit) and flag. Objective text "Find the evidence". Bonus: recover experimental weapon.
- In the Enemy's Shadow: 2 maps (sewer then office/compound). Primary: infiltrate, deactivate door locks (2), defeat Stone, arrest Davis, Nova must survive. Sensor drone detonates after 5 s (Normal) / 2.5 s (Hard) / instantly (Brutal) once in range; laser detectors stun + call reinforcements, disabled 5 s by flashbang. Stone: shield-up/blink/cloak, charges a 100-150 dmg snipe (channel continues even if stunned), summons 2 sensor drones; after shield breaks ~3 snipes finish him. Catch Me If You Can: finish < 4:00 on Hard+; Subconscientious Objector: < 20 kills on Normal; I'm With Her: 20 kills by dominated units.
- Dark Skies objective "Hold out against the Tal'darim"; primary: defeat the Death Fleet; bonus: protect the science facility. Spawn lanes: 3 main lanes, others open later; two "odd" lanes between Gorgon lanes are weakly defended by allies. Gorgon cooldowns 180/240/300 s (N/H/B) — from Fandom. Achievements: 300 kills with Gorgons; 15 Yamato kills; 333 Nova kills (Hard+); no Gorgon (Normal). One player's clear was 12:51.
- End Game objective "Destroy the Xanthos"; primary: don't let Gorgons be destroyed (5), destroy the Xanthos, kill Davis. Start: lower-right base; enemy ghosts nuke (cloaked on Hard/Brutal). Xanthos "Missile Battery" = red circles that instantly kill ground units. Bringing Down the Big Guns: destroy before its 3rd activation (Hard+); I Am In-Nova-table: finish < 21:00 (Normal). Hyperion arrives to push a lane.

## UNVERIFIED (our estimates — change when better data exists)
- Sudden Strike length (Fandom walkthrough text says ~30 min; Namu snippet listed ~22 min at 1310-1370 s): use 22 min.
- Wave intervals/compositions for all holdout missions, lane-open schedules, extraction durations, Trouble in Paradise hatchery countdown, Flashpoint wave pacing, Xanthos activation spacing.
