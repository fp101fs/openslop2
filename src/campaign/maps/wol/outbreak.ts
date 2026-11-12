import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Meinhoff (Outbreak) - Infested colony under day and night. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const outbreak = campaignLevel({
  id: 'wol_outbreak', name: 'Meinhoff (Outbreak)', subtitle: 'Infested colony under day and night', description: 'Infested colony under day and night', size: 128, theme: 'swamp',
  tiers: [[ell(64,100,17,14), 2, true], [ell(20,64,12,12), 1, true], [ell(108,64,12,12), 1, true], [ell(64,24,14,12), 1, true], [ell(64,64,12,12), 1, true]],
  ramps: [[[64,88],[64,78],8,2,1]],
  massifs: [[ell(40,80,8,8), 3], [ell(90,80,8,8), 3], [ell(40,44,8,8), 3], [ell(90,44,8,8), 3]],
  pits: [[ell(64,50,6,6), 1.2, true]],
  bases: [mkBase([64,100], 0.785, 'main'), mkBase([64,24], 3.93, 'main'), mkBase([20,64], 0, 'natural'), mkBase([108,64], 0, 'natural'), mkBase([40,24], 0, 'natural'), mkBase([90,24], 0, 'natural')],
  home: 0, foe: 1
});
