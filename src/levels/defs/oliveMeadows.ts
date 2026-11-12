import { LevelDef, Op } from '../LevelTypes';
import { ell, mirrorBase, mirrorPt, mkBase, rect, withMirror } from '../LevelHelpers';

/**
 * Olive Meadows (design 160x160, 2 players, 180° rotational symmetry; shipped scaled up). West / east mains.
 * Each main has twin naturals (north-east and south-east terraces) behind separate ramps, a pond with a stone ford in
 * the middle, tree-covered rock walls and wide meadow lanes.
 */
const S = 160;
const half: Op[] = [
  { op: 'tier', shape: ell(27, 80, 18, 20), tier: 2, wob: 2, plaza: true },          // main
  { op: 'tier', shape: ell(56, 48, 14, 16), tier: 1, wob: 1.6, plaza: true },        // north natural
  { op: 'tier', shape: ell(56, 113, 13, 15), tier: 1, wob: 1.6, plaza: true },       // south natural
  { op: 'ramp', a: [38, 71], b: [48, 60], width: 6, t0: 2, t1: 1 },
  { op: 'ramp', a: [38, 90], b: [47, 101], width: 6, t0: 2, t1: 1 },
  { op: 'ramp', a: [64, 58], b: [73, 66], width: 8, t0: 1, t1: 0 },
  { op: 'ramp', a: [64, 104], b: [73, 97], width: 8, t0: 1, t1: 0 },
  { op: 'massif', shape: ell(74, 80, 3.5, 8, 0.1), tier: 3, wob: 1.6 },               // tree-covered wall in front of the main
  { op: 'massif', shape: ell(110, 34, 8, 5, 0.2), tier: 3, wob: 2 },
  { op: 'massif', shape: ell(30, 40, 6, 5), tier: 3, wob: 1.8 }
];
const ops: Op[] = [
  ...withMirror(half, S, 'rot'),
  { op: 'pit', shape: ell(80, 80, 14, 10.5), depth: 1, wob: 1.4, liquid: true },
  { op: 'tier', shape: rect(80, 80, 34, 5), tier: 0, wob: 0.6, plaza: true }          // stone ford across the pond
];

const baseHalf = [
  mkBase([27, 80], Math.PI, 'main'),
  mkBase([56, 46], -Math.PI / 2, 'natural'),
  mkBase([56, 115], Math.PI / 2, 'natural')
];
const bases = [...baseHalf, ...baseHalf.map(b => mirrorBase(b, S, 'rot'))];

export const oliveMeadows: LevelDef = {
  id: 'olive_meadows',
  name: 'Olive Meadows (2P Large)',
  subtitle: 'Pond ford, twin naturals, tree-ringed rock walls',
  description: 'Big 224x224 two-player meadow map: west and east mains with twin natural terraces each, a pond crossed by a stone ford, forested rock walls and long open lanes for macro play.',
  size: S,
  theme: 'meadow',
  ops,
  bases,
  starts: [
    { base: 0, defense: [40, 80] },
    { base: 3, defense: mirrorPt([40, 80], S, 'rot') }
  ],
  props: [
    { kit: 'pine', zone: 'massif', density: 9, scale: [0.9, 1.5] },
    { kit: 'boulder', zone: 'massif', density: 2, scale: [0.9, 1.5] },
    { kit: 'pine', zone: 'border', density: 12, scale: [1, 1.7] },
    { kit: 'boulder', zone: 'cliff', density: 3, scale: [0.35, 0.8] },
    { kit: 'bush', zone: 'cliff', density: 3, scale: [0.7, 1.2] },
    { kit: 'bush', zone: 'open', density: 1.2, scale: [0.7, 1.3], minDistBase: 9 },
    { kit: 'pine', zone: 'open', density: 0.5, scale: [0.8, 1.3], minDistBase: 14 },
    { kit: 'boulder', zone: 'open', density: 0.5, scale: [0.4, 0.9], minDistBase: 9 },
    { kit: 'pebbles', zone: 'plaza', density: 3, scale: [0.8, 1.4] }
  ],
  richness: 1500
};
