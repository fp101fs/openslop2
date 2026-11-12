import { LevelDef, Op } from '../LevelTypes';
import { ell, mirrorBase, mirrorPt, mkBase, withMirror } from '../LevelHelpers';

/**
 * Alien Planet (M, 128x128, 2 players, 180° rotational symmetry). Bioluminescent blue world.
 * Per side: main (tier 2, ramp down) -> natural (tier 1, ramp down to the lowlands, single wide choke) -> low-ground
 * third behind a rock wall -> a side base on the far lane. A raised centre plateau (tier 1) with two ramps splits the middle.
 */
const S = 128;
const half: Op[] = [
  // main plateau + natural terrace
  { op: 'tier', shape: ell(27, 27, 18, 17), tier: 2, wob: 2, plaza: true },
  { op: 'tier', shape: ell(58, 20, 15, 12), tier: 1, wob: 2, plaza: true },
  { op: 'ramp', a: [40, 29], b: [51, 26], width: 5, t0: 2, t1: 1 },            // main -> natural
  { op: 'ramp', a: [66, 27], b: [76, 37], width: 8, t0: 1, t1: 0 },            // natural -> lowlands (the choke)
  // rock walls that shape the lanes (always cliffs)
  { op: 'massif', shape: ell(46, 52, 4.5, 9, 0.35), tier: 3, wob: 2 },
  { op: 'massif', shape: ell(14, 50, 6, 4), tier: 3, wob: 2 },                  // shelters the third base from the west lane
  { op: 'massif', shape: ell(38, 78, 5, 7, -0.4), tier: 3, wob: 2 },
  // centre plateau with a ramp at each end
  { op: 'tier', shape: ell(64, 64, 11, 6.5, Math.PI / 4), tier: 1, wob: 1.2, plaza: true },
  { op: 'ramp', a: [53, 53], b: [59.5, 59.5], width: 6, t0: 0, t1: 1 }
];
const ops: Op[] = withMirror(half, S, 'rot');

const baseHalf = [
  mkBase([27, 27], Math.PI * 1.25, 'main'),
  mkBase([58, 20], -Math.PI / 2, 'natural'),
  mkBase([24, 70], Math.PI, 'third'),
  mkBase([38, 102], Math.PI / 2, 'third')
];
const bases = [...baseHalf, ...baseHalf.map(b => mirrorBase(b, S, 'rot'))];

export const alienPlanet: LevelDef = {
  id: 'alien_planet',
  name: 'Alien Planet (2P Medium)',
  subtitle: 'Bioluminescent highlands, glowing crystal rock walls',
  description: 'Medium 128x128 two-player map on a bioluminescent alien world: tiered main and natural with ramps, a low-ground third behind rock walls, a raised centre plateau and crystal-studded cliffs.',
  size: S,
  theme: 'alien',
  ops,
  bases,
  starts: [
    { base: 0, defense: [41, 30] },
    { base: 4, defense: mirrorPt([41, 30], S, 'rot') }
  ],
  props: [
    { kit: 'alien_rock', zone: 'massif', density: 6, scale: [0.7, 1.3] },
    { kit: 'alien_crystal', zone: 'massif', density: 4, scale: [0.8, 1.5] },
    { kit: 'alien_rock', zone: 'border', density: 9, scale: [0.9, 1.7] },
    { kit: 'alien_crystal', zone: 'border', density: 5, scale: [0.8, 1.6] },
    { kit: 'alien_crystal', zone: 'cliff', density: 5, scale: [0.35, 0.7] },
    { kit: 'alien_rock', zone: 'cliff', density: 2.5, scale: [0.18, 0.4] },
    { kit: 'alien_pebble', zone: 'open', density: 5, scale: [0.8, 1.6], minDistBase: 7 },
    { kit: 'alien_vine', zone: 'open', density: 1.2, scale: [0.5, 0.9] },
    { kit: 'alien_pebble', zone: 'plaza', density: 2, scale: [0.8, 1.4] }
  ],
  richness: 1500
};
