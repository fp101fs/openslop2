import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Haven (Safe Haven) - Purifier over the colony. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const safe_haven = campaignLevel({
  id: 'wol_safe_haven', name: 'Haven (Safe Haven)', subtitle: 'Purifier over the colony', description: 'Purifier over the colony', size: 128, theme: 'frost',
  tiers: [[ell(64,24,17,14), 2, true], [ell(64,104,16,14), 2, true], [ell(24,64,12,12), 1, true], [ell(104,64,12,12), 1, true], [ell(64,64,10,10), 1, true]],
  ramps: [[[64,38],[64,48],8,2,1]],
  massifs: [[ell(40,44,8,8), 3], [ell(90,44,8,8), 3], [ell(40,84,8,8), 3], [ell(90,84,8,8), 3]],
  pits: [],
  bases: [mkBase([64,24], 0.785, 'main'), mkBase([64,104], 3.93, 'main'), mkBase([24,64], 0, 'natural'), mkBase([104,64], 0, 'natural'), mkBase([64,64], 0, 'natural')],
  home: 0, foe: 1
});
