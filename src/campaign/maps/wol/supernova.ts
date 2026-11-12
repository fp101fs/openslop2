import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Typhon XI (Supernova) - Race the wall of fire. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const supernova = campaignLevel({
  id: 'wol_supernova', name: 'Typhon XI (Supernova)', subtitle: 'Race the wall of fire', description: 'Race the wall of fire', size: 128, theme: 'sandstone',
  tiers: [[ell(40,90,16,14), 2, true], [ell(100,28,16,14), 2, true], [ell(100,100,12,12), 1, true], [ell(60,40,10,10), 1, true], [ell(24,30,10,10), 1, true]],
  ramps: [[[54,84],[64,78],7,2,1]],
  massifs: [[ell(70,64,10,8), 3], [ell(40,56,8,8), 3]],
  pits: [],
  bases: [mkBase([40,90], 0.785, 'main'), mkBase([100,28], 3.93, 'main'), mkBase([100,100], 0, 'natural'), mkBase([60,40], 0, 'natural')],
  home: 0, foe: 1
});
