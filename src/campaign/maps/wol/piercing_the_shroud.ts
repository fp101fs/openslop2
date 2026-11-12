import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Dominion Research Platform (Piercing the Shroud) - Lab corridors and a chase. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const piercing_the_shroud = campaignLevel({
  id: 'wol_piercing_the_shroud', name: 'Dominion Research Platform (Piercing the Shroud)', subtitle: 'Lab corridors and a chase', description: 'Lab corridors and a chase', size: 128, theme: 'frost',
  tiers: [[rect(40,100,50,10), 1, true], [rect(70,70,10,50), 1, true], [rect(90,40,50,10), 1, true], [ell(112,24,12,12), 2, true], [ell(14,100,8,8), 1, true]],
  ramps: [],
  massifs: [[ell(40,60,12,18), 3], [ell(90,80,12,18), 3]],
  pits: [],
  bases: [mkBase([14,100], 0.785, 'main'), mkBase([112,24], 3.93, 'main')],
  home: 0, foe: 1, noResources: true
});
