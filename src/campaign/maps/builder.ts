import type { BaseDef, DecorDef, LevelDef, Op, Pt, PropRule, Shape } from '../../levels/LevelTypes';
import { mkBase, ell, rect, poly } from '../../levels/LevelHelpers';
import { LINKS, PADS } from './links';

export { ell, rect, poly, mkBase };

/**
 * Compact recipe for a campaign level. Terrain = painted tiers + ramps + rock massifs + pits (the same ops the skirmish
 * levels use); `bases` lists every resource base, `home` / `foe` pick the player's and enemy-AI's start bases by index.
 * One file per mission map, all data, so a map fix never touches engine code.
 */
export interface MapSpec {
  id: string; name: string; subtitle: string; description: string;
  size: number; theme: 'alien' | 'sandstone' | 'marsara' | 'canyon' | 'meadow' | 'frost' | 'moss' | 'swamp';
  baseTier?: number;
  /** [shape, tier, plaza?] */
  tiers?: [Shape, number, boolean?][];
  /** [a, b, width, tierFrom, tierTo] */
  ramps?: [Pt, Pt, number, number, number][];
  massifs?: [Shape, number][];
  pits?: [Shape, number, boolean?][];
  bases: BaseDef[];
  home: number; foe: number;
  homeDefense?: Pt; foeDefense?: Pt;
  props?: PropRule[];
  richness?: number;
  /** Strip minerals/geysers from every base (objective maps where resources make no sense). */
  noResources?: boolean;
  /** Paved roads; with `tier` the road is flattened to that tier (a trench where the ground around it is higher). */
  roads?: { pts: Pt[]; width: number; tier?: number; shoulder?: number }[];
  /** Props at exact spots; `block` (tiles) makes a round unwalkable footprint under the prop. */
  decor?: (DecorDef & { block?: number })[];
}

const DEFAULT_PROPS: PropRule[] = [
  { kit: 'mesa_rock', zone: 'massif', density: 6, scale: [0.9, 1.5] },
  { kit: 'boulder', zone: 'cliff', density: 3, scale: [0.35, 0.8] },
  { kit: 'boulder', zone: 'open', density: 1.2, scale: [0.5, 1.1], minDistBase: 8 },
  { kit: 'pebbles', zone: 'open', density: 5, scale: [0.8, 1.6], minDistBase: 7 }
];

export function campaignLevel(m: MapSpec): LevelDef {
  const ops: Op[] = [
    ...(m.tiers ?? []).map(([shape, tier, plaza]): Op => ({ op: 'tier', shape, tier, wob: 1.6, plaza })),
    ...(m.roads ?? []).map((r): Op => ({ op: 'road', pts: r.pts, width: r.width, tier: r.tier, shoulder: r.shoulder })),
    ...(m.ramps ?? []).map(([a, b, width, t0, t1]): Op => ({ op: 'ramp', a, b, width, t0, t1 })),
    ...(m.massifs ?? []).map(([shape, tier]): Op => ({ op: 'massif', shape, tier, wob: 1.8 })),
    ...(m.pits ?? []).map(([shape, depth, liquid]): Op => ({ op: 'pit', shape, depth, liquid, wob: 1.4 })),
    ...(m.decor ?? []).filter(d => d.block).map((d): Op => ({ op: 'block', shape: ell(d.at[0], d.at[1], d.block!) })),
    ...(PADS[m.id] ?? []).map(([x, y, tier, r]): Op => ({ op: 'tier', shape: ell(x, y, r), tier, wob: 0.4 })),
    // generated connections go last so rock and pits never overwrite them (tools/campaign/autolink.ts assumes this order)
    ...(LINKS[m.id] ?? []).map(([a, b, width, t0, t1]): Op => ({ op: 'ramp', a, b, width, t0, t1 }))
  ];
  const bases = m.noResources ? m.bases.map(b => ({ ...b, minerals: [], geysers: [] })) : m.bases;
  const hb = m.bases[m.home]!.th, fb = m.bases[m.foe]!.th;
  return {
    id: m.id, name: m.name, subtitle: m.subtitle, description: m.description, size: m.size, theme: m.theme, baseTier: m.baseTier, ops, bases,
    starts: [{ base: m.home, defense: m.homeDefense ?? [hb[0] + 8, hb[1] + 2] }, { base: m.foe, defense: m.foeDefense ?? [fb[0] - 8, fb[1] - 2] }],
    props: m.props ?? DEFAULT_PROPS, richness: m.richness ?? 1500,
    decor: m.decor?.map(({ block: _b, ...d }) => d)
  };
}
