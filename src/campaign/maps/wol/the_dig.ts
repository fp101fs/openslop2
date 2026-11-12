import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Xil (The Dig) - Siege the temple door. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const the_dig = campaignLevel({
  id: 'wol_the_dig', name: 'Xil (The Dig)', subtitle: 'Siege the temple door', description: 'Siege the temple door', size: 128, theme: 'sandstone',
  tiers: [[ell(30,100,18,16), 2, true], [ell(104,24,16,14), 2, true], [ell(100,90,10,10), 1, true], [ell(64,50,12,10), 1, true]],
  ramps: [[[46,92],[56,84],8,2,1]],
  massifs: [[ell(64,80,12,6), 3], [ell(84,60,8,8), 3], [ell(44,60,8,8), 3]],
  pits: [],
  bases: [mkBase([30,100], 0.785, 'main'), mkBase([104,24], 3.93, 'main'), mkBase([100,90], 0, 'natural')],
  home: 0, foe: 1
});
