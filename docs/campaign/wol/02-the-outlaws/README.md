# WoL 2 — The Outlaws: how it fits the mission data format

Not research yet (for that, see `docs/campaign/wings-of-liberty.md` and, later, a deep-research section here like Mission 1's). This note checks that Mission 2's mechanics can be built as an `.openslop2mission` without new engine code. A tested skeleton is `src/campaign/data/fixtures/outlaws_skeleton.openslop2mission` (`src/campaign/data/outlaws.test.ts`).

| Mechanic | In the data format |
|---|---|
| Base building, income, supply | `noPlayerBase: false` (the player gets the map's home base), `startingMinerals`, `startingUnits` / `startingBuildings`; leave `aiOff` on (triggers drive the enemy) |
| Allied rebel base under attack | groups owned by `player` with `scripted: true` (visible, can't be controlled) |
| Raids on the rebels | trigger `every` N s with `if: objective "outlaws" active` → `spawn` a raider group whose behaviour is `attackMove` along a path |
| Rescue | trigger `enter` the rebel region → `transfer` the rebel groups to the player (`scripted` is cleared) + `objective complete` + a line |
| Resource pallets | `pickups: [{ id, at, minerals, gas }]`; a player unit walking over one takes it; condition `{ k: 'pickup', n }` |
| Destroy the Dominion dig base | enemy building groups + `wiped` → `objective complete` |
| Medics / Tech Lab unlocks | campaign tech gating is engine-side (not mission data); no change needed for the format |

Open questions for the real mission (UNVERIFIED until researched): raid interval and size per difficulty, the number and value of pallets, whether the rebel base's structures transfer or only its units, and the Dominion base layout.
