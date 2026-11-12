import { LevelDef, Op } from '../LevelTypes';
import { ell, mirrorBase, mirrorPt, mkBase, rect, withMirror } from '../LevelHelpers';

/**
 * Crater City (L, 176x176, 2 players, 180° rotational symmetry). Red striated canyon.
 * Per side: tier-3 main, tier-2 natural terrace, a low-ground third behind a rock spine and a fourth on the far flank.
 * The middle is a walled crater (impassable rim, four gates, a raised tier-1 watch island on the floor) that the lanes wrap around.
 */
const S = 176;
const half: Op[] = [
  { op: 'tier', shape: ell(33, 33, 20, 19), tier: 3, wob: 2, plaza: true },          // main
  { op: 'tier', shape: ell(72, 24, 15, 17), tier: 2, wob: 1.6, plaza: true },        // natural terrace
  { op: 'ramp', a: [48, 31], b: [59, 30], width: 5, t0: 3, t1: 2 },
  { op: 'ramp', a: [80, 32], b: [90, 44], width: 9, t0: 2, t1: 0 },
  { op: 'massif', shape: ell(30, 66, 5, 10, 0.2), tier: 3, wob: 2 },                  // spine sheltering the third
  { op: 'massif', shape: ell(58, 62, 4.5, 9, 0.5), tier: 3, wob: 2 },
  { op: 'massif', shape: ell(112, 30, 7, 5), tier: 3, wob: 2 }
];
const crater: Op[] = [
  { op: 'massif', shape: ell(88, 88, 27, 27), tier: 3, wob: 1.8 },                  // crater rim (blocked)
  { op: 'tier', shape: ell(88, 88, 19, 19), tier: 0, wob: 1.4, plaza: true },       // crater floor
  { op: 'tier', shape: rect(88, 88, 9, 62), tier: 0, wob: 0.8, plaza: true },       // N / S gates
  { op: 'tier', shape: rect(88, 88, 62, 9), tier: 0, wob: 0.8, plaza: true },       // E / W gates
  { op: 'tier', shape: ell(88, 88, 5.5, 5.5), tier: 1, wob: 0.8, plaza: true }      // watch island
];
const ops: Op[] = [...withMirror(half, S, 'rot'), ...crater];

const baseHalf = [
  mkBase([33, 33], Math.PI * 1.25, 'main'),
  mkBase([72, 20], -Math.PI / 2, 'natural'),
  mkBase([24, 86], Math.PI, 'third'),
  mkBase([54, 104], Math.PI / 2, 'third')
];
const bases = [...baseHalf, ...baseHalf.map(b => mirrorBase(b, S, 'rot'))];

export const craterCity: LevelDef = {
  id: 'crater_city',
  name: 'Crater City (2P Large)',
  subtitle: 'Red canyon ring around a walled crater',
  description: 'Large 176x176 two-player map in striated red canyon country: tier-3 mains, terraced naturals, low-ground thirds and fourths, and a walled central crater with four gates and a raised watch island.',
  size: S,
  theme: 'canyon',
  ops,
  bases,
  starts: [
    { base: 0, defense: [50, 31] },
    { base: 4, defense: mirrorPt([50, 31], S, 'rot') }
  ],
  props: [
    { kit: 'mesa_rock', zone: 'massif', density: 6, scale: [1, 1.7] },
    { kit: 'spire', zone: 'massif', density: 3, scale: [1, 1.6] },
    { kit: 'mesa_rock', zone: 'border', density: 8, scale: [1.2, 2] },
    { kit: 'boulder', zone: 'cliff', density: 2.5, scale: [0.35, 0.8] },
    { kit: 'pillar', zone: 'plaza', density: 0.5, scale: [0.9, 1.3], minDistBase: 14 },
    { kit: 'boulder', zone: 'open', density: 1.2, scale: [0.5, 1.2], minDistBase: 9 },
    { kit: 'pebbles', zone: 'open', density: 4, scale: [0.8, 1.6], minDistBase: 7 },
    { kit: 'deadtree', zone: 'open', density: 0.4, scale: [0.9, 1.4], minDistBase: 12 }
  ],
  richness: 1500
};
