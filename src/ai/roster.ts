/**
 * The multiplayer roster of each race, derived from the game's own production menus (BUILDING_CONFIGS.produces filtered by the
 * 'multiplayer' unit set), the in-place morphs (UNIT_MORPHS), the Archon merge and each race's build menus (FACTION_TECH).
 * Used by the AI reachability tests and the audit script, so a unit added to a menu is automatically expected from the AI.
 */
import { BUILDING_CONFIGS, FACTION_TECH, UNIT_MORPHS, UNIT_CONFIGS, unitInSet } from '../config';

type Race = 'terran' | 'zerg' | 'protoss';

export function rosterUnits(race: Race): string[] {
  const out = new Set<string>();
  for (const [type, cfg] of Object.entries(BUILDING_CONFIGS)) {
    if (cfg.race !== race) continue;
    for (const u of cfg.produces) if (unitInSet('multiplayer', u)) out.add(u);
    void type;
  }
  for (const m of UNIT_MORPHS) if (out.has(m.from) && unitInSet('multiplayer', m.to)) out.add(m.to);
  if (race === 'protoss') out.add('archon');
  return [...out].filter(u => UNIT_CONFIGS[u as keyof typeof UNIT_CONFIGS]);
}

/** Structures in the build menus plus the in-place structure morphs and add-ons. */
export function rosterBuildings(race: Race): string[] {
  const t = FACTION_TECH[race];
  const out = new Set<string>([t.townHall, ...t.basicBuild, ...t.advancedBuild]);
  if (race === 'terran') ['orbital_command', 'planetary_fortress', 'techlab', 'reactor'].forEach(b => out.add(b));
  if (race === 'zerg') ['lair', 'hive', 'greater_spire', 'creep_tumor'].forEach(b => out.add(b));
  if (race === 'protoss') out.add('warp_gate');
  return [...out];
}
