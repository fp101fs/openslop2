import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Tarsonis (The Great Train Robbery) - Three tracks and eight trains. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const the_great_train_robbery = campaignLevel({
  id: 'wol_the_great_train_robbery', name: 'Tarsonis (The Great Train Robbery)', subtitle: 'Three tracks and eight trains', description: 'Three tracks and eight trains', size: 128, theme: 'canyon',
  tiers: [[ell(64,64,16,14), 1, true], [rect(64,40,120,6), 1, false], [rect(64,64,120,6), 1, false], [rect(64,92,120,6), 1, false], [ell(20,20,10,10), 1, true], [ell(108,108,10,10), 1, true]],
  ramps: [],
  massifs: [[ell(34,52,8,6), 3], [ell(94,76,8,6), 3], [ell(64,20,12,5), 3]],
  pits: [],
  bases: [mkBase([64,64], 0.785, 'main'), mkBase([108,20], 3.93, 'main'), mkBase([20,20], 0, 'natural'), mkBase([108,108], 0, 'natural')],
  home: 0, foe: 1
});
