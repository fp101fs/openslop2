import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Char Platforms (Shatter the Sky) - Four cooling towers. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const shatter_the_sky = campaignLevel({
  id: 'wol_shatter_the_sky', name: 'Char Platforms (Shatter the Sky)', subtitle: 'Four cooling towers', description: 'Four cooling towers', size: 128, theme: 'canyon',
  tiers: [[ell(108,20,16,14), 2, true], [ell(24,108,14,12), 2, true], [ell(20,20,12,12), 1, true], [ell(108,108,12,12), 1, true], [ell(64,64,12,12), 1, true]],
  ramps: [[[96,28],[86,38],8,2,1]],
  massifs: [[ell(64,34,10,6), 3], [ell(64,94,10,6), 3]],
  pits: [],
  bases: [mkBase([108,20], 0.785, 'main'), mkBase([24,108], 3.93, 'main'), mkBase([20,20], 0, 'natural'), mkBase([108,108], 0, 'natural'), mkBase([64,64], 0, 'natural')],
  home: 0, foe: 1
});
