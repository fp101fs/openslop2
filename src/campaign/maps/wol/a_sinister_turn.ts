import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Zhakul (A Sinister Turn) - Wake the Preservers. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const a_sinister_turn = campaignLevel({
  id: 'wol_a_sinister_turn', name: 'Zhakul (A Sinister Turn)', subtitle: 'Wake the Preservers', description: 'Wake the Preservers', size: 128, theme: 'alien',
  tiers: [[ell(64,100,16,14), 2, true], [ell(64,24,16,14), 2, true], [ell(20,64,12,12), 1, true], [ell(108,64,12,12), 1, true], [ell(64,64,12,12), 1, true]],
  ramps: [[[64,88],[64,78],8,2,1]],
  massifs: [[ell(40,44,8,8), 3], [ell(88,44,8,8), 3], [ell(40,86,8,8), 3], [ell(88,86,8,8), 3]],
  pits: [],
  bases: [mkBase([64,100], 0.785, 'main'), mkBase([64,24], 3.93, 'main'), mkBase([20,64], 0, 'natural'), mkBase([108,64], 0, 'natural')],
  home: 0, foe: 1
});
