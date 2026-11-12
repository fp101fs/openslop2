# Fix List

Ordered by priority (score in brackets).

## Critical: input and performance
- [x] **1. Action buttons need more than one click (e.g. Build SCV)** [98]: commands must run on the first click every time. *Fixed: with a mouse, command card buttons now fire on press, like SC2.*
- [ ] **2. Units load twice, and the main menu stutters** [95]: stop loading every 3D asset in the menu. Preload only the core assets, load the starting units when the match launches, then load matchup-specific assets one at a time in the background.
- [ ] **3. Default unit aggression and leash range** [92]: units shouldn't chase enemies off-screen. Limit target pickup to aggro/sight radius and respect hold-fire.

## Core faction mechanics
- [ ] **4. Protoss shield regen** [90]: 2 shield/sec after 10s without taking damage.
- [ ] **5. Zerg unit HP regen** [89]: 0.38 HP/sec passive (0.27 on Normal speed).
- [ ] **6. Zerg structure HP regen** [88]: 0.38 HP/sec, on or off creep (as in SC2). Zerg buildings take no damage from being off creep.

## Movement and placement
- [ ] **7. Worker acceleration and turn rate** [85]: accel ≈ 2.5–3.0 and a turning arc, so workers don't snap instantly to full speed.
- [ ] **8. Extractor lines up with the geyser** [83]: the snap is misaligned, which breaks gas mining and pathing.
- [ ] **9. Placement grid updates as creep spreads** [82]: the ghost should turn from red to green as creep reaches it.
- [ ] **10. Placement preview is a green model, not a green box** [80]: show a see-through green version of the building's real model.

## Gameplay logic and UI sync
- [ ] **11. Kill tracking** [78]: the kill count on units (e.g. Siege Tanks) doesn't go up when they kill something.
- [ ] **12. Rally points only on production buildings** [77]: CC, Barracks, Gateway, Hatchery, etc. Not on Tech Lab, Supply Depot or other utility buildings.
- [ ] **13. Widow Mine** [76]: built from the Factory. Sentinel Missile does 125 (+35 shields) to its main target and 40 (+25 shields) splash, with a 29s cooldown. It is revealed while on cooldown unless you have an Armory. It must be burrowed to attack. Drilling Claws makes burrowing 3× faster.

## Visual polish
- [ ] **14. Construction stages by race** [75]: Terran builds up from a wireframe, Protoss warps in inside a glowing sphere, Zerg mutates from a drone cocoon.
- [ ] **15. Siege Tank stabilizers show in Tank Mode** [74]: the feet should only come down in Siege Mode.
- [ ] **16. Attack range circle** [72]: show a dashed white ring at weapon range for the selected unit or building.
- [ ] **17. Worker count badges** [70]: bases show "Workers x/16" (24 max) and geysers "x/3". The text turns red when oversaturated.
- [ ] **18. Strip the main menu down to the first column, centered, with no 3D** [68]: this stops the canvas from rendering in the menu and fixes the jitter.
- [ ] **19. Banshee missiles** [65]: fire straight ahead with straight smoke trails and small thruster flares, not looping curves.
- [ ] **20. Pylon power field** [63]: a faint see-through blue glow on the ground, not a solid disc.

## HUD layout
- [x] **21. Swap the top bar left/right** [60]: minerals, gas, supply and Menu/Help go top-right. *Done: resources top-right, buttons/timer top-left.*
- [x] **22. Hide the bottom middle panel when nothing is selected** [58]
- [x] **23. Terran names and footprints** [55]: "Tactical Command" becomes Engineering Bay and "Phalanx SAM" becomes Missile Turret. Factory footprint is 3×3 (plus add-on). The Command Center is 5×5, so they differ. *Done: renamed; Factory was already 3×3. Town halls are now 5×5 like SC2, with SC2 base layouts (resources 3 cells out) on every map.*
- [x] **24. Remove the "Restart Level" button from the top bar** [52]: the Esc menu already has "Restart Mission".

## Assets
- [x] **25. Geyser and Refinery rotation match** [50]: the meshes should share the same rotation so they don't clip. *Checked: both yaw 0 on the same centre; the geyser mesh hides under a gas building.*
- [x] **26. Refinery model goes back to the single smoke stack** [47] *Done: Renn01's pack Refinery (one stack); code-built fallback is single-stack again.*
