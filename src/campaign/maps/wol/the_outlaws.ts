import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Mar Sara Digsite (The Outlaws) - Outlaw base and Dominion dig. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const the_outlaws = campaignLevel({
  id: 'wol_the_outlaws', name: 'Mar Sara Digsite (The Outlaws)', subtitle: 'Outlaw base and Dominion dig', description: 'Outlaw base and Dominion dig', size: 128, theme: 'sandstone',
  tiers: [[ell(24,100,17,15), 2, true], [ell(104,28,16,14), 2, true], [ell(14,60,10,10), 1, true], [rect(64,64,50,14,0.5), 1, false]],
  ramps: [[[38,92],[48,84],7,2,1], [[92,38],[84,48],7,2,1]],
  massifs: [[ell(50,50,9,9), 3], [ell(78,78,9,9), 3]],
  pits: [],
  bases: [mkBase([24,100], 0.785, 'main'), mkBase([104,28], 3.93, 'main'), mkBase([14,60], 0, 'natural')],
  home: 0, foe: 1
});
