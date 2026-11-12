import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Thyrador VIII (The Moebius Factor) - Evacuate the Moebius Foundation. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const the_moebius_factor = campaignLevel({
  id: 'wol_the_moebius_factor', name: 'Thyrador VIII (The Moebius Factor)', subtitle: 'Evacuate the Moebius Foundation', description: 'Evacuate the Moebius Foundation', size: 128, theme: 'alien',
  tiers: [[ell(108,64,14,12), 2, true], [ell(20,64,12,12), 1, true], [ell(64,20,10,10), 1, true], [ell(64,108,10,10), 1, true], [ell(64,64,12,12), 2, true]],
  ramps: [[[96,64],[86,64],7,2,1]],
  massifs: [[ell(80,36,8,8), 3], [ell(80,92,8,8), 3], [ell(44,64,8,8), 3]],
  pits: [[ell(40,40,8,8), 1.6, true], [ell(40,88,8,8), 1.6, true]],
  bases: [mkBase([108,64], 0.785, 'main'), mkBase([20,64], 3.93, 'main'), mkBase([64,20], 0, 'natural'), mkBase([64,108], 0, 'natural')],
  home: 0, foe: 1
});
