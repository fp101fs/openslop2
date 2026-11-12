import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Redstone III (The Devil's Playground) - Mine 8000 minerals as the lava rises. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const the_devils_playground = campaignLevel({
  id: 'wol_the_devils_playground', name: "Redstone III (The Devil's Playground)", subtitle: 'Mine 8000 minerals as the lava rises', description: 'Mine 8000 minerals as the lava rises', size: 128, theme: 'sandstone',
  tiers: [[ell(24,64,16,16), 3, true], [ell(108,40,14,12), 2, true], [ell(64,100,12,12), 1, true], [ell(64,24,12,12), 2, true], [ell(108,100,12,12), 1, true]],
  ramps: [[[40,64],[52,64],8,3,1]],
  massifs: [[ell(64,64,10,12), 3], [ell(88,70,6,8), 3]],
  pits: [[ell(64,64,16,4), 1.4, true], [ell(84,90,8,5), 1.4, true]],
  bases: [mkBase([24,64], 0.785, 'main'), mkBase([108,40], 3.93, 'main'), mkBase([64,100], 0, 'natural'), mkBase([64,24], 0, 'natural'), mkBase([108,100], 0, 'natural')],
  home: 0, foe: 1
});
