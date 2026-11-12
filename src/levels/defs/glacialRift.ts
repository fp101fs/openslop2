import { LevelDef, Op } from '../LevelTypes';
import { ell, mirrorBase, mirrorPt, mkBase, withMirror } from '../LevelHelpers';

/**
 * Glacial Rift (design 140x140, 2 players, 180° rotational symmetry; shipped scaled up). Frozen highlands.
 * Corner mains on tier-3 ice shelves, a west-edge natural reached by a long ramp, an open low-ground third on the north
 * lane, mountain ridges that funnel the centre into a pass with a raised watch plateau, and frozen ponds.
 */
const S = 140;
const half: Op[] = [
  { op: 'tier', shape: ell(26, 26, 17, 16), tier: 3, wob: 2, plaza: true },          // main
  { op: 'tier', shape: ell(24, 64, 13, 15), tier: 2, wob: 1.6, plaza: true },        // natural terrace on the west edge
  { op: 'ramp', a: [26, 38], b: [26, 51], width: 6, t0: 3, t1: 2 },
  { op: 'ramp', a: [34, 70], b: [46, 74], width: 8, t0: 2, t1: 0 },
  { op: 'massif', shape: ell(52, 48, 5.5, 13, -0.55), tier: 4, wob: 2.2 },            // ridge shielding the main's flank
  { op: 'massif', shape: ell(84, 36, 5, 11, 0.2), tier: 4, wob: 2.2 },
  { op: 'massif', shape: ell(14, 98, 7, 5), tier: 4, wob: 1.8 },
  { op: 'pit', shape: ell(98, 22, 9, 6, 0.3), depth: 1, wob: 1.4, liquid: true },     // frozen pond
  { op: 'tier', shape: ell(70, 70, 9.5, 9.5), tier: 1, wob: 1, plaza: true },        // centre watch plateau
  { op: 'ramp', a: [58, 58], b: [64, 64], width: 6, t0: 0, t1: 1 }
];
const ops: Op[] = withMirror(half, S, 'rot');

const baseHalf = [
  mkBase([26, 26], Math.PI * 1.25, 'main'),
  mkBase([24, 66], Math.PI, 'natural'),
  mkBase([66, 22], -Math.PI / 2, 'third')
];
const bases = [...baseHalf, ...baseHalf.map(b => mirrorBase(b, S, 'rot'))];

export const glacialRift: LevelDef = {
  id: 'glacial_rift',
  name: 'Glacial Rift (2P Large)',
  subtitle: 'Ice shelves, mountain ridges, frozen ponds',
  description: 'Big 210x210 two-player map on frozen highlands: tier-3 ice-shelf mains, long-ramp edge naturals, an open north lane third, towering ridges forming a central pass and a raised watch plateau.',
  size: S,
  theme: 'frost',
  ops,
  bases,
  starts: [
    { base: 0, defense: [26, 41] },
    { base: 3, defense: mirrorPt([26, 41], S, 'rot') }
  ],
  props: [
    { kit: 'spire', zone: 'massif', density: 6, scale: [1.2, 2] },
    { kit: 'boulder', zone: 'massif', density: 2.5, scale: [1, 1.8] },
    { kit: 'spire', zone: 'border', density: 7, scale: [1.2, 2.1] },
    { kit: 'pine', zone: 'border', density: 5, scale: [1, 1.7] },
    { kit: 'boulder', zone: 'cliff', density: 3, scale: [0.4, 0.9] },
    { kit: 'pine', zone: 'open', density: 0.7, scale: [0.8, 1.3], minDistBase: 12 },
    { kit: 'boulder', zone: 'open', density: 0.7, scale: [0.4, 1], minDistBase: 9 },
    { kit: 'pebbles', zone: 'open', density: 3, scale: [0.8, 1.5], minDistBase: 7 },
    { kit: 'pillar', zone: 'plaza', density: 0.35, scale: [0.9, 1.3], minDistBase: 14 }
  ],
  richness: 1500
};
