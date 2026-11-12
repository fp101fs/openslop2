import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Bel'Shir (Welcome to the Jungle) - Terrazine and the altars. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const welcome_to_the_jungle = campaignLevel({
  id: 'wol_welcome_to_the_jungle', name: "Bel'Shir (Welcome to the Jungle)", subtitle: 'Terrazine and the altars', description: 'Terrazine and the altars', size: 128, theme: 'moss',
  tiers: [[ell(64,108,16,12), 2, true], [ell(28,24,18,14), 2, true], [ell(100,64,12,12), 1, true], [ell(64,64,12,12), 1, true], [ell(100,24,10,10), 1, true]],
  ramps: [[[64,96],[64,86],8,2,1]],
  massifs: [[ell(40,70,8,8), 3], [ell(90,90,8,8), 3], [ell(50,44,8,8), 3]],
  pits: [],
  bases: [mkBase([64,108], 0.785, 'main'), mkBase([28,24], 3.93, 'main'), mkBase([100,64], 0, 'natural'), mkBase([64,64], 0, 'natural')],
  home: 0, foe: 1
});
