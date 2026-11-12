import { LevelDef, Op } from '../LevelTypes';
import { ell, mirrorBase, mirrorPt, mkBase, rect, withMirror } from '../LevelHelpers';

/**
 * Mire River (design 160x160, 2 players, 180° rotational symmetry; shipped scaled up). Dark swamp split by a river.
 * A deep diagonal river (impassable) runs between the two halves; three stone fords are the only crossings. Each side has
 * a tier-2 main, a tier-1 natural, a low-ground third and a fourth, with gnarled dead trees and reed beds on the banks.
 */
const S = 160;
const half: Op[] = [
  { op: 'tier', shape: ell(28, 28, 18, 17), tier: 2, wob: 2, plaza: true },
  { op: 'tier', shape: ell(62, 22, 14, 13), tier: 1, wob: 1.6, plaza: true },
  { op: 'ramp', a: [41, 33], b: [52, 29], width: 5, t0: 2, t1: 1 },
  { op: 'ramp', a: [70, 32], b: [78, 41], width: 8, t0: 1, t1: 0 },
  { op: 'massif', shape: ell(14, 66, 6, 7), tier: 3, wob: 1.8 },
  { op: 'massif', shape: ell(54, 56, 5, 10, 0.5), tier: 3, wob: 2 },
  { op: 'massif', shape: ell(100, 14, 9, 5), tier: 3, wob: 1.8 }
];
const ops: Op[] = [
  ...withMirror(half, S, 'rot'),
  { op: 'pit', shape: rect(80, 80, 15, 260, Math.PI / 4), depth: 1, wob: 1.6, liquid: true },   // the river (NE-SW)
  { op: 'tier', shape: rect(80, 80, 30, 6.5, Math.PI / 4), tier: 0, wob: 0.6, plaza: true },     // central ford
  { op: 'tier', shape: rect(108, 52, 30, 6.5, Math.PI / 4), tier: 0, wob: 0.6, plaza: true },    // north-east ford
  { op: 'tier', shape: rect(52, 108, 30, 6.5, Math.PI / 4), tier: 0, wob: 0.6, plaza: true }     // south-west ford
];

const baseHalf = [
  mkBase([28, 28], Math.PI * 1.25, 'main'),
  mkBase([62, 18], -Math.PI / 2, 'natural'),
  mkBase([22, 76], Math.PI, 'third')
];
const bases = [...baseHalf, ...baseHalf.map(b => mirrorBase(b, S, 'rot'))];

export const mireRiver: LevelDef = {
  id: 'mire_river',
  name: 'Mire River (2P XL)',
  subtitle: 'Dark swamp, a river, three fords',
  description: 'Huge 320x320 two-player swamp map: a wide impassable river runs corner to corner with three stone fords, mains and naturals on raised ground, reed beds and dead trees along the banks and thick mangrove-like border forests.',
  size: S,
  theme: 'swamp',
  ops,
  bases,
  starts: [
    { base: 0, defense: [43, 33] },
    { base: 3, defense: mirrorPt([43, 33], S, 'rot') }
  ],
  props: [
    { kit: 'deadtree', zone: 'massif', density: 5, scale: [1, 1.7] },
    { kit: 'boulder', zone: 'massif', density: 3, scale: [1, 1.8] },
    { kit: 'deadtree', zone: 'border', density: 7, scale: [1, 1.8] },
    { kit: 'pine', zone: 'border', density: 8, scale: [1.1, 1.9] },
    { kit: 'bush', zone: 'cliff', density: 4, scale: [0.7, 1.3] },
    { kit: 'reeds', zone: 'cliff', density: 4, scale: [0.9, 1.5] },
    { kit: 'reeds', zone: 'open', density: 2, scale: [0.8, 1.4], minDistBase: 9 },
    { kit: 'bush', zone: 'open', density: 1.2, scale: [0.7, 1.3], minDistBase: 9 },
    { kit: 'deadtree', zone: 'open', density: 0.5, scale: [0.9, 1.5], minDistBase: 12 },
    { kit: 'pebbles', zone: 'plaza', density: 3, scale: [0.8, 1.4] }
  ],
  richness: 1500
};
