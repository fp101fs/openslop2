/**
 * Data-driven level format (SC1 / SC2 editor style). A level is a stack of painted height tiers, ramps between tiers,
 * impassable rock massifs and plazas, plus explicit bases (town-hall spot + mineral line + geysers). The rasteriser
 * (LevelRaster) turns it into a height field, cliff / ramp masks and a pathing grid, so every existing terrain query
 * (height, cliff walls, ramps, biome) works unchanged on any level.
 *
 * Everything here is plain data so levels, themes and prop kits can be mixed freely.
 */
export type Pt = [number, number];

export type Shape =
  | { k: 'rect'; x: number; y: number; w: number; h: number; rot?: number }   // centre + size, rotation in radians
  | { k: 'ell'; x: number; y: number; rx: number; ry: number; rot?: number }
  | { k: 'poly'; pts: Pt[] };

export type Op =
  /** Paint a flat region at `tier` (0 = lowland ... 4). `wob` roughens the edge so cliffs look natural. `plaza` paints square-tiled ground. */
  | { op: 'tier'; shape: Shape; tier: number; wob?: number; plaza?: boolean }
  /** Straight ramp from a (tier t0) to b (tier t1); `width` is the walkable corridor. */
  | { op: 'ramp'; a: Pt; b: Pt; width: number; t0: number; t1: number }
  /** Raised impassable rock mass (always a cliff, never walkable). */
  | { op: 'massif'; shape: Shape; tier: number; wob?: number }
  /** Sunken impassable chasm / liquid (blocked, lowered). */
  | { op: 'pit'; shape: Shape; depth: number; wob?: number; liquid?: boolean }
  /** Re-paint just the ground style: plaza (square tiles) on/off. */
  | { op: 'plaza'; shape: Shape; on: boolean }
  /** Paved road along a polyline (ramp-style road texture). With `tier` the road is also flattened to that tier (a trench
   *  when the ground around it is higher); without it only the texture changes. `shoulder` widens the flattened strip by
   *  that much on each side of the paving (flat verge between the road and the trench walls). */
  | { op: 'road'; pts: Pt[]; width: number; tier?: number; shoulder?: number }
  /** Unwalkable footprint that keeps the ground as it is (under a placed prop such as a gas station or statue). */
  | { op: 'block'; shape: Shape };

/** A prop placed at an exact spot (statue, gas station, sign). `kit` is a PropKits id; `variant` picks one of its meshes. */
export interface DecorDef { kit: string; at: Pt; rot?: number; scale?: number; variant?: number }

export interface BaseDef {
  /** Town hall centre. */
  th: Pt;
  /** Direction (radians) from the town hall towards its mineral line. */
  face: number;
  kind: 'main' | 'natural' | 'third' | 'pocket';
  minerals: Pt[];
  geysers: Pt[];
}

export interface StartDef {
  /** Index into `bases`. */
  base: number;
  /** Where the AI's ramp defence (bunker / spine / cannon) goes. */
  defense: Pt;
}

export type PropZone = 'cliff' | 'massif' | 'border' | 'open' | 'plaza';
export interface PropRule {
  kit: string;            // registered prop kit id (see PropKits)
  zone: PropZone;         // where it may stand
  density: number;        // instances per 100 tiles of eligible area
  scale?: [number, number];
  minDistBase?: number;   // keep clear of town halls / resources (default 12)
}

export interface LevelDef {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  size: number;
  theme: string;
  /** Tier the ground starts at before ops are applied. */
  baseTier?: number;
  ops: Op[];
  bases: BaseDef[];
  starts: [StartDef, StartDef];
  props: PropRule[];
  /** Mineral amount for non-main bases. */
  richness?: number;
  /** Props at exact spots (campaign maps). */
  decor?: DecorDef[];
}

/** Heights of the tiers in world units. */
export const TIER_HEIGHT = 1.4;
