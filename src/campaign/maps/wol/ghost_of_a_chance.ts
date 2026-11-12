import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Spectre Training Camp (Ghost of a Chance) - Three stealth sections. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const ghost_of_a_chance = campaignLevel({
  id: 'wol_ghost_of_a_chance', name: 'Spectre Training Camp (Ghost of a Chance)', subtitle: 'Three stealth sections', description: 'Three stealth sections', size: 128, theme: 'frost',
  tiers: [[ell(16,100,12,12), 1, true], [ell(112,28,14,14), 2, true], [rect(64,64,100,12,-0.6), 1, false], [ell(64,64,10,10), 2, true]],
  ramps: [[[100,40],[106,34],7,1,2]],
  massifs: [[ell(40,70,10,8), 3], [ell(88,60,10,8), 3], [ell(64,30,12,6), 3]],
  pits: [],
  bases: [mkBase([16,100], 0.785, 'main'), mkBase([112,28], 3.93, 'main')],
  home: 0, foe: 1, noResources: true
});
