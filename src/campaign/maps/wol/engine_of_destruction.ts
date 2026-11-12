import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Valhalla (Engine of Destruction) - Five Dominion bases. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const engine_of_destruction = campaignLevel({
  id: 'wol_engine_of_destruction', name: 'Valhalla (Engine of Destruction)', subtitle: 'Five Dominion bases', description: 'Five Dominion bases', size: 128, theme: 'canyon',
  tiers: [[ell(20,108,14,12), 1, true], [ell(24,60,10,10), 1, true], [ell(64,30,10,10), 1, true], [ell(100,70,12,12), 1, true], [ell(64,90,10,10), 1, true], [ell(108,20,14,12), 2, true]],
  ramps: [],
  massifs: [[ell(50,70,6,10), 3], [ell(80,50,6,10), 3]],
  pits: [],
  bases: [mkBase([20,108], 0.785, 'main'), mkBase([108,20], 3.93, 'main'), mkBase([24,60], 0, 'natural'), mkBase([64,30], 0, 'natural'), mkBase([100,70], 0, 'natural'), mkBase([64,90], 0, 'natural')],
  home: 0, foe: 1
});
