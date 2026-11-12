/**
 * Terrain layouts. A layout describes everything the procedural terrain needs: map size, circular high-ground
 * plateaus (each with a carved ramp running along `dx,dy` towards the lowlands), choke mesas, sand trails and
 * the open clearings kept flat for expansions. The layout is chosen at page load (sessionStorage `sc2_boot_map`)
 * so every size-dependent system (terrain, fog, creep, minimap...) is simply built at the right size once.
 */
export interface MapLayout {
  id: string;
  size: number;
  /** `h` overrides the plateau elevation (default HIGH_GROUND_HEIGHT) so a map can have several elevation tiers. */
  plateaus: { x: number; y: number; dx: number; dy: number; h?: number }[];
  /** Destructible rock formations (block a path until destroyed). */
  rocks: { x: number; y: number; size: number }[];
  mesas: { x: number; y: number }[];
  trails: { a: [number, number]; b: [number, number] }[];
  clearings: { x: number; y: number }[];
  playerBase: { x: number; y: number };
  enemyBase: { x: number; y: number };
  /** Present on data-driven levels (src/levels): terrain, pathing and resources come from the LevelDef instead of the plateau lists. */
  level?: LevelDef;
}

import { LEVELS } from './levels';
import type { LevelDef } from './levels/LevelTypes';
import { settleLevel } from './levels/BaseLayout';

const D = Math.SQRT1_2;

export const LAYOUTS: Record<string, MapLayout> = {
  standard: {
    id: 'standard',
    size: 120,
    plateaus: [{ x: 25, y: 25, dx: D, dy: D }, { x: 95, y: 95, dx: -D, dy: -D }],
    mesas: [{ x: 46, y: 74 }, { x: 74, y: 46 }],
    rocks: [
      { x: 38, y: 58, size: 3.4 }, { x: 41.4, y: 58, size: 3.4 }, { x: 34.6, y: 58, size: 3.4 },
      { x: 82, y: 62, size: 3.4 }, { x: 78.6, y: 62, size: 3.4 }, { x: 85.4, y: 62, size: 3.4 }
    ],
    trails: [{ a: [25, 25], b: [95, 95] }],
    clearings: [{ x: 60, y: 60 }],
    playerBase: { x: 25, y: 25 },
    enemyBase: { x: 95, y: 95 }
  },
  // Lost Temple (StarCraft 1 inspiration): 240x240, four corner high-ground mains with ramps toward the centre,
  // a ring of naturals, and a central temple cluster of four mesas leaving open diagonal lanes.
  lost_temple: {
    id: 'lost_temple',
    size: 240,
    plateaus: [
      { x: 45, y: 45, dx: D, dy: D },
      { x: 195, y: 195, dx: -D, dy: -D },
      { x: 45, y: 195, dx: D, dy: -D, h: 3.5 },   // highest ground (3 elevation tiers: low / main / top)
      { x: 195, y: 45, dx: -D, dy: D, h: 3.5 }
    ],
    rocks: [
      { x: 100, y: 72, size: 3.6 }, { x: 103.6, y: 72, size: 3.6 }, { x: 96.4, y: 72, size: 3.6 },
      { x: 140, y: 168, size: 3.6 }, { x: 143.6, y: 168, size: 3.6 }, { x: 136.4, y: 168, size: 3.6 },
      { x: 72, y: 140, size: 3.6 }, { x: 72, y: 143.6, size: 3.6 }, { x: 72, y: 136.4, size: 3.6 },
      { x: 168, y: 100, size: 3.6 }, { x: 168, y: 103.6, size: 3.6 }, { x: 168, y: 96.4, size: 3.6 }
    ],
    mesas: [{ x: 100, y: 120 }, { x: 140, y: 120 }, { x: 120, y: 100 }, { x: 120, y: 140 }],
    trails: [{ a: [45, 45], b: [195, 195] }, { a: [45, 195], b: [195, 45] }],
    clearings: [
      { x: 120, y: 120 }, { x: 95, y: 45 }, { x: 45, y: 95 }, { x: 145, y: 195 }, { x: 195, y: 145 },
      { x: 95, y: 195 }, { x: 45, y: 145 }, { x: 145, y: 45 }, { x: 195, y: 95 }
    ],
    playerBase: { x: 45, y: 45 },
    enemyBase: { x: 195, y: 195 }
  }
};

// Data-driven levels: every LevelDef becomes a layout (the procedural lists stay empty, the raster supplies the terrain)
for (const lv of Object.values(LEVELS)) {
  const a = lv.bases[lv.starts[0].base]!.th, b = lv.bases[lv.starts[1].base]!.th;
  LAYOUTS[lv.id] = {
    id: lv.id, size: lv.size, plateaus: [], rocks: [], mesas: [], trails: [], clearings: [],
    playerBase: { x: a[0], y: a[1] }, enemyBase: { x: b[0], y: b[1] }, level: lv
  };
}

export const MAP_LAYOUT_OF: Record<string, string> = {
  ...Object.fromEntries(Object.keys(LEVELS).map(id => [id, id])),
  sector_vanguard: 'standard',
  obsidian_rift: 'standard',
  crystalline_oasis: 'standard',
  lost_temple: 'lost_temple'
};

/** Which map id was requested for this page load (set right before a size-changing reload). */
export const BOOT_MAP_ID: string = (() => {
  try {
    const m = sessionStorage.getItem('sc2_boot_map');
    if (m && MAP_LAYOUT_OF[m]) return m;
  } catch { /* storage unavailable */ }
  return 'sector_vanguard';
})();

export const LAYOUT: MapLayout = LAYOUTS[MAP_LAYOUT_OF[BOOT_MAP_ID]!]!;
// SC2 base geometry for this page's level (5x5 halls, resources 3 cells out, clear of walls); only the loaded level is settled
if (LAYOUT.level) {
  const lv = LAYOUT.level = settleLevel(LAYOUT.level);
  const a = lv.bases[lv.starts[0].base]!.th, b = lv.bases[lv.starts[1].base]!.th;
  LAYOUT.playerBase = { x: a[0], y: a[1] }; LAYOUT.enemyBase = { x: b[0], y: b[1] };
}

/** Expansion spots (town hall centres) of the loaded map: the settled level bases, or the procedural map's list. */
export function expansionSpots(fallback: { x: number; y: number }[]): { x: number; y: number }[] {
  const lv = LAYOUT.level;
  if (!lv) return fallback;
  const starts = new Set(lv.starts.map(st => st.base));
  return lv.bases.filter((b, i) => !starts.has(i) && (b.minerals.length || b.geysers.length)).map(b => ({ x: b.th[0], y: b.th[1] }));
}
