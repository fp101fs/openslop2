import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Char (Gates of Hell) - Surrounded base and drop pods. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const gates_of_hell = campaignLevel({
  id: 'wol_gates_of_hell', name: 'Char (Gates of Hell)', subtitle: 'Surrounded base and drop pods', description: 'Surrounded base and drop pods', size: 128, theme: 'canyon',
  tiers: [[ell(64,64,18,16), 2, true], [ell(20,20,12,12), 1, true], [ell(20,108,12,12), 1, true], [ell(64,16,10,10), 1, true], [ell(108,100,10,10), 1, true], [ell(108,24,12,12), 1, true]],
  ramps: [[[64,50],[64,40],9,2,1], [[64,78],[64,88],9,2,1]],
  massifs: [[ell(40,64,8,10), 3], [ell(90,64,8,10), 3]],
  pits: [],
  bases: [mkBase([64,64], 0.785, 'main'), mkBase([108,24], 3.93, 'main'), mkBase([20,20], 0, 'natural'), mkBase([20,108], 0, 'natural'), mkBase([64,16], 0, 'natural'), mkBase([108,100], 0, 'natural')],
  home: 0, foe: 1
});
