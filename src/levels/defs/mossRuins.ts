import { LevelDef, Op } from '../LevelTypes';
import { ell, mirrorBase, mirrorPt, mkBase, rect, withMirror } from '../LevelHelpers';

/**
 * Moss Ruins (design 160x160, 2 players, 180° rotational symmetry; shipped scaled up). A ruined stone city.
 * Everything is built on square plazas: tier-2 mains, tier-1 natural platforms, a rotated diamond plaza in the middle with
 * ramps on all four corners, a low-ground third behind a ruined wall and a gold flank base.
 */
const S = 160;
const half: Op[] = [
  { op: 'tier', shape: rect(31, 31, 36, 34), tier: 2, wob: 0.9, plaza: true },       // main
  { op: 'tier', shape: rect(70, 27, 27, 25), tier: 1, wob: 0.9, plaza: true },       // natural platform
  { op: 'ramp', a: [48, 29], b: [58, 28], width: 6, t0: 2, t1: 1 },
  { op: 'ramp', a: [83, 32], b: [92, 41], width: 8, t0: 1, t1: 0 },
  { op: 'massif', shape: rect(54, 62, 9, 24, 0.35), tier: 3, wob: 1 },                 // ruined walls
  { op: 'massif', shape: rect(104, 44, 14, 8), tier: 3, wob: 1 },
  { op: 'massif', shape: rect(26, 122, 12, 9), tier: 3, wob: 1 },
  { op: 'tier', shape: rect(80, 80, 25, 25, Math.PI / 4), tier: 1, wob: 0.7, plaza: true },   // diamond plaza
  { op: 'ramp', a: [64, 64], b: [70, 70], width: 6, t0: 0, t1: 1 },                  // NW corner (mirror gives SE)
  { op: 'ramp', a: [96, 64], b: [90, 70], width: 6, t0: 0, t1: 1 }                   // NE corner (mirror gives SW)
];
const ops: Op[] = withMirror(half, S, 'rot');

const baseHalf = [
  mkBase([31, 31], Math.PI * 1.25, 'main'),
  mkBase([70, 22], -Math.PI / 2, 'natural'),
  mkBase([22, 84], Math.PI, 'third')
];
const bases = [...baseHalf, ...baseHalf.map(b => mirrorBase(b, S, 'rot'))];

export const mossRuins: LevelDef = {
  id: 'moss_ruins',
  name: 'Moss Ruins (2P XL)',
  subtitle: 'Square plazas, fallen walls, overgrown stone',
  description: 'Huge 288x288 two-player map in an overgrown ruined city: square-plaza mains and naturals, a rotated diamond plaza in the middle with four ramps, ruined walls, pillars and moss-covered rock.',
  size: S,
  theme: 'moss',
  ops,
  bases,
  starts: [
    { base: 0, defense: [50, 29] },
    { base: 3, defense: mirrorPt([50, 29], S, 'rot') }
  ],
  props: [
    { kit: 'pillar', zone: 'massif', density: 5, scale: [1, 1.8] },
    { kit: 'boulder', zone: 'massif', density: 4, scale: [1, 1.8] },
    { kit: 'pine', zone: 'border', density: 11, scale: [1.1, 1.9] },
    { kit: 'boulder', zone: 'border', density: 4, scale: [1, 1.8] },
    { kit: 'bush', zone: 'cliff', density: 4, scale: [0.7, 1.3] },
    { kit: 'boulder', zone: 'cliff', density: 3, scale: [0.4, 0.9] },
    { kit: 'pillar', zone: 'plaza', density: 0.6, scale: [0.8, 1.2], minDistBase: 14 },
    { kit: 'bush', zone: 'open', density: 1.3, scale: [0.7, 1.3], minDistBase: 9 },
    { kit: 'deadtree', zone: 'open', density: 0.35, scale: [0.9, 1.4], minDistBase: 12 },
    { kit: 'pebbles', zone: 'open', density: 3, scale: [0.8, 1.5], minDistBase: 7 }
  ],
  richness: 1500
};
