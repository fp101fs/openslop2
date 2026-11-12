import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Deadman's Port (Cutthroat) - Orlan and Mira Han. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const cutthroat = campaignLevel({
  id: 'wol_cutthroat', name: "Deadman's Port (Cutthroat)", subtitle: 'Orlan and Mira Han', description: 'Orlan and Mira Han', size: 128, theme: 'swamp',
  tiers: [[ell(108,64,14,14), 2, true], [ell(24,64,16,14), 2, true], [ell(64,24,10,10), 1, true], [ell(64,104,10,10), 1, true], [ell(30,100,10,10), 1, true], [ell(70,64,10,10), 1, true]],
  ramps: [[[96,64],[86,64],7,2,1]],
  massifs: [[ell(54,40,8,8), 3], [ell(54,90,8,8), 3], [ell(84,40,8,8), 3]],
  pits: [],
  bases: [mkBase([108,64], 0.785, 'main'), mkBase([24,64], 3.93, 'main'), mkBase([64,24], 0, 'natural'), mkBase([64,104], 0, 'natural'), mkBase([30,100], 0, 'natural')],
  home: 0, foe: 1
});
