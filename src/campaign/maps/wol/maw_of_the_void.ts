import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Sigma Quadrant (Maw of the Void) - Derelict ship and Rip-Fields. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const maw_of_the_void = campaignLevel({
  id: 'wol_maw_of_the_void', name: 'Sigma Quadrant (Maw of the Void)', subtitle: 'Derelict ship and Rip-Fields', description: 'Derelict ship and Rip-Fields', size: 128, theme: 'alien',
  tiers: [[ell(24,104,14,12), 2, true], [ell(104,24,16,14), 2, true], [ell(64,64,12,12), 2, true], [ell(104,104,10,10), 2, true], [ell(24,24,10,10), 2, true]],
  ramps: [],
  massifs: [[ell(44,64,6,16), 3], [ell(84,64,6,16), 3]],
  pits: [[ell(64,30,12,5), 2, false], [ell(64,98,12,5), 2, false], [ell(30,64,5,12), 2, false], [ell(98,64,5,12), 2, false]],
  bases: [mkBase([24,104], 0.785, 'main'), mkBase([104,24], 3.93, 'main'), mkBase([64,64], 0, 'natural'), mkBase([104,104], 0, 'natural'), mkBase([24,24], 0, 'natural')],
  home: 0, foe: 1
});
