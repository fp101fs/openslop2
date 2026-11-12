import { LevelDef, Op } from '../LevelTypes';
import { ell, mirrorBase, mirrorPt, mkBase, withMirror } from '../LevelHelpers';

/**
 * Sandstone Gulch (S, 96x96, 2 players, 180° rotational symmetry). Warm layered-rock canyon.
 * Compact rush map: a main on the high mesa, a terraced natural, an exposed low-ground third, one gold-rich centre
 * ridge with ramps on both sides and rock fins that split the middle into two lanes.
 */
const S = 96;
const half: Op[] = [
  { op: 'tier', shape: ell(21, 21, 14.5, 13.5), tier: 2, wob: 2, plaza: true },     // main mesa
  { op: 'tier', shape: ell(50, 15, 12.5, 14), tier: 1, wob: 1.2, plaza: true },       // natural terrace
  { op: 'ramp', a: [31, 20], b: [41, 21], width: 5, t0: 2, t1: 1 },                  // main ramp
  { op: 'ramp', a: [56, 24], b: [64, 33], width: 7, t0: 1, t1: 0 },                  // natural choke ramp
  { op: 'massif', shape: ell(35, 38, 4, 9, 0.25), tier: 3, wob: 2 },                 // rock fin splitting the lanes
  { op: 'massif', shape: ell(11, 41, 5, 3.5), tier: 3, wob: 1.6 },
  { op: 'massif', shape: ell(73, 11, 4.5, 3.5), tier: 3, wob: 1.6 },
  { op: 'tier', shape: ell(48, 48, 7.5, 4.5, Math.PI / 4), tier: 1, wob: 1, plaza: true },   // centre ridge
  { op: 'ramp', a: [40.5, 40.5], b: [45, 45], width: 5, t0: 0, t1: 1 }
];
const ops: Op[] = withMirror(half, S, 'rot');

const baseHalf = [
  mkBase([21, 21], Math.PI * 1.25, 'main'),
  mkBase([50, 14.5], -Math.PI / 2, 'natural'),
  mkBase([14, 58], Math.PI, 'third')
];
const bases = [...baseHalf, ...baseHalf.map(b => mirrorBase(b, S, 'rot'))];

export const sandstoneGulch: LevelDef = {
  id: 'sandstone_gulch',
  name: 'Sandstone Gulch (2P Small)',
  subtitle: 'Terraced mesas, banded sandstone, tight lanes',
  description: 'Small 96x96 rush map in a warm banded-sandstone canyon: high-ground main, terraced natural behind a single ramp, an exposed low-ground third and a central ridge splitting the lanes.',
  size: S,
  theme: 'sandstone',
  ops,
  bases,
  starts: [
    { base: 0, defense: [33, 20] },
    { base: 3, defense: mirrorPt([33, 20], S, 'rot') }
  ],
  props: [
    { kit: 'mesa_rock', zone: 'massif', density: 7, scale: [0.9, 1.5] },
    { kit: 'spire', zone: 'massif', density: 3, scale: [0.9, 1.4] },
    { kit: 'mesa_rock', zone: 'border', density: 9, scale: [1.1, 1.9] },
    { kit: 'boulder', zone: 'cliff', density: 3, scale: [0.35, 0.8] },
    { kit: 'boulder', zone: 'open', density: 1.3, scale: [0.5, 1.1], minDistBase: 8 },
    { kit: 'pebbles', zone: 'open', density: 5, scale: [0.8, 1.6], minDistBase: 7 },
    { kit: 'deadtree', zone: 'open', density: 0.5, scale: [0.9, 1.3], minDistBase: 12 }
  ],
  richness: 1500
};
