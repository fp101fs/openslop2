import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Char Primary Hive (All-In) - Defend the Artifact. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const all_in = campaignLevel({
  id: 'wol_all_in', name: 'Char Primary Hive (All-In)', subtitle: 'Defend the Artifact', description: 'Defend the Artifact', size: 128, theme: 'canyon',
  tiers: [[ell(64,100,18,14), 3, true], [ell(64,16,14,12), 2, true], [ell(20,64,12,12), 1, true], [ell(108,64,12,12), 1, true], [ell(64,64,12,10), 1, true]],
  ramps: [[[46,92],[36,82],9,3,1], [[82,92],[92,82],9,3,1]],
  massifs: [[ell(40,40,10,10), 3], [ell(88,40,10,10), 3]],
  pits: [],
  bases: [mkBase([64,100], 0.785, 'main'), mkBase([64,16], 3.93, 'main'), mkBase([20,64], 0, 'natural'), mkBase([108,64], 0, 'natural')],
  home: 0, foe: 1
});
