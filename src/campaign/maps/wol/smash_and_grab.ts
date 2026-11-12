import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Monlyth (Smash and Grab) - Race the Zerg to the artifact. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const smash_and_grab = campaignLevel({
  id: 'wol_smash_and_grab', name: 'Monlyth (Smash and Grab)', subtitle: 'Race the Zerg to the artifact', description: 'Race the Zerg to the artifact', size: 128, theme: 'canyon',
  tiers: [[ell(20,104,16,14), 2, true], [ell(104,30,18,14), 2, true], [ell(24,30,12,12), 1, true], [ell(104,100,12,12), 1, true], [rect(64,66,44,8,-0.6), 1, false]],
  ramps: [[[34,96],[44,88],7,2,1], [[92,38],[84,48],7,2,1]],
  massifs: [[ell(60,40,10,8), 3], [ell(70,92,10,8), 3]],
  pits: [[ell(64,64,7,7), 1.8, false]],
  bases: [mkBase([20,104], 0.785, 'main'), mkBase([104,30], 3.93, 'main'), mkBase([104,100], 0, 'natural'), mkBase([24,30], 0, 'natural')],
  home: 0, foe: 1
});
